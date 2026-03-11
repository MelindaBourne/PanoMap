/* ============================================================
   PanoMap - Main Application
   ============================================================ */

// ── Global State ──────────────────────────────────────────────
const state = {
  user: null,
  token: null,
  map: null,
  locationMap: null,
  pannellum: null,
  photos: [],
  groups: [],
  markers: {},
  currentFilter: null,
  currentPhoto: null,
  locationMarker: null,
  selectedLat: null,
  selectedLng: null,
  searchDebounce: null,
  sidebarOpen: true
};

// Default map center (Beijing - change to your preferred location)
const DEFAULT_CENTER = [116.397428, 39.90923];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Auth state
  state.token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    try { state.user = JSON.parse(savedUser); } catch (e) {}
  }

  updateAuthUI();

  // Load data first (independent of map)
  await Promise.all([loadPhotos(), loadGroups()]);

  // Load AMap asynchronously (doesn't block data loading)
  fetch('/api/config')
    .then(r => r.json())
    .catch(() => ({ amapKey: 'YOUR_AMAP_API_KEY' }))
    .then(config => loadAMap(config.amapKey))
    .then(() => {
      initMap();
      // Re-render markers now that map is ready
      if (state.photos.length > 0) {
        renderMarkers(state.photos);
      }
    })
    .catch(err => console.warn('AMap load failed:', err));

  // Event listeners
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('dropdownMenu');
    const btn = document.getElementById('userAvatarBtn');
    if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
      menu.classList.remove('show');
    }
  });
});

// ── AMap Loader ───────────────────────────────────────────────
function loadAMap(apiKey) {
  return new Promise((resolve) => {
    if (window.AMap) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}&callback=onAMapLoad`;
    window.onAMapLoad = resolve;
    document.head.appendChild(script);
  });
}

// ── Map Init ──────────────────────────────────────────────────
function initMap() {
  state.map = new AMap.Map('map', {
    zoom: 11,
    center: DEFAULT_CENTER, // Default center
    mapStyle: 'amap://styles/dark',
    features: ['bg', 'road', 'building', 'point']
  });

  // Load plugins
  AMap.plugin(['AMap.Scale', 'AMap.ToolBar', 'AMap.Geolocation'], () => {
    state.map.addControl(new AMap.Scale());
  });

  // Click on map to close dropdown
  state.map.on('click', () => {
    document.getElementById('dropdownMenu').classList.remove('show');
  });
}

// ── Auth UI ───────────────────────────────────────────────────
function updateAuthUI() {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  const uploadBtn = document.getElementById('uploadBtn');

  if (state.user) {
    authButtons.classList.add('hidden');
    userMenu.classList.remove('hidden');
    // Set avatar letter
    const avatar = document.getElementById('userAvatarDisplay');
    if (avatar) avatar.textContent = state.user.username.charAt(0).toUpperCase();
    const dropUsername = document.getElementById('dropdownUsername');
    if (dropUsername) dropUsername.textContent = state.user.username;
  } else {
    authButtons.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

function toggleUserDropdown() {
  document.getElementById('dropdownMenu').classList.toggle('show');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.user = null;
  state.token = null;
  updateAuthUI();
  showToast('已退出登录', 'info');
  document.getElementById('dropdownMenu').classList.remove('show');
}

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  state.sidebarOpen = !state.sidebarOpen;
  sidebar.classList.toggle('collapsed', !state.sidebarOpen);
}

// ── Search ────────────────────────────────────────────────────
function handleSearch(e) {
  const val = e.target.value.trim();
  document.getElementById('searchClear').classList.toggle('hidden', !val);
  clearTimeout(state.searchDebounce);
  state.searchDebounce = setTimeout(() => {
    loadPhotos(val, state.currentFilter);
  }, 300);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.add('hidden');
  loadPhotos('', state.currentFilter);
}

// ── Groups Filter ─────────────────────────────────────────────
async function loadGroups() {
  try {
    const res = await apiFetch('/api/groups');
    state.groups = res.groups || [];
    renderGroupChips();
    renderGroupOptions();
    renderGroupList();
  } catch (e) {
    console.warn('Failed to load groups:', e);
  }
}

function renderGroupChips() {
  const container = document.getElementById('groupChips');
  container.innerHTML = state.groups.map(g => `
    <button class="filter-chip" data-group="${g.id}" 
            style="--group-color:${g.color}"
            onclick="filterByGroup(${g.id}, this)">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${g.color};margin-right:5px;vertical-align:middle"></span>
      ${escapeHtml(g.name)}
    </button>
  `).join('');
}

function filterByGroup(groupId, chip) {
  state.currentFilter = groupId;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (chip) chip.classList.add('active');
  const search = document.getElementById('searchInput').value.trim();
  loadPhotos(search, groupId);
}

// ── Photos ────────────────────────────────────────────────────
async function loadPhotos(search = '', groupId = null) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (groupId) params.set('group_id', groupId);

  try {
    document.getElementById('sidebarLoading').style.display = 'flex';
    document.getElementById('sidebarEmpty').classList.add('hidden');
    document.getElementById('photoList').innerHTML = '';

    const res = await apiFetch(`/api/photos?${params}`);
    state.photos = res.photos || [];

    clearMarkers();
    renderSidebar(state.photos);
    renderMarkers(state.photos);

    document.getElementById('sidebarLoading').style.display = 'none';
    document.getElementById('photoCount').textContent = `${state.photos.length} 张`;

    if (state.photos.length === 0) {
      document.getElementById('sidebarEmpty').classList.remove('hidden');
    }
  } catch (e) {
    console.error('Load photos error:', e);
    document.getElementById('sidebarLoading').style.display = 'none';
    showToast('加载照片失败', 'error');
  }
}

function renderSidebar(photos) {
  const container = document.getElementById('photoList');

  if (state.currentFilter) {
    // Flat list when filtered
    container.innerHTML = photos.map(p => renderPhotoItem(p)).join('');
    return;
  }

  // Group by group_id
  const grouped = {};
  const ungrouped = [];

  photos.forEach(p => {
    if (p.group_id) {
      if (!grouped[p.group_id]) grouped[p.group_id] = { info: null, photos: [] };
      grouped[p.group_id].photos.push(p);
      grouped[p.group_id].info = { id: p.group_id, name: p.group_name, color: p.group_color };
    } else {
      ungrouped.push(p);
    }
  });

  let html = '';

  // Grouped sections
  Object.values(grouped).forEach(({ info, photos: gPhotos }) => {
    html += `
      <div class="group-section" id="group-section-${info.id}">
        <div class="group-section-header" onclick="toggleGroupSection(${info.id})">
          <span class="group-dot" style="background:${info.color}"></span>
          <span class="group-name">${escapeHtml(info.name)}</span>
          <span class="group-count">${gPhotos.length}</span>
          <svg class="group-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="group-photos">
          ${gPhotos.map(p => renderPhotoItem(p)).join('')}
        </div>
      </div>
    `;
  });

  // Ungrouped
  if (ungrouped.length > 0) {
    if (Object.keys(grouped).length > 0) {
      html += `
        <div class="group-section" id="group-section-ungrouped">
          <div class="group-section-header" onclick="toggleGroupSection('ungrouped')">
            <span class="group-dot" style="background:var(--text-muted)"></span>
            <span class="group-name">未分组</span>
            <span class="group-count">${ungrouped.length}</span>
            <svg class="group-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <div class="group-photos">
            ${ungrouped.map(p => renderPhotoItem(p)).join('')}
          </div>
        </div>
      `;
    } else {
      html += ungrouped.map(p => renderPhotoItem(p)).join('');
    }
  }

  container.innerHTML = html;
}

function renderPhotoItem(photo) {
  const isOwner = state.user && state.user.id === photo.user_id;
  const date = new Date(photo.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  return `
    <div class="photo-item" id="item-${photo.id}" onclick="locatePhoto(${photo.id})">
      <div class="photo-item-thumb">
        <img src="/uploads/thumbnails/${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.name)}" 
             onerror="this.style.display='none'">
      </div>
      <div class="photo-item-info">
        <div class="photo-item-name" title="${escapeHtml(photo.name)}">${escapeHtml(photo.name)}</div>
        <div class="photo-item-meta">
          ${escapeHtml(photo.username)} · ${date}
        </div>
      </div>
      <div class="photo-item-actions">
        <button class="photo-action-btn" onclick="openPanorama(${photo.id}, event)" title="查看全景">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12 Q7 4 12 12 Q17 20 22 12"/>
          </svg>
        </button>
        ${isOwner ? `
          <button class="photo-action-btn danger" onclick="deletePhoto(${photo.id}, event)" title="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function toggleGroupSection(id) {
  const section = document.getElementById(`group-section-${id}`);
  if (section) section.classList.toggle('collapsed');
}

// ── Map Markers ───────────────────────────────────────────────
function renderMarkers(photos) {
  if (!state.map) return; // Map not ready yet
  photos.forEach(photo => {
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.innerHTML = `
      <img class="map-marker-img" src="/uploads/thumbnails/${escapeHtml(photo.thumbnail)}" 
           alt="${escapeHtml(photo.name)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2244%22 viewBox=%220 0 72 44%22><rect width=%2272%22 height=%2244%22 fill=%22%23334155%22 rx=%228%22/><text x=%2236%22 y=%2227%22 text-anchor=%22middle%22 fill=%22%2364748B%22 font-size=%2220%22>⛰</text></svg>'">
      <div class="map-marker-label">${escapeHtml(photo.name)}</div>
    `;
    el.addEventListener('click', () => openPhotoDetail(photo.id));

    const marker = new AMap.Marker({
      position: new AMap.LngLat(photo.lng, photo.lat),
      content: el,
      offset: new AMap.Pixel(-36, -44)
    });

    marker.setMap(state.map);
    state.markers[photo.id] = marker;
  });
}

function clearMarkers() {
  if (!state.map) { state.markers = {}; return; }
  Object.values(state.markers).forEach(m => m.setMap(null));
  state.markers = {};
}

function locatePhoto(photoId) {
  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;

  // Highlight sidebar item
  document.querySelectorAll('.photo-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`item-${photoId}`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Pan map to photo
  if (state.map) {
    state.map.panTo([photo.lng, photo.lat]);
    state.map.setZoom(16);
  }
}

function fitAllPhotos() {
  if (!state.map || state.photos.length === 0) return;
  if (state.photos.length === 1) {
    state.map.setCenter([state.photos[0].lng, state.photos[0].lat]);
    state.map.setZoom(14);
    return;
  }
  if (window.AMap) {
    state.map.setBounds(new AMap.Bounds(
      new AMap.LngLat(Math.min(...state.photos.map(p => p.lng)), Math.min(...state.photos.map(p => p.lat))),
      new AMap.LngLat(Math.max(...state.photos.map(p => p.lng)), Math.max(...state.photos.map(p => p.lat)))
    ));
  }
}

function locateUser() {
  if (!state.map) { showToast('地图未加载', 'error'); return; }
  if (!navigator.geolocation) {
    showToast('浏览器不支持定位', 'error'); return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.map.panTo([pos.coords.longitude, pos.coords.latitude]);
      state.map.setZoom(14);
    },
    () => showToast('定位失败，请检查权限', 'error')
  );
}

let currentMapStyle = 'dark';
function setMapStyle(style) {
  if (!state.map) return;
  if (style === 'satellite') {
    state.map.setMapStyle('amap://styles/satellite');
    document.getElementById('styleStandard').classList.remove('active');
    document.getElementById('styleSatellite').classList.add('active');
  } else {
    state.map.setMapStyle('amap://styles/dark');
    document.getElementById('styleStandard').classList.add('active');
    document.getElementById('styleSatellite').classList.remove('active');
  }
}

// ── Panorama Viewer ───────────────────────────────────────────
let currentDetailPhoto = null;

function openPhotoDetail(photoId) {
  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;
  currentDetailPhoto = photo;

  document.getElementById('detailTitle').textContent = photo.name;
  document.getElementById('detailThumb').src = `/uploads/thumbnails/${photo.thumbnail}`;
  document.getElementById('detailDesc').textContent = photo.description || '暂无描述';
  document.getElementById('detailUploader').textContent = `📸 ${photo.username}`;
  document.getElementById('detailGroup').textContent = photo.group_name ? `📁 ${photo.group_name}` : '';
  document.getElementById('detailDate').textContent = `📅 ${new Date(photo.created_at).toLocaleDateString('zh-CN')}`;

  const deleteBtn = document.getElementById('deletePhotoBtn');
  if (state.user && state.user.id === photo.user_id) {
    deleteBtn.classList.remove('hidden');
  } else {
    deleteBtn.classList.add('hidden');
  }

  document.getElementById('photoDetailModal').classList.remove('hidden');
}

function closePhotoDetail() {
  document.getElementById('photoDetailModal').classList.add('hidden');
  currentDetailPhoto = null;
}

function viewPanoFromDetail() {
  if (!currentDetailPhoto) return;
  closePhotoDetail();
  openPanorama(currentDetailPhoto.id);
}

function deletePhotoFromDetail() {
  if (!currentDetailPhoto) return;
  deletePhoto(currentDetailPhoto.id);
  closePhotoDetail();
}

function openPanorama(photoId, event) {
  if (event) { event.stopPropagation(); }

  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;

  document.getElementById('panoTitle').textContent = photo.name;
  document.getElementById('panoUploader').textContent = `上传者: ${photo.username}`;
  document.getElementById('panoramaOverlay').classList.remove('hidden');

  const container = document.getElementById('panoramaContainer');
  container.innerHTML = '<div id="panoramaViewer" style="width:100%;height:100%;"></div>';

  // Init Pannellum
  state.pannellum = pannellum.viewer('panoramaViewer', {
    type: 'equirectangular',
    panorama: `/uploads/originals/${photo.filename}`,
    autoLoad: true,
    autoRotate: -2,
    compass: false,
    showZoomCtrl: true,
    showFullscreenCtrl: false,
    mouseZoom: true,
    friction: 0.15,
    minHfov: 30,
    maxHfov: 120,
    strings: { loadButtonLabel: '点击加载全景', loadingLabel: '加载中...' }
  });

  // Highlight in sidebar
  document.querySelectorAll('.photo-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`item-${photoId}`);
  if (item) item.classList.add('active');
}

function closePanorama() {
  document.getElementById('panoramaOverlay').classList.add('hidden');
  if (state.pannellum) {
    state.pannellum.destroy();
    state.pannellum = null;
  }
  document.getElementById('panoramaContainer').innerHTML = '';
}

// ── Upload Modal ──────────────────────────────────────────────
function openUploadModal() {
  if (!state.user) {
    showToast('请先登录', 'error'); return;
  }
  document.getElementById('uploadModal').classList.remove('hidden');
  document.getElementById('dropdownMenu').classList.remove('show');

  // Reset form
  document.getElementById('uploadForm').reset();
  document.getElementById('uploadPreview').classList.add('hidden');
  document.getElementById('uploadZoneContent').classList.remove('hidden');
  document.getElementById('locationText').textContent = '点击地图选择位置';
  document.getElementById('uploadError').classList.add('hidden');
  document.getElementById('uploadProgress').classList.add('hidden');
  state.selectedLat = null;
  state.selectedLng = null;
  state.locationMarker = null;

  // Init location picker map
  setTimeout(() => {
    if (state.locationMap) {
      if (typeof state.locationMap.destroy === 'function') state.locationMap.destroy();
      state.locationMap = null;
    }

    if (window.AMap) {
      const center = state.map ? state.map.getCenter() : DEFAULT_CENTER;
      state.locationMap = new AMap.Map('locationMap', {
        zoom: 11,
        center: center,
        mapStyle: 'amap://styles/dark',
        features: ['bg', 'road', 'building', 'point']
      });

      state.locationMap.on('click', (e) => {
        state.selectedLat = e.lnglat.getLat();
        state.selectedLng = e.lnglat.getLng();
        document.getElementById('photoLat').value = state.selectedLat;
        document.getElementById('photoLng').value = state.selectedLng;
        document.getElementById('locationText').textContent =
          `${state.selectedLat.toFixed(6)}, ${state.selectedLng.toFixed(6)}`;

        if (state.locationMarker) state.locationMarker.setMap(null);
        state.locationMarker = new AMap.Marker({
          position: [state.selectedLng, state.selectedLat],
          map: state.locationMap
        });
      });
    } else {
      // Fallback: manual coordinate input when AMap is not loaded
      const mapEl = document.getElementById('locationMap');
      mapEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;padding:16px;height:100%;justify-content:center;align-items:center;color:var(--text-muted);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <p style="font-size:13px;text-align:center;">地图加载中，请手动输入坐标</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;">
            <input id="manualLat" type="number" step="0.000001" min="-90" max="90" placeholder="纬度 (如 39.909)" 
              style="padding:8px;background:var(--bg-dark);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
            <input id="manualLng" type="number" step="0.000001" min="-180" max="180" placeholder="经度 (如 116.397)"
              style="padding:8px;background:var(--bg-dark);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:13px;outline:none;">
          </div>
          <button onclick="applyManualCoords()" style="padding:6px 16px;background:var(--primary);color:white;border-radius:4px;font-size:13px;cursor:pointer;">确认坐标</button>
        </div>`;
    }

    renderGroupOptions();
  }, 100);

  // Drag & drop support
  setupDragDrop();
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.add('hidden');
  if (state.locationMap) {
    state.locationMap.destroy();
    state.locationMap = null;
  }
}

function setupDragDrop() {
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary)';
    zone.style.background = 'var(--primary-light)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background = '';
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect({ files: [file] });
  });
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 50 * 1024 * 1024) {
    showToast('文件过大，最大支持 50MB', 'error'); return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('previewImg');
    img.src = e.target.result;
    document.getElementById('uploadPreview').classList.remove('hidden');
    document.getElementById('uploadZoneContent').classList.add('hidden');

    // Set default name from filename
    const nameInput = document.getElementById('photoName');
    if (!nameInput.value) {
      nameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  };
  reader.readAsDataURL(file);

  // Store file reference
  if (input.files) {
    // Already set via file input
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('photoFile').files = dt.files;
  }
}

async function handleUpload(e) {
  e.preventDefault();

  if (!state.selectedLat || !state.selectedLng) {
    showError(document.getElementById('uploadError'), '请在地图上选择拍摄位置');
    return;
  }

  const file = document.getElementById('photoFile').files[0];
  if (!file) {
    showError(document.getElementById('uploadError'), '请选择要上传的照片');
    return;
  }

  const btn = document.getElementById('uploadSubmitBtn');
  const errorDiv = document.getElementById('uploadError');
  const progress = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');

  errorDiv.classList.add('hidden');
  setLoading(btn, true);
  progress.classList.remove('hidden');

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('name', document.getElementById('photoName').value.trim());
  formData.append('description', document.getElementById('photoDesc').value.trim());
  formData.append('lat', state.selectedLat);
  formData.append('lng', state.selectedLng);
  const groupId = document.getElementById('photoGroup').value;
  if (groupId) formData.append('group_id', groupId);

  try {
    // Simulate progress
    let prog = 0;
    const progInterval = setInterval(() => {
      prog = Math.min(prog + Math.random() * 15, 85);
      fill.style.width = prog + '%';
    }, 200);

    const res = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });
    clearInterval(progInterval);
    fill.style.width = '100%';

    const data = await res.json();
    if (!res.ok) {
      showError(errorDiv, data.error || '上传失败');
    } else {
      showToast('全景照片上传成功！', 'success');
      closeUploadModal();
      await Promise.all([loadPhotos(), loadGroups()]);
      locatePhoto(data.photo.id);
    }
  } catch (err) {
    showError(errorDiv, '网络错误，请重试');
  } finally {
    setLoading(btn, false);
    fill.style.width = '0%';
    progress.classList.add('hidden');
  }
}

// ── Groups Management ─────────────────────────────────────────
function manageGroups() {
  document.getElementById('dropdownMenu').classList.remove('show');
  if (!state.user) { showToast('请先登录', 'error'); return; }
  renderGroupList();
  document.getElementById('groupModal').classList.remove('hidden');
  document.getElementById('groupError').classList.add('hidden');
}

function closeGroupModal() {
  document.getElementById('groupModal').classList.add('hidden');
}

function renderGroupOptions() {
  const select = document.getElementById('photoGroup');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">无分组</option>' +
    state.groups
      .filter(g => !state.user || g.user_id === state.user.id)
      .map(g => `<option value="${g.id}" ${g.id == current ? 'selected' : ''}>${escapeHtml(g.name)}</option>`)
      .join('');
}

function renderGroupList() {
  const container = document.getElementById('groupList');
  if (!container) return;

  if (state.groups.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">暂无分组，创建第一个分组吧！</p>';
    return;
  }

  const myGroups = state.groups.filter(g => !state.user || g.user_id === state.user.id);
  container.innerHTML = myGroups.map(g => `
    <div class="group-item">
      <span class="group-item-dot" style="background:${g.color}"></span>
      <span class="group-item-name">${escapeHtml(g.name)}</span>
      <span class="group-item-count">${g.photo_count || 0} 张</span>
      <button class="btn-icon" onclick="deleteGroup(${g.id})" title="删除分组" style="color:var(--danger)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
  `).join('');
}

async function createGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  const color = document.getElementById('newGroupColor').value;
  const errorDiv = document.getElementById('groupError');

  if (!name) {
    showError(errorDiv, '请输入分组名称'); return;
  }

  try {
    const res = await apiFetch('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
    document.getElementById('newGroupName').value = '';
    errorDiv.classList.add('hidden');
    showToast('分组创建成功', 'success');
    await loadGroups();
    renderGroupList();
  } catch (e) {
    showError(errorDiv, e.message || '创建分组失败');
  }
}

async function deleteGroup(groupId) {
  if (!confirm('确定删除该分组？分组内的照片不会被删除，但会移出分组。')) return;

  try {
    await apiFetch(`/api/groups/${groupId}`, { method: 'DELETE' });
    showToast('分组已删除', 'success');
    await loadGroups();
    renderGroupList();
    await loadPhotos();
  } catch (e) {
    showToast(e.message || '删除分组失败', 'error');
  }
}

function openCreateGroupInline() {
  manageGroups();
}

// ── Photo Actions ─────────────────────────────────────────────
async function deletePhoto(photoId, event) {
  if (event) event.stopPropagation();
  if (!state.user) { showToast('请先登录', 'error'); return; }
  if (!confirm('确定删除这张全景照片？此操作不可撤销。')) return;

  try {
    await apiFetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    showToast('照片已删除', 'success');
    await loadPhotos(document.getElementById('searchInput').value.trim(), state.currentFilter);
  } catch (e) {
    showToast(e.message || '删除失败', 'error');
  }
}

function showMyPhotos() {
  document.getElementById('dropdownMenu').classList.remove('show');
  if (!state.user) return;
  // Filter to show user's photos in sidebar
  showToast('显示我的照片', 'info');
}

// ── API Helper ────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      state.user = null;
      state.token = null;
      updateAuthUI();
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ── UI Helpers ────────────────────────────────────────────────
function setLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  if (text) text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-weight:600">${icons[type] || 'ℹ'}</span> ${escapeHtml(msg)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fadeout');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Manual Coordinates ───────────────────────────────────────
function applyManualCoords() {
  const latEl = document.getElementById('manualLat');
  const lngEl = document.getElementById('manualLng');
  if (!latEl || !lngEl) return;

  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast('请输入有效的经纬度坐标', 'error');
    return;
  }

  state.selectedLat = lat;
  state.selectedLng = lng;
  document.getElementById('photoLat').value = lat;
  document.getElementById('photoLng').value = lng;
  document.getElementById('locationText').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  showToast('坐标已设置', 'success');
}
