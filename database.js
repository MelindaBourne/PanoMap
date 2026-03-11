const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'panomap.db');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable WAL mode and foreign keys
  await dbInstance.exec('PRAGMA journal_mode = WAL');
  await dbInstance.exec('PRAGMA foreign_keys = ON');

  // Initialize tables
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      user_id INTEGER NOT NULL,
      color TEXT DEFAULT '#3B82F6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      filename TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      group_id INTEGER,
      user_id INTEGER NOT NULL,
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE SET NULL
    );
  `);

  return dbInstance;
}

module.exports = { getDb };
