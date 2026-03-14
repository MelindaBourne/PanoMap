/* js/auth.js — User authentication
 *   Passwords hashed with PBKDF2-SHA-256 using a unique per-user salt (Web Crypto API).
 *   Session persisted to localStorage.
 */
const Auth = {
  currentUser: null,

  /* ── Init: restore session ───────────────────────── */
  async init() {
    // Check for an existing session
    let sessionValid = false;
    try {
      const raw = localStorage.getItem(CONFIG.LS_SESSION);
      if (raw) {
        const session = JSON.parse(raw);
        const user    = DB.getUser(session.username);
        if (user && user.id === session.id) {
          this.currentUser = user;
          sessionValid = true;
        }
      }
    } catch { /* ignore corrupted session data */ }

    if (sessionValid) return true;

    // Seed demo account if no users exist yet
    if (DB.getAllUsers().length === 0) await this._seedDemo();
    return false;
  },

  async _seedDemo() {
    const { hash, salt } = await this._hashPassword('demo123');
    DB.saveUser({
      id: 'demo',
      username: 'demo',
      email: 'demo@panomap.app',
      password: hash,
      salt,
      createdAt: new Date().toISOString(),
    });

    // Seed two remote-URL demo panoramas (no local blob needed)
    const demos = [
      {
        id: 'demo_pano_1',
        name: '广阔草原',
        group: '自然风光',
        description: '辽阔的草原全景示例',
        lat: 43.7, lng: 116.4,
        thumbnail: 'https://pannellum.org/images/jfk.jpg',
        imageUrl:  'https://pannellum.org/images/jfk.jpg',
        isRemote: true,
        ownerId: 'demo', ownerName: 'demo',
        uploadTime: new Date().toISOString(),
      },
      {
        id: 'demo_pano_2',
        name: '山顶日落',
        group: '自然风光',
        description: '山顶俯瞰全景示例',
        lat: 30.06, lng: 120.12,
        thumbnail: 'https://pannellum.org/images/alma.jpg',
        imageUrl:  'https://pannellum.org/images/alma.jpg',
        isRemote: true,
        ownerId: 'demo', ownerName: 'demo',
        uploadTime: new Date().toISOString(),
      },
    ];
    demos.forEach(p => DB.savePano(p));
  },

  /* ── PBKDF2 helpers ──────────────────────────────── */

  /** Hash a password with a new random salt; returns { hash, salt } as hex strings. */
  async _hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this._deriveKey(password, salt);
    return {
      hash: this._toHex(hash),
      salt: this._toHex(salt),
    };
  },

  /** Verify a plaintext password against a stored hash + hex salt. */
  async _verifyPassword(password, storedHash, storedSalt) {
    const salt = this._fromHex(storedSalt);
    const hash = await this._deriveKey(password, salt);
    return this._toHex(hash) === storedHash;
  },

  async _deriveKey(password, salt) {
    const enc      = new TextEncoder();
    const keyMat   = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    return crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
      keyMat,
      256
    );
  },

  _toHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  _fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  },

  /* ── Login ───────────────────────────────────────── */
  async login(username, password) {
    const user = DB.getUser(username);
    if (!user) throw new Error('用户名不存在');

    let valid;
    if (user.salt) {
      // New PBKDF2 format
      valid = await this._verifyPassword(password, user.password, user.salt);
    } else {
      // Legacy SHA-256 format (upgrade on next login)
      const enc  = new TextEncoder();
      const data = enc.encode(password + 'panomap_v1');
      const buf  = await crypto.subtle.digest('SHA-256', data);
      const hash = this._toHex(buf);
      valid = hash === user.password;
      if (valid) {
        // Migrate to PBKDF2
        const upgraded = await this._hashPassword(password);
        user.password = upgraded.hash;
        user.salt     = upgraded.salt;
        DB.saveUser(user);
      }
    }
    if (!valid) throw new Error('密码错误');
    this._setSession(user);
    return user;
  },

  /* ── Register ────────────────────────────────────── */
  async register(username, email, password, confirm) {
    if (!username || username.trim().length < 3) throw new Error('用户名至少 3 个字符');
    if (password.length < 6) throw new Error('密码至少 6 个字符');
    if (password !== confirm)  throw new Error('两次密码不一致');
    if (DB.getUser(username))  throw new Error('用户名已存在');

    const { hash, salt } = await this._hashPassword(password);
    const user = {
      id: 'u_' + Date.now(),
      username: username.trim(),
      email: email ? email.trim() : '',
      password: hash,
      salt,
      createdAt: new Date().toISOString(),
    };
    DB.saveUser(user);
    this._setSession(user);
    return user;
  },

  /* ── Logout ──────────────────────────────────────── */
  logout() {
    this.currentUser = null;
    localStorage.removeItem(CONFIG.LS_SESSION);
  },

  /* ── Helpers ─────────────────────────────────────── */
  _setSession(user) {
    this.currentUser = user;
    localStorage.setItem(CONFIG.LS_SESSION, JSON.stringify({ id: user.id, username: user.username }));
  },

  canEdit(ownerId) {
    return this.currentUser && this.currentUser.id === ownerId;
  },
};

