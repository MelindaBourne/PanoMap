/* js/db.js — Storage layer
 *   - IndexedDB  → panorama image blobs
 *   - localStorage → user accounts + panorama metadata
 */
const DB = {
  _db: null,

  /* ── IndexedDB init ──────────────────────────────── */
  init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { this._db = req.result; resolve(); };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images');
        }
      };
    });
  },

  /* ── Image CRUD ──────────────────────────────────── */
  storeImage(id, blob) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['images'], 'readwrite');
      const st = tx.objectStore('images');
      const req = st.put(blob, id);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  },

  getImage(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(['images'], 'readonly');
      const req = tx.objectStore('images').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  },

  deleteImage(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(['images'], 'readwrite');
      const req = tx.objectStore('images').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  },

  /* ── Panorama metadata (localStorage) ───────────── */
  getAllPanos() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.LS_PANOS) || '[]');
    } catch { return []; }
  },

  getPano(id) {
    return this.getAllPanos().find(p => p.id === id) || null;
  },

  savePano(pano) {
    const list  = this.getAllPanos();
    const index = list.findIndex(p => p.id === pano.id);
    if (index >= 0) list[index] = pano; else list.push(pano);
    localStorage.setItem(CONFIG.LS_PANOS, JSON.stringify(list));
  },

  deletePano(id) {
    const list = this.getAllPanos().filter(p => p.id !== id);
    localStorage.setItem(CONFIG.LS_PANOS, JSON.stringify(list));
  },

  /* ── User accounts (localStorage) ───────────────── */
  getAllUsers() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.LS_USERS) || '[]');
    } catch { return []; }
  },

  getUser(username) {
    return this.getAllUsers().find(u => u.username === username) || null;
  },

  saveUser(user) {
    const list  = this.getAllUsers();
    const index = list.findIndex(u => u.id === user.id);
    if (index >= 0) list[index] = user; else list.push(user);
    localStorage.setItem(CONFIG.LS_USERS, JSON.stringify(list));
  },
};
