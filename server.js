'use strict';

// Load environment variables from .env file (if present)
try { require('dotenv').config(); } catch { /* dotenv not installed */ }

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'panomap-dev-secret-change-in-production';
const AMAP_API_KEY = process.env.AMAP_API_KEY || 'YOUR_AMAP_API_KEY';
const MAP_DEFAULT_CENTER = (process.env.MAP_DEFAULT_CENTER || '116.397428,39.90923')
  .split(',')
  .map(Number);
const MAP_DEFAULT_ZOOM = parseInt(process.env.MAP_DEFAULT_ZOOM || '11', 10);

// Ensure required directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

[DATA_DIR, UPLOADS_DIR, THUMBNAILS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Database ────────────────────────────────────────────────────────────────

const db = new Database(path.join(DATA_DIR, 'panomap.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    UNIQUE NOT NULL,
    password  TEXT    NOT NULL,
    email     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS panoramas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    group_name  TEXT    DEFAULT '未分组',
    filename    TEXT    NOT NULL,
    thumbnail   TEXT,
    lat         REAL    NOT NULL,
    lng         REAL    NOT NULL,
    user_id     INTEGER NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── File upload ──────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('只支持 JPG、PNG、WebP 格式的图片文件'));
    }
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Try to generate a thumbnail using the optional `sharp` module.
 * Returns the relative path (e.g. "thumbnails/thumb_xxx.jpg") or null.
 */
async function generateThumbnail(sourceFilename) {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const sharp = require('sharp');
    const sourcePath = path.join(UPLOADS_DIR, sourceFilename);
    const thumbName = `thumb_${path.basename(sourceFilename, path.extname(sourceFilename))}.jpg`;
    const thumbPath = path.join(THUMBNAILS_DIR, thumbName);

    await sharp(sourcePath)
      .resize(400, 240, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    return `thumbnails/${thumbName}`;
  } catch (_e) {
    // sharp is optional – fall back to using the original image
    return null;
  }
}

function safeUnlink(filePath) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to delete file:', filePath, err.message);
    }
  });
}

// ── Auth middleware ──────────────────────────────────────────────────────────

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '需要登录' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Strict limit for auth routes (login / register) – prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请 15 分钟后重试' },
});

// General API limit for all other routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后重试' },
});

// ── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: '用户名至少需要 3 个字符' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少需要 6 个字符' });
  }

  const cleanUsername = username.trim();

  try {
    const hashed = await bcrypt.hash(password, 10);
    const stmt = db.prepare(
      'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
    );
    const result = stmt.run(cleanUsername, hashed, email || null);
    const token = jwt.sign(
      { id: result.lastInsertRowid, username: cleanUsername },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.status(201).json({ token, user: { id: result.lastInsertRowid, username: cleanUsername } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '该用户名已被使用' });
    }
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: '用户名或密码错误' });

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  res.json({ token, user: { id: user.id, username: user.username } });
});

// ── Config route (safe – only exposes public config) ─────────────────────────

app.get('/api/config', apiLimiter, (_req, res) => {
  res.json({
    amapKey: AMAP_API_KEY,
    mapCenter: MAP_DEFAULT_CENTER,
    mapZoom: MAP_DEFAULT_ZOOM,
  });
});

// ── Panorama routes ──────────────────────────────────────────────────────────

app.get('/api/panoramas', apiLimiter, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, u.username
       FROM panoramas p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.group_name, p.created_at DESC`,
    )
    .all();
  res.json(rows);
});

app.get('/api/panoramas/:id', apiLimiter, (req, res) => {
  const row = db
    .prepare(
      `SELECT p.*, u.username
       FROM panoramas p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: '全景照片不存在' });
  res.json(row);
});

app.post('/api/panoramas', apiLimiter, authRequired, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择要上传的图片文件' });

  const { title, description, group_name, lat, lng } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    safeUnlink(path.join(UPLOADS_DIR, req.file.filename));
    return res.status(400).json({ error: '请输入标题' });
  }
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) {
    safeUnlink(path.join(UPLOADS_DIR, req.file.filename));
    return res.status(400).json({ error: '请设置有效的位置坐标' });
  }

  try {
    const thumbnail = await generateThumbnail(req.file.filename);

    const result = db
      .prepare(
        `INSERT INTO panoramas (title, description, group_name, filename, thumbnail, lat, lng, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        title.trim(),
        (description || '').trim(),
        (group_name || '未分组').trim() || '未分组',
        req.file.filename,
        thumbnail,
        latNum,
        lngNum,
        req.user.id,
      );

    const row = db
      .prepare(
        `SELECT p.*, u.username
         FROM panoramas p
         JOIN users u ON p.user_id = u.id
         WHERE p.id = ?`,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(row);
  } catch (err) {
    safeUnlink(path.join(UPLOADS_DIR, req.file.filename));
    res.status(500).json({ error: '保存失败，请稍后重试' });
  }
});

app.delete('/api/panoramas/:id', apiLimiter, authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM panoramas WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '全景照片不存在' });
  if (row.user_id !== req.user.id) {
    return res.status(403).json({ error: '无权删除他人的全景照片' });
  }

  safeUnlink(path.join(UPLOADS_DIR, row.filename));
  if (row.thumbnail) {
    safeUnlink(path.join(UPLOADS_DIR, row.thumbnail));
  }

  db.prepare('DELETE FROM panoramas WHERE id = ?').run(row.id);
  res.json({ success: true });
});

// ── Error handling ────────────────────────────────────────────────────────────

// Multer errors and other request errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小不能超过 100MB' });
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: '不允许的文件字段' });
  }
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: '服务器内部错误' });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🗺  PanoMap is running at  http://localhost:${PORT}\n`);
  if (AMAP_API_KEY === 'YOUR_AMAP_API_KEY') {
    console.warn(
      '⚠️  AMAP_API_KEY is not configured.\n' +
      '   Set it in a .env file to enable the map. See .env.example for details.\n',
    );
  }
});
