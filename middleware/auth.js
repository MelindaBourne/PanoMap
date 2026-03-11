const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { JWT_SECRET } = require('../config');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDb();
    const user = await db.get('SELECT id, username, email FROM users WHERE id = ?', decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDb();
    const user = await db.get('SELECT id, username, email FROM users WHERE id = ?', decoded.id);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Ignore invalid token for optional auth
  }
  next();
}

module.exports = { authenticate, optionalAuth };
