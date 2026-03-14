/* js/panorama.js — Pannellum-based panorama viewer */
const PanoViewer = {
  _viewer: null,
  _blobUrl: null,

  async open(panoId) {
    const pano = DB.getPano(panoId);
    if (!pano) throw new Error('找不到全景照片');

    let imageUrl;

    if (pano.isRemote) {
      // Demo panoramas: use URL directly
      imageUrl = pano.imageUrl;
    } else {
      // User-uploaded: load from IndexedDB
      const blob = await DB.getImage(panoId);
      if (!blob) throw new Error('图片数据丢失');
      // Revoke previous URL
      if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = URL.createObjectURL(blob);
      imageUrl = this._blobUrl;
    }

    // Update HUD
    document.getElementById('pano-title-hud').textContent = pano.name;
    document.getElementById('pano-desc-hud').textContent  = pano.description || '';

    // Show overlay
    document.getElementById('pano-overlay').classList.remove('hidden');

    // Destroy previous viewer before creating a new one
    if (this._viewer) {
      try { this._viewer.destroy(); } catch (_) { /* destroy() may throw if viewer DOM is already removed */ }
      this._viewer = null;
    }
    // Clear container
    const container = document.getElementById('pano-viewer');
    container.innerHTML = '';

    // Init Pannellum
    this._viewer = pannellum.viewer('pano-viewer', {
      type:         'equirectangular',
      panorama:     imageUrl,
      autoLoad:     true,
      showControls: false,   // use custom HUD; pannellum controls are minimal
      mouseZoom:    true,
      hfov:         100,
      minHfov:      30,
      maxHfov:      120,
      autoRotate:   0,
    });
  },

  close() {
    if (this._viewer) {
      try { this._viewer.destroy(); } catch (_) { /* destroy() may throw if viewer DOM is already removed */ }
      this._viewer = null;
    }
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
    const container = document.getElementById('pano-viewer');
    container.innerHTML = '';
    document.getElementById('pano-overlay').classList.add('hidden');
  },
};
