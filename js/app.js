/* js/app.js — Main application controller */
const App = {
  _initialized:    false,
  _mapUnavailable: false,

  /* ══════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════ */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      await DB.init();
    } catch (e) {
      console.error('IndexedDB init failed:', e);
    }

    const loggedIn = await Auth.init();

    if (loggedIn) {
      this._showApp();
    } else {
      this._showAuth();
    }

    this._bindGlobalEvents();
  },

  _showAuth() {
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  _showApp() {
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Update username displays
    const name = Auth.currentUser.username;
    document.getElementById('user-name-hd').textContent   = name;
    document.getElementById('user-name-menu').textContent = name;

    // Init map (only if Amap SDK is loaded)
    if (typeof AMap !== 'undefined') {
      MapMod.initMainMap();
    } else {
      document.getElementById('map').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;flex-direction:column;gap:12px;background:#f1f5f9">' +
        '<i class="fas fa-map fa-3x" style="color:#cbd5e1"></i>' +
        '<p style="font-size:15px">地图加载中，请稍候…</p></div>';
    }

    // Render sidebar
    this._renderSidebar();

    // Open sidebar by default on desktop
    if (window.innerWidth > 768) this._openSidebar();
  },

  /* ══════════════════════════════════════════════════
     EVENT BINDING
     ══════════════════════════════════════════════════ */
  _bindGlobalEvents() {
    /* ─── Auth ─────────────────────────────────────── */
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleLogin();
    });
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleRegister();
    });
    document.getElementById('demo-login-btn').addEventListener('click', () => {
      document.getElementById('login-username').value = 'demo';
      document.getElementById('login-password').value = 'demo123';
      this._handleLogin();
    });

    // Tab switch buttons
    document.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchAuthTab(btn.dataset.tab));
    });
    document.querySelectorAll('[data-switch]').forEach(btn => {
      btn.addEventListener('click', () => this._switchAuthTab(btn.dataset.switch));
    });

    /* ─── User menu ────────────────────────────────── */
    document.getElementById('user-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = document.getElementById('user-menu');
      m.classList.toggle('hidden');
      document.getElementById('user-btn').setAttribute('aria-expanded', !m.classList.contains('hidden'));
    });
    document.addEventListener('click', () => {
      document.getElementById('user-menu').classList.add('hidden');
    });
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      PanoViewer.close();
      this._showAuth();
    });

    /* ─── Sidebar ──────────────────────────────────── */
    document.getElementById('sidebar-toggle').addEventListener('click', () => this._toggleSidebar());
    document.getElementById('sidebar-close').addEventListener('click',  () => this._closeSidebar());

    // Backdrop (mobile)
    const backdrop = document.createElement('div');
    backdrop.id = 'sb-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => this._closeSidebar());

    /* ─── Upload ───────────────────────────────────── */
    document.getElementById('upload-btn').addEventListener('click', () => this._openUploadModal());
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleUpload();
    });
    document.getElementById('gps-btn').addEventListener('click', () => this._getGPS());
    this._initDropZone();

    /* ─── Edit ─────────────────────────────────────── */
    document.getElementById('edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleEdit();
    });

    /* ─── Panorama close ───────────────────────────── */
    document.getElementById('pano-close-btn').addEventListener('click', () => PanoViewer.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('pano-overlay').classList.contains('hidden')) {
          PanoViewer.close();
        }
      }
    });

    /* ─── Search ───────────────────────────────────── */
    const si = document.getElementById('search-input');
    si.addEventListener('input',  (e) => this._handleSearch(e.target.value));
    si.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeSearch(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) this._closeSearch();
    });

    /* ─── Close modal via data-close ──────────────── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-close]');
      if (btn) this._closeModal(btn.dataset.close);
    });

    /* ─── Close overlay on backdrop click ─────────── */
    document.querySelectorAll('.overlay').forEach(ov => {
      if (ov.id === 'auth-overlay' || ov.id === 'loading-overlay') return;
      ov.addEventListener('click', (e) => {
        if (e.target === ov) this._closeModal(ov.id);
      });
    });

    /* ─── Mobile search toggle ─────────────────────── */
    // inject search icon button into header right
    const searchToggle = document.createElement('button');
    searchToggle.id = 'search-toggle-btn';
    searchToggle.className = 'icon-btn';
    searchToggle.title = '搜索';
    searchToggle.setAttribute('aria-label', '搜索');
    searchToggle.innerHTML = '<i class="fas fa-search"></i>';
    document.getElementById('app-header').querySelector('.hd-right').prepend(searchToggle);
    searchToggle.addEventListener('click', () => {
      document.getElementById('app-header').classList.toggle('search-open');
      if (document.getElementById('app-header').classList.contains('search-open')) {
        document.getElementById('search-input').focus();
      }
    });
    // Close search bar when blurred (mobile)
    si.addEventListener('blur', () => {
      setTimeout(() => {
        if (!document.querySelector('.search-drop:hover')) {
          document.getElementById('app-header').classList.remove('search-open');
        }
      }, 200);
    });
  },

  /* ══════════════════════════════════════════════════
     AUTH HANDLERS
     ══════════════════════════════════════════════════ */
  _switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', t.dataset.tab === tab);
    });
    document.getElementById('login-form').classList.toggle('hidden',    tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  },

  async _handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) { this.toast('请填写用户名和密码', 'warning'); return; }
    try {
      await Auth.login(username, password);
      this._showApp();
    } catch (e) { this.toast(e.message, 'error'); }
  },

  async _handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    try {
      await Auth.register(username, email, password, confirm);
      this._showApp();
      this.toast('注册成功，欢迎使用 PanoMap！', 'success');
    } catch (e) { this.toast(e.message, 'error'); }
  },

  /* ══════════════════════════════════════════════════
     SIDEBAR
     ══════════════════════════════════════════════════ */
  _toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
      sb.classList.toggle('sb-open');
      document.getElementById('sb-backdrop').classList.toggle('visible', sb.classList.contains('sb-open'));
    } else {
      sb.classList.toggle('sb-closed');
    }
  },

  _openSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
      sb.classList.add('sb-open');
      document.getElementById('sb-backdrop').classList.add('visible');
    } else {
      sb.classList.remove('sb-closed');
    }
  },

  _closeSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.remove('sb-open', 'sb-closed');   // reset both
    sb.classList.add('sb-closed');                 // close on desktop
    document.getElementById('sb-backdrop').classList.remove('visible');
    // On mobile actually remove the open class
    if (window.innerWidth <= 768) {
      sb.classList.remove('sb-open', 'sb-closed');
    }
  },

  _closeSidebarMobile() {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('sb-open');
      document.getElementById('sb-backdrop').classList.remove('visible');
    }
  },

  /* ══════════════════════════════════════════════════
     SIDEBAR RENDER
     ══════════════════════════════════════════════════ */
  _renderSidebar() {
    const container = document.getElementById('sb-content');
    const panos     = DB.getAllPanos();

    if (!panos.length) {
      container.innerHTML = `
        <div class="sb-empty">
          <i class="fas fa-images"></i>
          <p>还没有全景照片<br>点击右上角"上传"按钮添加</p>
        </div>`;
      return;
    }

    // Group by group name
    const groups = {};
    panos.forEach(p => {
      const g = p.group || '默认分组';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });

    container.innerHTML = '';
    Object.entries(groups).forEach(([gName, items]) => {
      const block = document.createElement('div');
      block.className = 'sb-group';
      block.innerHTML = `
        <div class="sb-group-hd">
          <i class="fas fa-folder g-icon"></i>
          <span class="g-name">${this._esc(gName)}</span>
          <span class="g-count">${items.length}</span>
          <i class="fas fa-chevron-down g-chevron"></i>
        </div>
        <div class="sb-group-items">
          ${items.map(p => this._panoItemHtml(p)).join('')}
        </div>`;

      // Toggle group collapse
      block.querySelector('.sb-group-hd').addEventListener('click', () => {
        block.classList.toggle('collapsed');
      });

      // Bind item actions
      block.querySelectorAll('.sb-pano-item').forEach(el => {
        const id = el.dataset.id;
        // Navigate to location
        el.querySelector('.sb-pano-thumb').addEventListener('click', (e) => {
          e.stopPropagation();
          const p = DB.getPano(id);
          if (p) { MapMod.flyTo(p.lat, p.lng); this._closeSidebarMobile(); }
        });
        el.querySelector('.sb-pano-info').addEventListener('click', (e) => {
          e.stopPropagation();
          const p = DB.getPano(id);
          if (p) { MapMod.flyTo(p.lat, p.lng); this._closeSidebarMobile(); }
        });

        const editBtn = el.querySelector('.edit-btn');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); this._openEditModal(id); });

        const delBtn = el.querySelector('.del-btn');
        if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); this._confirmDelete(id); });
      });

      container.appendChild(block);
    });
  },

  _panoItemHtml(pano) {
    const canEdit = Auth.canEdit(pano.ownerId);
    const actions = canEdit ? `
      <button class="icon-btn sm edit-btn" title="编辑" aria-label="编辑"><i class="fas fa-edit"></i></button>
      <button class="icon-btn sm danger del-btn" title="删除" aria-label="删除"><i class="fas fa-trash-alt"></i></button>
    ` : '';
    return `
      <div class="sb-pano-item" data-id="${pano.id}">
        <img class="sb-pano-thumb" src="${pano.thumbnail}" alt="${this._esc(pano.name)}" />
        <div class="sb-pano-info">
          <div class="sb-pano-name">${this._esc(pano.name)}</div>
          <div class="sb-pano-owner">${this._esc(pano.ownerName)}</div>
        </div>
        <div class="sb-pano-actions">${actions}</div>
      </div>`;
  },

  /* ══════════════════════════════════════════════════
     UPLOAD MODAL
     ══════════════════════════════════════════════════ */
  _openUploadModal() {
    document.getElementById('upload-form').reset();
    document.getElementById('drop-preview').classList.add('hidden');
    document.getElementById('drop-placeholder').classList.remove('hidden');
    document.getElementById('lat-val').textContent = '—';
    document.getElementById('lng-val').textContent = '—';

    // Refresh group datalist
    this._fillGroupDatalist('group-datalist');

    document.getElementById('upload-modal').classList.remove('hidden');

    // Init mini-map after modal renders
    setTimeout(() => MapMod.initUploadMap(), 300);
  },

  _initDropZone() {
    const zone  = document.getElementById('drop-zone');
    const input = document.getElementById('photo-file');

    input.addEventListener('change', (e) => {
      if (e.target.files[0]) this._previewFile(e.target.files[0]);
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) {
        // Set files on input (works in modern browsers)
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        this._previewFile(f);
      }
    });

    document.getElementById('remove-preview-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      document.getElementById('drop-preview').classList.add('hidden');
      document.getElementById('drop-placeholder').classList.remove('hidden');
    });
  },

  _previewFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('preview-img').src = e.target.result;
      document.getElementById('drop-preview').classList.remove('hidden');
      document.getElementById('drop-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  },

  async _getGPS() {
    this._showLoading();
    try {
      const { lat, lng } = await MapMod.getCurrentLocation();
      MapMod._setUploadPin(lat, lng);
      MapMod.uploadMap && MapMod.uploadMap.setCenter([lng, lat]);
      this.toast('已获取当前位置', 'success');
    } catch (e) {
      this.toast(e.message, 'warning');
    } finally {
      this._hideLoading();
    }
  },

  async _handleUpload() {
    const name  = document.getElementById('photo-name').value.trim();
    const group = document.getElementById('photo-group').value.trim() || '默认分组';
    const desc  = document.getElementById('photo-desc').value.trim();
    const lat   = document.getElementById('photo-lat').value;
    const lng   = document.getElementById('photo-lng').value;
    const file  = document.getElementById('photo-file').files[0];

    if (!name)       { this.toast('请输入照片名称', 'error'); return; }
    if (!lat || !lng){ this.toast('请在地图上选择位置', 'error'); return; }
    if (!file)       { this.toast('请选择全景图片', 'error'); return; }

    this._showLoading();
    try {
      const thumbnail = await this._makeThumbnail(file);
      const id = 'p_' + Date.now();

      await DB.storeImage(id, file);
      const pano = {
        id,
        name,
        group,
        description: desc,
        lat:  parseFloat(lat),
        lng:  parseFloat(lng),
        thumbnail,
        ownerId:    Auth.currentUser.id,
        ownerName:  Auth.currentUser.username,
        uploadTime: new Date().toISOString(),
        isRemote:   false,
      };
      DB.savePano(pano);
      MapMod.addMarker(pano);
      this._renderSidebar();

      this._closeModal('upload-modal');
      MapMod.flyTo(pano.lat, pano.lng);
      this.toast('全景照片上传成功！', 'success');
    } catch (e) {
      console.error(e);
      this.toast('上传失败：' + e.message, 'error');
    } finally {
      this._hideLoading();
    }
  },

  _makeThumbnail(file, w = 150, h = 90) {
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width: iw, height: ih } = img;
          if (iw / ih > w / h) { ih = Math.round(ih * w / iw); iw = w; }
          else                  { iw = Math.round(iw * h / ih); ih = h; }
          const c = document.createElement('canvas');
          c.width = iw; c.height = ih;
          c.getContext('2d').drawImage(img, 0, 0, iw, ih);
          res(c.toDataURL('image/jpeg', 0.75));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* ══════════════════════════════════════════════════
     PANORAMA OPEN
     ══════════════════════════════════════════════════ */
  async openPanorama(panoId) {
    this._showLoading();
    try {
      await PanoViewer.open(panoId);
    } catch (e) {
      this.toast(e.message || '全景照片加载失败', 'error');
    } finally {
      this._hideLoading();
    }
  },

  /* ══════════════════════════════════════════════════
     EDIT MODAL
     ══════════════════════════════════════════════════ */
  _openEditModal(id) {
    const pano = DB.getPano(id);
    if (!pano || !Auth.canEdit(pano.ownerId)) {
      this.toast('无权限修改此照片', 'error');
      return;
    }
    document.getElementById('edit-id').value   = id;
    document.getElementById('edit-name').value  = pano.name;
    document.getElementById('edit-group').value = pano.group || '';
    document.getElementById('edit-desc').value  = pano.description || '';

    this._fillGroupDatalist('edit-group-datalist');
    document.getElementById('edit-modal').classList.remove('hidden');
  },

  _handleEdit() {
    const id    = document.getElementById('edit-id').value;
    const pano  = DB.getPano(id);
    if (!pano || !Auth.canEdit(pano.ownerId)) {
      this.toast('无权限修改此照片', 'error');
      return;
    }
    const name = document.getElementById('edit-name').value.trim();
    if (!name) { this.toast('名称不能为空', 'error'); return; }

    pano.name        = name;
    pano.group       = document.getElementById('edit-group').value.trim() || '默认分组';
    pano.description = document.getElementById('edit-desc').value.trim();

    DB.savePano(pano);
    MapMod.addMarker(pano);   // refresh marker
    this._renderSidebar();
    this._closeModal('edit-modal');
    this.toast('修改已保存', 'success');
  },

  /* ══════════════════════════════════════════════════
     DELETE
     ══════════════════════════════════════════════════ */
  _confirmDelete(id) {
    const pano = DB.getPano(id);
    if (!pano) return;
    if (!Auth.canEdit(pano.ownerId)) { this.toast('无权限删除此照片', 'error'); return; }
    if (!confirm(`确定要删除"${pano.name}"吗？\n此操作不可撤销。`)) return;
    this._deletePano(id);
  },

  async _deletePano(id) {
    try {
      await DB.deleteImage(id);
    } catch (e) {
      // Swallow DOMException when the image blob was never stored (e.g. remote/demo panoramas)
      if (!(e instanceof DOMException)) console.error('deleteImage error:', e);
    }
    DB.deletePano(id);
    MapMod.removeMarker(id);
    this._renderSidebar();
    this.toast('已删除', 'success');
  },

  /* ══════════════════════════════════════════════════
     SEARCH
     ══════════════════════════════════════════════════ */
  _handleSearch(query) {
    const drop = document.getElementById('search-drop');
    const q    = query.trim().toLowerCase();

    if (!q) { drop.classList.add('hidden'); return; }

    const results = DB.getAllPanos().filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.group       && p.group.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );

    if (!results.length) {
      drop.innerHTML = '<div class="search-empty">没有找到相关照片</div>';
    } else {
      drop.innerHTML = results.map(p => `
        <div class="search-item" data-id="${p.id}" role="option" tabindex="0">
          <img src="${p.thumbnail}" alt="${this._esc(p.name)}" />
          <div class="si-info">
            <div class="si-name">${this._esc(p.name)}</div>
            <div class="si-group">${this._esc(p.group || '默认分组')}</div>
          </div>
        </div>`).join('');

      drop.querySelectorAll('.search-item').forEach(el => {
        const activate = () => {
          const p = DB.getPano(el.dataset.id);
          if (p) {
            MapMod.flyTo(p.lat, p.lng);
            document.getElementById('search-input').value = p.name;
            drop.classList.add('hidden');
          }
        };
        el.addEventListener('click', activate);
        el.addEventListener('keydown', e => { if (e.key === 'Enter') activate(); });
      });
    }

    drop.classList.remove('hidden');
  },

  _closeSearch() {
    document.getElementById('search-drop').classList.add('hidden');
  },

  /* ══════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════ */
  _closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      // Destroy upload map when modal closes to free memory
      if (id === 'upload-modal') MapMod.destroyUploadMap();
    }
  },

  _fillGroupDatalist(dlId) {
    const groups = [...new Set(DB.getAllPanos().map(p => p.group).filter(Boolean))];
    const dl = document.getElementById(dlId);
    if (dl) dl.innerHTML = groups.map(g => `<option value="${this._esc(g)}">`).join('');
  },

  _showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); },
  _hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); },

  toast(msg, type = 'info', duration = 3500) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${this._esc(msg)}</span>`;
    document.getElementById('toast-container').appendChild(t);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => t.classList.add('visible'));
    });
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 280);
    }, duration);
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

/* Called by Amap SDK once it finishes loading */
window.initAmap = function () {
  if (!App._initialized) App.init();
};

/* Fallback: if Amap SDK fails to load, init app after 6s without map */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!App._initialized) {
      App._mapUnavailable = true;
      App.init();
    }
  }, 6000);
});
