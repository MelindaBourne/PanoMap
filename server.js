require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { PORT, AMAP_API_KEY } = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/groups', require('./routes/groups'));

// AMap API key endpoint
// Note: The AMap key is intentionally served to the frontend (browser-side rendering).
// In AMap's security model, keys are domain-restricted via the AMap console.
// Restrict access to the key by configuring allowed domains in your AMap dashboard.
app.get('/api/config', (req, res) => {
  res.json({ amapKey: AMAP_API_KEY });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 50MB' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PanoMap server running on http://localhost:${PORT}`);
});

module.exports = app;
