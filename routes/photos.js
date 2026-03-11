const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { getDb } = require('../database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { MAX_FILE_SIZE } = require('../config');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'originals');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Generate thumbnail
async function generateThumbnail(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(300, 150, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}

// Photo query helper
const PHOTO_SELECT = `
  SELECT p.*, u.username, g.name as group_name, g.color as group_color
  FROM photos p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN groups_table g ON p.group_id = g.id
`;

// Get all photos (public) with optional search and group filter
router.get('/', generalLimiter, optionalAuth, async (req, res) => {
  const { search, group_id } = req.query;
  let query = PHOTO_SELECT + ' WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (group_id) {
    query += ' AND p.group_id = ?';
    params.push(parseInt(group_id));
  }

  query += ' ORDER BY p.created_at DESC';

  try {
    const db = await getDb();
    const photos = await db.all(query, ...params);
    res.json({ photos });
  } catch (err) {
    console.error('Get photos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single photo
router.get('/:id', generalLimiter, async (req, res) => {
  try {
    const db = await getDb();
    const photo = await db.get(PHOTO_SELECT + ' WHERE p.id = ?', parseInt(req.params.id));

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Increment view count
    await db.run('UPDATE photos SET view_count = view_count + 1 WHERE id = ?', photo.id);

    res.json({ photo });
  } catch (err) {
    console.error('Get photo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload photo (requires auth)
router.post('/', uploadLimiter, authenticate, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo file provided' });
  }

  const { name, description, lat, lng, group_id } = req.body;

  if (!name || !name.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Photo name is required' });
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (isNaN(parsedLat) || isNaN(parsedLng) ||
      parsedLat < -90 || parsedLat > 90 ||
      parsedLng < -180 || parsedLng > 180) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Valid coordinates are required' });
  }

  try {
    // Generate thumbnail
    const thumbDir = path.join(__dirname, '..', 'uploads', 'thumbnails');
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const thumbFilename = 'thumb_' + req.file.filename.replace(/\.[^.]+$/, '.jpg');
    const thumbPath = path.join(thumbDir, thumbFilename);

    await generateThumbnail(req.file.path, thumbPath);

    const db = await getDb();
    const result = await db.run(
      `INSERT INTO photos (name, description, filename, thumbnail, lat, lng, group_id, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      name.trim(),
      description || null,
      req.file.filename,
      thumbFilename,
      parsedLat,
      parsedLng,
      group_id ? parseInt(group_id) : null,
      req.user.id
    );

    const photo = await db.get(PHOTO_SELECT + ' WHERE p.id = ?', result.lastID);
    res.status(201).json({ photo });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload photo error:', err);
    res.status(500).json({ error: 'Failed to process photo' });
  }
});

// Update photo (requires auth, owner only)
router.put('/:id', generalLimiter, authenticate, async (req, res) => {
  const photoId = parseInt(req.params.id);
  const { name, description, lat, lng, group_id } = req.body;

  try {
    const db = await getDb();
    const photo = await db.get('SELECT * FROM photos WHERE id = ?', photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    if (photo.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const parsedLat = lat !== undefined ? parseFloat(lat) : photo.lat;
    const parsedLng = lng !== undefined ? parseFloat(lng) : photo.lng;

    await db.run(
      `UPDATE photos SET name = ?, description = ?, lat = ?, lng = ?, group_id = ? WHERE id = ?`,
      name || photo.name,
      description !== undefined ? description : photo.description,
      parsedLat,
      parsedLng,
      group_id !== undefined ? (group_id ? parseInt(group_id) : null) : photo.group_id,
      photoId
    );

    const updated = await db.get(PHOTO_SELECT + ' WHERE p.id = ?', photoId);
    res.json({ photo: updated });
  } catch (err) {
    console.error('Update photo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete photo (requires auth, owner only)
router.delete('/:id', generalLimiter, authenticate, async (req, res) => {
  const photoId = parseInt(req.params.id);

  try {
    const db = await getDb();
    const photo = await db.get('SELECT * FROM photos WHERE id = ?', photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    if (photo.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Delete database record first
    await db.run('DELETE FROM photos WHERE id = ?', photoId);

    // Delete files (non-blocking, errors are logged but don't fail the request)
    const origPath = path.join(__dirname, '..', 'uploads', 'originals', photo.filename);
    const thumbPath = path.join(__dirname, '..', 'uploads', 'thumbnails', photo.thumbnail);

    try {
      if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
    } catch (e) {
      console.warn('Failed to delete original file:', origPath, e.message);
    }
    try {
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    } catch (e) {
      console.warn('Failed to delete thumbnail file:', thumbPath, e.message);
    }
    res.json({ message: 'Photo deleted successfully' });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
