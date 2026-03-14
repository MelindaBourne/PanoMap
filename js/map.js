/* js/map.js — Amap 2.0 map module */
const MapMod = {
  map:          null,
  uploadMap:    null,
  uploadMarker: null,
  markers:      {},      // panoId → AMap.Marker
  _uploadAC:    null,

  /* ── Guard helper ────────────────────────────────── */
  _amapReady() {
    return typeof AMap !== 'undefined' && this.map !== null;
  },

  /* ── Main map ────────────────────────────────────── */
  initMainMap() {
    if (typeof AMap === 'undefined') return;
    this.map = new AMap.Map('map', {
      center:   CONFIG.DEFAULT_CENTER,
      zoom:     CONFIG.DEFAULT_ZOOM,
      mapStyle: 'amap://styles/normal',
    });

    // Load existing markers
    DB.getAllPanos().forEach(p => this.addMarker(p));
  },

  addMarker(pano) {
    if (!this._amapReady()) return;

    // Remove stale marker if exists
    if (this.markers[pano.id]) {
      this.map.remove(this.markers[pano.id]);
    }

    const html = `
      <div class="pano-marker" data-id="${pano.id}">
        <div class="mk-card">
          <img class="mk-thumb" src="${pano.thumbnail}" alt="${this._esc(pano.name)}" />
          <div class="mk-name">${this._esc(pano.name)}</div>
        </div>
        <div class="mk-pin"></div>
        <div class="mk-dot"></div>
      </div>`;

    const marker = new AMap.Marker({
      position: new AMap.LngLat(pano.lng, pano.lat),
      content:  html,
      offset:   new AMap.Pixel(-44, -80),
      zIndex:   100,
    });

    marker.on('click', () => App.openPanorama(pano.id));
    this.map.add(marker);
    this.markers[pano.id] = marker;
  },

  removeMarker(id) {
    if (!this._amapReady() || !this.markers[id]) return;
    this.map.remove(this.markers[id]);
    delete this.markers[id];
  },

  flyTo(lat, lng, zoom = 15) {
    if (!this._amapReady()) return;
    this.map.setZoomAndCenter(zoom, [lng, lat], false, 400);
  },

  /* ── Upload mini-map ─────────────────────────────── */
  initUploadMap() {
    if (typeof AMap === 'undefined') return;
    if (this.uploadMap) {
      this.uploadMap.resize();
      return;
    }

    this.uploadMap = new AMap.Map('upload-map', {
      center: this.map ? this.map.getCenter() : CONFIG.DEFAULT_CENTER,
      zoom:   12,
    });

    // Click to place marker
    this.uploadMap.on('click', (e) => {
      const { lng, lat } = e.lnglat;
      this._setUploadPin(lat, lng);
    });

    // Address autocomplete for the search field
    AMap.plugin('AMap.AutoComplete', () => {
      this._uploadAC = new AMap.AutoComplete({ input: 'loc-search', city: '全国' });
      this._uploadAC.on('select', (e) => {
        if (e.poi && e.poi.location) {
          const lng = e.poi.location.getLng();
          const lat = e.poi.location.getLat();
          this._setUploadPin(lat, lng);
          this.uploadMap.setCenter([lng, lat]);
        }
      });
    });
  },

  destroyUploadMap() {
    if (this._uploadAC) { this._uploadAC.clearEvents(); this._uploadAC = null; }
    if (this.uploadMarker) { this.uploadMap && this.uploadMap.remove(this.uploadMarker); this.uploadMarker = null; }
    if (this.uploadMap) { this.uploadMap.destroy(); this.uploadMap = null; }
  },

  _setUploadPin(lat, lng) {
    if (this.uploadMarker) this.uploadMap.remove(this.uploadMarker);
    this.uploadMarker = new AMap.Marker({ position: [lng, lat] });
    this.uploadMap.add(this.uploadMarker);

    document.getElementById('photo-lat').value = lat;
    document.getElementById('photo-lng').value = lng;
    document.getElementById('lat-val').textContent = lat.toFixed(6);
    document.getElementById('lng-val').textContent = lng.toFixed(6);
  },

  /* ── GPS ─────────────────────────────────────────── */
  getCurrentLocation() {
    if (typeof AMap === 'undefined') {
      return Promise.reject(new Error('地图服务未加载，无法获取位置'));
    }
    return new Promise((resolve, reject) => {
      AMap.plugin('AMap.Geolocation', () => {
        const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 8000 });
        geo.getCurrentPosition((status, result) => {
          if (status === 'complete') {
            resolve({ lat: result.position.lat, lng: result.position.lng });
          } else {
            reject(new Error('无法获取当前位置，请手动在地图上选择'));
          }
        });
      });
    });
  },

  /* ── Helpers ─────────────────────────────────────── */
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
