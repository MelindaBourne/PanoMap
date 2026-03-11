/**
 * Centralized configuration
 * All environment-sensitive settings should be read here.
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

module.exports = {
  // JWT secret — MUST be set via environment variable in production
  JWT_SECRET: JWT_SECRET || 'panomap-dev-secret-DO-NOT-USE-IN-PRODUCTION',

  // AMap API key
  AMAP_API_KEY: process.env.AMAP_API_KEY || 'YOUR_AMAP_API_KEY',

  // Default map center (Beijing)
  DEFAULT_MAP_CENTER: [116.397428, 39.90923],
  DEFAULT_MAP_ZOOM: 11,

  // Upload limits
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB

  // Server port
  PORT: parseInt(process.env.PORT) || 3000
};
