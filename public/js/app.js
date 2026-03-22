/* =====================================================================
   PanoMap — Frontend Application
   ===================================================================== */

'use strict';

const runtimeConfig = window.PANOMAP_CONFIG || {};

function normalizeBaseUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) return '';
  return clean.replace(/\/+$/, '');
}

const API_BASE_URL = normalizeBaseUrl(runtimeConfig.apiBaseUrl);
const UPLOADS_BASE_URL = normalizeBaseUrl(
  runtimeConfig.uploadsBaseUrl || (API_BASE_URL ? `${API_BASE_URL}/uploads` : '/uploads'),
);

function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

function uploadUrl(filePath) {
  const cleanPath = String(filePath || '').replace(/^\/+/, '');
  return `${UPLOADS_BASE_URL}/${cleanPath}`;
}

// ── State ──────────────────────────────────────────────────────────────
const state = {
  user: null,       // { id, username }
  token: null,      // JWT string
  panoramas: [],    // All panoramas from API
  filtered: [],     // After search filter
  amapKey: null,
  mapCenter: [116.397428, 39.90923],
  mapZoom: 11,
  map: null,
  markers: {},      // id → { marker, el }
  pannellumViewer: null,
  pickingLocation: false,
  pendingDeleteId: null,
  sidebarCollapsed: false,
};

// ── DOM helpers ───────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function show(el)  { if (el) el.classList.remove('hidden'); }
function hide(el)  { if (el) el.classList.add('hidden'); }
function toggle(el, force) { if (el) el.classList.toggle('hidden', force); }

// ── Toast notifications ───────────────────────────────────────────────
const toast = {
  show(msg, type = 'info', duration = 3500) {
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    $('#toast-container').appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  },
  success: (m) => toast.show(m, 'success'),
  error:   (m) => toast.show(m, 'error'),
  warning: (m) => toast.show(m, 'warning'),
  info:    (m) => toast.show(m, 'info'),
};

// ── API client ────────────────────────────────────────────────────────
const api = {
  async request(method, path, body, isFormData = false) {
    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    if (!isFormData && body) headers['Content-Type'] = 'application/json';

    const res = await fetch(apiUrl(path), {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });

    if (res.status === 401) {
      auth.logout();
      throw new Error('会话已过期，请重新登录');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  },

  get:    (path)        => api.request('GET',    path),
  post:   (path, body)  => api.request('POST',   path, body),
  delete: (path)        => api.request('DELETE', path),
  upload: (path, form)  => api.request('POST',   path, form, true),
};

// ── Auth ──────────────────────────────────────────────────────────────
const auth = {
  init() {
    const token = localStorage.getItem('panomap_token');
    const user  = localStorage.getItem('panomap_user');
    if (token && user) {
      state.token = token;
      try {
        state.user = JSON.parse(user);
        auth.showApp();
      } catch {
        auth.logout();
      }
    }
  },

  save(token, user) {
    state.token = token;
    state.user  = user;
    localStorage.setItem('panomap_token', token);
    localStorage.setItem('panomap_user', JSON.stringify(user));
  },

  logout() {
    state.token = null;
    state.user  = null;
    localStorage.removeItem('panomap_token');
    localStorage.removeItem('panomap_user');
    show($('#auth-overlay'));
    hide($('#app'));
  },

  showApp() {
    hide($('#auth-overlay'));
    show($('#app'));
    $('#username-label').textContent = state.user.username;
    mapModule.loadAndInit();
  },
};

// ── Auth form handlers ────────────────────────────────────────────────
function initAuthForms() {
  // Tab switching
  $$('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      if (target === 'login') {
        show($('#login-form'));
        hide($('#register-form'));
      } else {
        hide($('#login-form'));
        show($('#register-form'));
      }
    });
  });

  // Login
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#login-error');
    errEl.textContent = '';
    const btn = $('#login-form button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中…';

    try {
      const data = await api.post('/api/auth/login', {
        username: $('#login-username').value,
        password: $('#login-password').value,
      });
      auth.save(data.token, data.user);
      auth.showApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登录';
    }
  });

  // Register
  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#reg-error');
    errEl.textContent = '';
    const btn = $('#register-form button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中…';

    try {
      const data = await api.post('/api/auth/register', {
        username: $('#reg-username').value,
        password: $('#reg-password').value,
        email:    $('#reg-email').value || undefined,
      });
      auth.save(data.token, data.user);
      auth.showApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> 注册';
    }
  });

  // Logout
  $('#logout-btn').addEventListener('click', () => {
    hide($('#user-dropdown'));
    auth.logout();
  });

  // User dropdown toggle
  const userBtn = $('#user-btn');
  const dropdown = $('#user-dropdown');
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(dropdown);
    userBtn.setAttribute('aria-expanded', !dropdown.classList.contains('hidden'));
  });
  document.addEventListener('click', () => {
    if (!dropdown.classList.contains('hidden')) {
      hide(dropdown);
      userBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────
const sidebarModule = {
  render(panoramas) {
    const list = $('#sidebar-list');
    list.innerHTML = '';

    if (!panoramas.length) {
      hide(list);
      show($('#sidebar-empty'));
      $('#sidebar-count').textContent = '0';
      return;
    }

    show(list);
    hide($('#sidebar-empty'));
    $('#sidebar-count').textContent = panoramas.length;

    // Group panoramas
    const groups = {};
    panoramas.forEach((p) => {
      const g = p.group_name || '未分组';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });

    // Populate group-datalist in upload form
    const datalist = $('#group-datalist');
    if (datalist) {
      datalist.innerHTML = '';
      Object.keys(groups).forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g;
        datalist.appendChild(opt);
      });
    }

    Object.entries(groups).forEach(([groupName, items]) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'group';
      groupEl.innerHTML = `
        <div class="group-header" role="button" tabindex="0" aria-expanded="true">
          <i class="fas fa-layer-group" style="font-size:10px"></i>
          <span>${escHtml(groupName)}</span>
          <span class="group-count">${items.length}</span>
          <i class="fas fa-chevron-down group-chevron"></i>
        </div>
        <div class="group-items" role="list"></div>
      `;

      const header = groupEl.querySelector('.group-header');
      const itemsEl = groupEl.querySelector('.group-items');

      // Toggle group collapse
      const toggleGroup = () => {
        const collapsed = header.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
        if (collapsed) {
          itemsEl.style.maxHeight = '0';
          itemsEl.style.overflow = 'hidden';
        } else {
          itemsEl.style.maxHeight = '';
          itemsEl.style.overflow = '';
        }
      };

      header.addEventListener('click', toggleGroup);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(); }
      });

      // Render items
      items.forEach((p) => {
        const thumbSrc = p.thumbnail
          ? uploadUrl(p.thumbnail)
          : uploadUrl(p.filename);

        const isOwner = state.user && p.user_id === state.user.id;

        const item = document.createElement('div');
        item.className = 'pano-item';
        item.dataset.id = p.id;
        item.setAttribute('role', 'listitem');
        item.setAttribute('tabindex', '0');
        item.innerHTML = `
          <div class="pano-thumb">
            <img src="${thumbSrc}" alt="${escHtml(p.title)}" loading="lazy">
          </div>
          <div class="pano-item-info">
            <div class="pano-item-name" title="${escHtml(p.title)}">${escHtml(p.title)}</div>
            <div class="pano-item-meta">@${escHtml(p.username)}</div>
          </div>
          <div class="pano-item-actions">
            <button class="pano-action-btn loc-btn" title="定位到地图" aria-label="定位">
              <i class="fas fa-map-marker-alt"></i>
            </button>
            ${isOwner ? `<button class="pano-action-btn del" title="删除" aria-label="删除">
              <i class="fas fa-trash-alt"></i>
            </button>` : ''}
          </div>
        `;

        // Click item (open panorama)
        const openPano = () => panoramaModule.open(p);
        item.addEventListener('click', (e) => {
          if (e.target.closest('.pano-action-btn')) return;
          openPano();
        });
        item.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.pano-action-btn')) {
            e.preventDefault(); openPano();
          }
        });

        // Locate button
        item.querySelector('.loc-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          mapModule.flyTo(p);
          sidebarModule.setActive(p.id);
        });

        // Delete button (owner only)
        const delBtn = item.querySelector('.del');
        if (delBtn) {
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadModule.confirmDelete(p);
          });
        }

        itemsEl.appendChild(item);
      });

      list.appendChild(groupEl);
    });
  },

  setActive(id) {
    $$('.pano-item').forEach((el) => el.classList.remove('active'));
    const el = $(`.pano-item[data-id="${id}"]`);
    if (el) {
      el.classList.add('active');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },
};

// ── Map module ────────────────────────────────────────────────────────
const mapModule = {
  async loadAndInit() {
    // Always load panoramas for sidebar even if map fails
    const configPromise = api.get('/api/config').then((config) => {
      state.amapKey = config.amapKey;
      if (config.mapCenter) state.mapCenter = config.mapCenter;
      if (config.mapZoom)   state.mapZoom   = config.mapZoom;
    }).catch((err) => {
      toast.error('加载配置失败: ' + err.message);
    });

    // Load panoramas for sidebar regardless of map status
    panoramasModule.loadAll();

    // Try to load the Amap map
    try {
      await configPromise;
      await mapModule.loadAmapScript(state.amapKey || '');
      mapModule.init();
    } catch (err) {
      toast.warning('地图加载失败，请配置有效的高德 API Key');
      // Show error in map area
      const loadingEl = $('#map-loading');
      if (loadingEl) {
        loadingEl.innerHTML = `
          <i class="fas fa-map-signs" style="font-size:40px;color:#475569;margin-bottom:12px"></i>
          <p style="color:#94a3b8;font-size:14px">地图加载失败</p>
          <small style="color:#64748b">请在 .env 文件中配置有效的高德地图 API Key</small>
        `;
        loadingEl.style.pointerEvents = 'none';
      }
    }
  },

  loadAmapScript(key) {
    return new Promise((resolve, reject) => {
      if (window.AMap) { resolve(); return; }

      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Scale,AMap.ToolBar`;
      script.onload  = resolve;
      script.onerror = () => reject(new Error('高德地图加载失败，请检查 API Key 配置'));
      document.head.appendChild(script);
    });
  },

  init() {
    state.map = new AMap.Map('map', {
      zoom:   state.mapZoom,
      center: state.mapCenter,
      mapStyle: 'amap://styles/normal',
    });

    // Add scale and toolbar controls
    state.map.addControl(new AMap.Scale());
    state.map.addControl(new AMap.ToolBar({ position: 'RB' }));

    state.map.on('complete', () => {
      hide($('#map-loading'));
      // If panoramas were loaded before map was ready, add their markers now
      if (state.panoramas.length) {
        mapModule.clearMarkers();
        state.panoramas.forEach((p) => mapModule.addMarker(p));
      }
    });

    // Handle map click for location picking
    state.map.on('click', (e) => {
      if (!state.pickingLocation) return;
      const lat = e.lnglat.getLat ? e.lnglat.getLat() : e.lnglat.lat;
      const lng = e.lnglat.getLng ? e.lnglat.getLng() : e.lnglat.lng;
      $('#upload-lat').value = lat.toFixed(6);
      $('#upload-lng').value = lng.toFixed(6);
      mapModule.stopPickingLocation();
      show($('#upload-modal'));
      toast.info('位置已设置');
    });
  },

  addMarker(p) {
    if (state.markers[p.id]) {
      state.markers[p.id].marker.setMap(null);
    }

    const thumbSrc = p.thumbnail ? uploadUrl(p.thumbnail) : uploadUrl(p.filename);
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.innerHTML = `
      <div class="marker-photo">
        <img src="${thumbSrc}" alt="${escHtml(p.title)}" loading="lazy">
      </div>
      <div class="marker-pin"></div>
    `;

    const marker = new AMap.Marker({
      position: new AMap.LngLat(p.lng, p.lat),
      content: el,
      anchor: 'bottom-center',
      zIndex: 10,
    });

    marker.on('click', () => {
      panoramaModule.open(p);
      sidebarModule.setActive(p.id);
    });

    marker.setMap(state.map);
    state.markers[p.id] = { marker, el };
  },

  removeMarker(id) {
    if (state.markers[id]) {
      state.markers[id].marker.setMap(null);
      delete state.markers[id];
    }
  },

  clearMarkers() {
    Object.keys(state.markers).forEach((id) => mapModule.removeMarker(id));
  },

  flyTo(p) {
    if (!state.map) return;
    state.map.setZoomAndCenter(15, new AMap.LngLat(p.lng, p.lat), false, 300);
    // Highlight marker
    Object.values(state.markers).forEach(({ el }) => el.classList.remove('active-marker'));
    if (state.markers[p.id]) {
      state.markers[p.id].el.classList.add('active-marker');
    }
  },

  startPickingLocation() {
    state.pickingLocation = true;
    hide($('#upload-modal'));
    show($('#pick-banner'));
    $('#map-wrap').classList.add('picking');
  },

  stopPickingLocation() {
    state.pickingLocation = false;
    hide($('#pick-banner'));
    $('#map-wrap').classList.remove('picking');
  },
};

// ── Panoramas (data) ──────────────────────────────────────────────────
const panoramasModule = {
  async loadAll() {
    try {
      const data = await api.get('/api/panoramas');
      state.panoramas = data;
      state.filtered  = data;
      // Add markers only if map is already initialized
      if (state.map) {
        mapModule.clearMarkers();
        data.forEach((p) => mapModule.addMarker(p));
      }
      sidebarModule.render(data);
    } catch (err) {
      toast.error('加载全景照片失败: ' + err.message);
    }
  },
};

// ── Panorama viewer ───────────────────────────────────────────────────
const panoramaModule = {
  current: null,

  open(p) {
    this.current = p;
    const overlay = $('#pano-overlay');
    show(overlay);
    document.body.classList.add('no-scroll');

    $('#pano-title').textContent  = p.title;
    $('#pano-author').textContent = `@${p.username}`;

    // Destroy previous viewer
    if (state.pannellumViewer) {
      try { state.pannellumViewer.destroy(); } catch {}
      state.pannellumViewer = null;
    }

    const container = $('#pannellum-container');
    container.innerHTML = '';

    const imageUrl = uploadUrl(p.filename);

    state.pannellumViewer = pannellum.viewer(container, {
      type:              'equirectangular',
      panorama:          imageUrl,
      autoLoad:          true,
      showFullscreenCtrl: false,
      showZoomCtrl:      true,
      mouseZoom:         true,
      keyboardZoom:      true,
      compass:           false,
      hfov:              100,
      minHfov:           30,
      maxHfov:           150,
      yaw:               0,
      pitch:             0,
    });

    sidebarModule.setActive(p.id);
    mapModule.flyTo(p);
  },

  close() {
    this.current = null;
    hide($('#pano-overlay'));
    document.body.classList.remove('no-scroll');

    if (state.pannellumViewer) {
      try { state.pannellumViewer.destroy(); } catch {}
      state.pannellumViewer = null;
    }
    $('#pannellum-container').innerHTML = '';
  },

  toggleFullscreen() {
    const overlay = $('#pano-overlay');
    if (!document.fullscreenElement) {
      overlay.requestFullscreen().catch(() => {});
      $('#pano-fs-icon').className = 'fas fa-compress';
    } else {
      document.exitFullscreen().catch(() => {});
      $('#pano-fs-icon').className = 'fas fa-expand';
    }
  },
};

// Handle fullscreen change from browser (e.g. Esc key)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    $('#pano-fs-icon').className = 'fas fa-expand';
  }
});

// ── Upload module ─────────────────────────────────────────────────────
const uploadModule = {
  open() {
    show($('#upload-modal'));
    uploadModule.resetForm();
    // Pre-fill location with current map center
    if (state.map) {
      const center = state.map.getCenter();
      if (center) {
        $('#upload-lat').value = center.getLat().toFixed(6);
        $('#upload-lng').value = center.getLng().toFixed(6);
      }
    }
  },

  close() {
    hide($('#upload-modal'));
    uploadModule.resetForm();
    if (state.pickingLocation) mapModule.stopPickingLocation();
  },

  resetForm() {
    const form = $('#upload-form');
    form.reset();
    $('#upload-error').textContent = '';
    hide($('#upload-progress'));
    show($('#dz-hint'));
    hide($('#dz-preview'));
    $('#preview-img').src = '';
    $('#preview-name').textContent = '';
  },

  handleFileSelect(file) {
    if (!file) return;

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('请选择 JPG、PNG 或 WebP 格式的图片');
      return;
    }

    // Validate size (100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast.error('文件大小不能超过 100MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      $('#preview-img').src = e.target.result;
      $('#preview-name').textContent = `${file.name}  (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      hide($('#dz-hint'));
      show($('#dz-preview'));
    };
    reader.readAsDataURL(file);
  },

  async submit(e) {
    e.preventDefault();
    const errEl = $('#upload-error');
    errEl.textContent = '';

    const file  = $('#photo-file').files[0];
    const title = $('#upload-title').value.trim();
    const lat   = parseFloat($('#upload-lat').value);
    const lng   = parseFloat($('#upload-lng').value);

    if (!file)  { errEl.textContent = '请选择图片文件'; return; }
    if (!title) { errEl.textContent = '请输入标题'; return; }
    if (isNaN(lat) || isNaN(lng)) { errEl.textContent = '请设置有效的位置坐标'; return; }

    const form = new FormData();
    form.append('photo',       file);
    form.append('title',       title);
    form.append('description', $('#upload-desc').value.trim());
    form.append('group_name',  $('#upload-group').value.trim() || '未分组');
    form.append('lat',         lat);
    form.append('lng',         lng);

    const submitBtn = $('#upload-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上传中…';
    show($('#upload-progress'));
    animateProgress();

    try {
      const pano = await api.upload('/api/panoramas', form);
      stopProgress(true);
      state.panoramas.unshift(pano);
      state.filtered = applySearchFilter(state.panoramas, $('#search-input').value.trim());
      sidebarModule.render(state.filtered);
      mapModule.addMarker(pano);
      uploadModule.close();
      toast.success(`"${pano.title}" 上传成功！`);
      mapModule.flyTo(pano);
      sidebarModule.setActive(pano.id);
    } catch (err) {
      stopProgress(false);
      errEl.textContent = err.message;
      hide($('#upload-progress'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-upload"></i> 上传';
    }
  },

  confirmDelete(p) {
    state.pendingDeleteId = p.id;
    $('#delete-pano-title').textContent = p.title;
    show($('#delete-modal'));
  },

  async doDelete() {
    const id = state.pendingDeleteId;
    if (!id) return;

    const btn = $('#delete-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 删除中…';

    try {
      await api.delete(`/api/panoramas/${id}`);
      state.panoramas = state.panoramas.filter((p) => p.id !== id);
      state.filtered  = applySearchFilter(state.panoramas, $('#search-input').value.trim());
      sidebarModule.render(state.filtered);
      mapModule.removeMarker(id);

      // Close panorama viewer if it was showing this panorama
      if (panoramaModule.current && panoramaModule.current.id === id) {
        panoramaModule.close();
      }

      hide($('#delete-modal'));
      toast.success('已成功删除');
    } catch (err) {
      toast.error('删除失败: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-alt"></i> 删除';
      state.pendingDeleteId = null;
    }
  },
};

// Fake progress animation for upload (no XHR progress events from fetch)
let _progressInterval = null;

function animateProgress() {
  if (_progressInterval) clearInterval(_progressInterval);
  let pct = 0;
  const bar   = $('#progress-bar');
  const label = $('#progress-label');
  _progressInterval = setInterval(() => {
    if (!$('#upload-progress') || $('#upload-progress').classList.contains('hidden')) {
      clearInterval(_progressInterval);
      _progressInterval = null;
      return;
    }
    pct = Math.min(pct + Math.random() * 8, 85);
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = `上传中… ${Math.round(pct)}%`;
  }, 200);
}

function stopProgress(success) {
  if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
  const bar   = $('#progress-bar');
  const label = $('#progress-label');
  if (success && bar) { bar.style.width = '100%'; }
  if (success && label) { label.textContent = '上传完成！'; }
}

// ── Search ────────────────────────────────────────────────────────────
function applySearchFilter(panoramas, query) {
  if (!query) return panoramas;
  const q = query.toLowerCase();
  return panoramas.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.group_name || '').toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q),
  );
}

function initSearch() {
  const input     = $('#search-input');
  const clearBtn  = $('#search-clear');
  const badge     = $('#search-badge');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim();

      // Show/hide clear button
      toggle(clearBtn, !query);

      // Filter
      state.filtered = applySearchFilter(state.panoramas, query);
      sidebarModule.render(state.filtered);

      // Update map markers visibility
      const visibleIds = new Set(state.filtered.map((p) => p.id));
      Object.entries(state.markers).forEach(([id, { marker }]) => {
        if (visibleIds.has(parseInt(id))) {
          marker.show();
        } else {
          marker.hide();
        }
      });

      // Show badge
      if (query) {
        show(badge);
        badge.textContent = `找到 ${state.filtered.length} 项`;
      } else {
        hide(badge);
      }
    }, 200);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
}

// ── Sidebar toggle ────────────────────────────────────────────────────
function initSidebarToggle() {
  $('#sidebar-toggle').addEventListener('click', () => {
    const sidebar = $('#sidebar');
    state.sidebarCollapsed = !state.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
  });
}

// ── Upload form events ────────────────────────────────────────────────
function initUploadForm() {
  // Open modal
  $('#upload-btn').addEventListener('click', () => {
    if (!state.user) { toast.warning('请先登录'); return; }
    uploadModule.open();
  });

  // Close modal
  $('#upload-close-btn').addEventListener('click', () => uploadModule.close());
  $('#upload-cancel-btn').addEventListener('click', () => uploadModule.close());

  // Click backdrop to close
  $('#upload-modal .modal-backdrop').addEventListener('click', () => uploadModule.close());

  // Form submit
  $('#upload-form').addEventListener('submit', uploadModule.submit);

  // File input change
  const fileInput = $('#photo-file');
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadModule.handleFileSelect(fileInput.files[0]);
  });

  // Drag & drop
  const dropZone = $('#drop-zone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      // Programmatically set the file input
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      uploadModule.handleFileSelect(file);
    }
  });

  // Remove file
  $('#dz-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    show($('#dz-hint'));
    hide($('#dz-preview'));
    $('#preview-img').src = '';
  });

  // Pick location
  $('#pick-loc-btn').addEventListener('click', () => mapModule.startPickingLocation());

  // Cancel picking
  $('#pick-cancel').addEventListener('click', () => {
    mapModule.stopPickingLocation();
    show($('#upload-modal'));
  });
}

// ── Delete modal ──────────────────────────────────────────────────────
function initDeleteModal() {
  $('#delete-confirm-btn').addEventListener('click', () => uploadModule.doDelete());
  $('#delete-cancel-btn').addEventListener('click',  () => {
    hide($('#delete-modal'));
    state.pendingDeleteId = null;
  });
  $('#delete-modal .modal-backdrop').addEventListener('click', () => {
    hide($('#delete-modal'));
    state.pendingDeleteId = null;
  });
}

// ── Panorama viewer events ────────────────────────────────────────────
function initPanoViewer() {
  $('#pano-close-btn').addEventListener('click', () => panoramaModule.close());
  $('#pano-fullscreen-btn').addEventListener('click', () => panoramaModule.toggleFullscreen());

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.pickingLocation) {
        mapModule.stopPickingLocation();
        show($('#upload-modal'));
      } else if (!$('#pano-overlay').classList.contains('hidden')) {
        panoramaModule.close();
      }
    }
  });
}

// ── Utility ───────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── App init ──────────────────────────────────────────────────────────
function init() {
  initAuthForms();
  initSidebarToggle();
  initUploadForm();
  initDeleteModal();
  initPanoViewer();
  initSearch();
  auth.init();
}

document.addEventListener('DOMContentLoaded', init);
