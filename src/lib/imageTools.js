// Image engine: compression, AI removal, snip + square + perspective editors.

let segmenterPromise = null;

async function buildSegmenter() {
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');
  const attempts = [
    { dtype: 'q8',   device: navigator.gpu ? 'webgpu' : 'wasm' },
    { dtype: 'q8',   device: 'wasm' },
    { dtype: 'fp32', device: 'wasm' },
  ];
  let lastErr;
  for (const opts of attempts) {
    try { return await pipeline('background-removal', 'Xenova/modnet', opts); }
    catch (err) { lastErr = err; console.warn('[bg] attempt failed', opts, err); }
  }
  throw lastErr;
}

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = buildSegmenter();
    segmenterPromise.catch(() => { segmenterPromise = null; });
  }
  return segmenterPromise;
}

export function preloadBgModel() {
  getSegmenter().catch((err) => console.warn('Model preload skipped:', err));
}

/* ------------------------------- compression ------------------------------- */

export function compressImage(file, maxDimension = 768) {
  return new Promise((resolve) => {
    const img = new Image();
    const srcUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(srcUrl);
    img.onerror = () => { cleanup(); resolve(file); };
    img.onload = () => {
      cleanup();
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
        else                 { width  = Math.round((width  * maxDimension) / height); height = maxDimension; }
      }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      const keepAlpha = /png|webp|avif/i.test(file.type || '');
      c.toBlob((b) => resolve(b || file), keepAlpha ? 'image/png' : 'image/jpeg', 0.9);
    };
    img.src = srcUrl;
  });
}

/* ---------------------------- AI background removal ------------------------ */

export async function autoRemoveBackground(compressedBlob) {
  const seg = await getSegmenter();
  const url = URL.createObjectURL(compressedBlob);
  try {
    const out = await seg(url);
    const raw = Array.isArray(out) ? out[0] : out;
    if (raw && typeof raw.toBlob === 'function') return await raw.toBlob();
    if (raw && typeof raw.toCanvas === 'function') {
      const c = raw.toCanvas();
      return await new Promise((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
    }
    throw new Error('Unexpected pipeline output');
  } finally { URL.revokeObjectURL(url); }
}

/* ------------------------------ homography math ---------------------------- */

// Maps unit square [0,0],[1,0],[1,1],[0,1] -> quad [TL,TR,BR,BL].
function unitSquareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2;
  const dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return [[x1 - x0, x3 - x0, x0],
            [y1 - y0, y3 - y0, y0],
            [0, 0, 1]];
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [[x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
          [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
          [g, h, 1]];
}

function invert3x3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A =  e * i - f * h;
  const B = -(d * i - f * g);
  const C =  d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [[A * id, (c * h - b * i) * id, (b * f - c * e) * id],
          [B * id, (a * i - c * g) * id, (c * d - a * f) * id],
          [C * id, (b * g - a * h) * id, (a * e - b * d) * id]];
}

function multiply3x3(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        r[i][j] += a[i][k] * b[k][j];
  return r;
}

/** Sort 4 arbitrary points into [TL, TR, BR, BL] using sum/diff heuristics. */
export function sortQuad(pts) {
  if (pts.length !== 4) return pts;
  const sum = (p) => p[0] + p[1];
  const sorted = [...pts].sort((a, b) => sum(a) - sum(b));
  const tl = sorted[0];
  const br = sorted[3];
  const a = sorted[1], b = sorted[2];
  const tr = a[0] >= b[0] ? a : b;
  const bl = a[0] >= b[0] ? b : a;
  return [tl, tr, br, bl];
}

/** Average of opposite edges — the quad's "natural" aspect ratio. */
export function suggestAspectRatio(q) {
  const d = (i, j) => Math.hypot(q[j][0] - q[i][0], q[j][1] - q[i][1]);
  const top = d(0, 1), right = d(1, 2), bottom = d(2, 3), left = d(3, 0);
  return [(top + bottom) / 2, (left + right) / 2];
}

/**
 * Warp `src` so the source quad [TL,TR,BR,BL] becomes a destW×destH rectangle.
 * Anything outside the quad is discarded. Bilinear-sampled.
 */
export function perspectiveWarp(src, srcQuad, destW, destH) {
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sw; srcCanvas.height = sh;
  const sctx = srcCanvas.getContext('2d');
  sctx.drawImage(src, 0, 0);
  const srcData = sctx.getImageData(0, 0, sw, sh).data;

  const Hsrc = unitSquareToQuad(srcQuad);
  const Hdst = unitSquareToQuad([[0, 0], [destW, 0], [destW, destH], [0, destH]]);
  const HdstInv = invert3x3(Hdst);
  if (!HdstInv) return null;
  const Hinv = multiply3x3(Hsrc, HdstInv);
  const [[h00, h01, h02], [h10, h11, h12], [h20, h21, h22]] = Hinv;

  const out = document.createElement('canvas');
  out.width = destW; out.height = destH;
  const octx = out.getContext('2d');
  const outImg = octx.createImageData(destW, destH);
  const dst = outImg.data;

  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const w = h20 * x + h21 * y + h22;
      const di = (y * destW + x) * 4;
      if (Math.abs(w) < 1e-8) { dst[di + 3] = 0; continue; }

      const sx = (h00 * x + h01 * y + h02) / w;
      const sy = (h10 * x + h11 * y + h12) / w;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) { dst[di + 3] = 0; continue; }

      const x0 = sx | 0, y0 = sy | 0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 4; c++) {
        dst[di + c] =
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
          srcData[i10 + c] * fx       * (1 - fy) +
          srcData[i01 + c] * (1 - fx) * fy       +
          srcData[i11 + c] * fx       * fy;
      }
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

/** Pick a sensible output size for the warp, honoring aspect ratio + max dimension. */
export function perspectiveDestSize(quad, aspectRatio, maxDim = 1024) {
  const [aw, ah] = aspectRatio || suggestAspectRatio(quad);
  const ratio = aw / ah;
  const edges = [0, 1, 2, 3].map((i) => {
    const j = (i + 1) % 4;
    return Math.hypot(quad[j][0] - quad[i][0], quad[j][1] - quad[i][1]);
  });
  const longest = Math.max(...edges);
  let w = Math.min(maxDim, Math.round(longest));
  let h = Math.round(w / ratio);
  if (h > maxDim) { h = maxDim; w = Math.round(h * ratio); }
  w = Math.max(w, 32); h = Math.max(h, 32);
  return [w, h];
}

/* ================================ EDITORS ================================= */

/**
 * Point editor. Two modes:
 *   'polygon'     — the original freeform snip (any number of points, clips on finish)
 *   'perspective' — 4 corners, auto-closes, draggable handles, warps on export
 */
export class InteractiveOutlineEditor {
  constructor(canvasElement, onStateChange = () => {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onStateChange = onStateChange;
    this.onPerspectiveChange = null;   // (quadSourceCoords) -> void

    this.mode = 'polygon';
    this.sourceImg = null;
    this.points = [];
    this.hoverPoint = null;
    this.isClosed = false;
    this.draggingPoint = -1;

    this._bindEvents();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.draggingPoint = -1;
    if (mode === 'perspective') {
      this.isClosed = false;
      if (this.points.length > 4) this.points = this.points.slice(0, 4);
    }
    this._render();
    this._notifyState();
  }

  loadBlob(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        this.sourceImg = img;
        const scale = Math.min(420 / img.width, 420 / img.height, 1);
        this.canvas.width = Math.round(img.width * scale);
        this.canvas.height = Math.round(img.height * scale);
        this.reset();
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  }

  reset() {
    this.points = [];
    this.hoverPoint = null;
    this.isClosed = false;
    this.draggingPoint = -1;
    this._render();
    this._notifyState();
  }

  undoPoint() {
    if (this.isClosed) this.isClosed = false;
    else this.points.pop();
    this._render();
    this._notifyState();
  }

  /** Returns sorted [TL,TR,BR,BL] in *source image* coordinates, or null. */
  getSourcePoints() {
    if (!this.sourceImg || this.points.length !== 4) return null;
    const sw = this.sourceImg.naturalWidth || this.sourceImg.width;
    const sh = this.sourceImg.naturalHeight || this.sourceImg.height;
    const sx = sw / this.canvas.width;
    const sy = sh / this.canvas.height;
    return sortQuad(this.points.map((p) => [p.x * sx, p.y * sy]));
  }

  _notifyState() {
    this.onStateChange({
      pointCount: this.points.length,
      isClosed: this.isClosed,
      mode: this.mode,
    });
    if (this.mode === 'perspective' && this.points.length === 4 && this.onPerspectiveChange) {
      this.onPerspectiveChange(this.getSourcePoints());
    }
  }

  _getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  _isNearFirstPoint(pt) {
    if (this.points.length < 3) return false;
    const first = this.points[0];
    return Math.hypot(pt.x - first.x, pt.y - first.y) <= 14;
  }

  _hitTest(pt) {
    for (let i = 0; i < this.points.length; i++) {
      if (Math.hypot(pt.x - this.points[i].x, pt.y - this.points[i].y) <= 14) return i;
    }
    return -1;
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.sourceImg || this.isClosed) return;
      e.preventDefault();
      const pt = this._getCoords(e);

      if (this.mode === 'perspective') {
        const idx = this._hitTest(pt);
        if (idx >= 0) {
          this.draggingPoint = idx;
          this.canvas.setPointerCapture(e.pointerId);
          this.canvas.style.cursor = 'grabbing';
          this._render();
          return;
        }
        if (this.points.length >= 4) return;
        this.points.push(pt);
        this._render();
        this._notifyState();
        return;
      }

      if (e.detail > 1) return;
      if (this._isNearFirstPoint(pt)) { this.finishCutout(); return; }
      this.points.push(pt);
      this._render();
      this._notifyState();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.sourceImg) return;

      if (this.mode === 'perspective') {
        if (this.draggingPoint >= 0) {
          this.points[this.draggingPoint] = this._getCoords(e);
          this._render();
          this._notifyState();
          return;
        }
        if (this.points.length) {
          const idx = this._hitTest(this._getCoords(e));
          this.canvas.style.cursor = idx >= 0 ? 'grab' : 'crosshair';
        }
        return;
      }

      if (this.isClosed || this.points.length === 0) return;
      this.hoverPoint = this._getCoords(e);
      this._render();
    });

    this.canvas.addEventListener('pointerup', () => {
      if (this.draggingPoint >= 0) {
        this.draggingPoint = -1;
        this.canvas.style.cursor = 'crosshair';
        this._notifyState();
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPoint = null;
      if (!this.isClosed) this._render();
    });

    this.canvas.addEventListener('dblclick', (e) => {
      if (this.mode !== 'polygon') return;
      if (!this.sourceImg || this.isClosed || this.points.length < 3) return;
      e.preventDefault();
      this.finishCutout();
    });
  }

  _render() {
    if (!this.sourceImg) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.mode === 'polygon' && this.isClosed && this.points.length >= 3) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) this.ctx.lineTo(this.points[i].x, this.points[i].y);
      this.ctx.closePath();
      this.ctx.clip();
      this.ctx.drawImage(this.sourceImg, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      return;
    }

    this.ctx.drawImage(this.sourceImg, 0, 0, this.canvas.width, this.canvas.height);
    if (this.points.length === 0) return;

    const pts = this.points;
    const snapToStart = this.mode === 'polygon' && this.hoverPoint && this._isNearFirstPoint(this.hoverPoint);

    this.ctx.save();

    // Quad fill for perspective mode
    if (this.mode === 'perspective' && pts.length === 4) {
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
      this.ctx.closePath();
      this.ctx.fillStyle = 'rgba(62, 207, 142, 0.12)';
      this.ctx.fill();
    }

    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    if (this.hoverPoint && this.mode === 'polygon') {
      const target = snapToStart ? pts[0] : this.hoverPoint;
      this.ctx.lineTo(target.x, target.y);
    }
    if (this.mode === 'perspective' && pts.length === 4) this.ctx.closePath();
    this.ctx.strokeStyle = '#3ecf8e';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    pts.forEach((pt, idx) => {
      this.ctx.beginPath();
      const r = (idx === 0 && snapToStart) || this.draggingPoint === idx ? 8 : 5;
      this.ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = idx === 0 && this.mode === 'polygon' ? '#3ecf8e' : '#ffffff';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#18181b';
      this.ctx.stroke();

      if (this.mode === 'perspective') {
        this.ctx.fillStyle = '#18181b';
        this.ctx.font = 'bold 11px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(String(idx + 1), pt.x, pt.y);
      }
    });

    this.ctx.restore();
  }

  finishCutout() {
    if (this.mode !== 'polygon') return;
    if (!this.sourceImg || this.points.length < 3) return;
    this.isClosed = true;
    this.hoverPoint = null;
    this._render();
    this._notifyState();
  }

  /** Polygon mode: clip to polygon at full source resolution. */
  exportBlob() {
    if (this.mode === 'perspective') return Promise.resolve(null);
    if (!this.isClosed && this.points.length >= 3) this.finishCutout();
    return new Promise((resolve) => {
      const img = this.sourceImg;
      if (!img || this.points.length < 3) { resolve(null); return; }
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const sx = w / this.canvas.width, sy = h / this.canvas.height;
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ctx = out.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(this.points[0].x * sx, this.points[0].y * sy);
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x * sx, this.points[i].y * sy);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, w, h);
      out.toBlob((b) => resolve(b), 'image/png');
    });
  }

  /** Perspective mode: homography-warp the source image using the 4 corners. */
  exportPerspectiveBlob(aspectRatio, maxDim = 1024) {
    const quad = this.getSourcePoints();
    if (!quad) return Promise.resolve(null);
    const [dw, dh] = perspectiveDestSize(quad, aspectRatio, maxDim);
    const canvas = perspectiveWarp(this.sourceImg, quad, dw, dh);
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }
}

/* ------------------------------ square editor ------------------------------ */

export class SquareCropEditor {
  constructor(canvasElement, onZoomChange = () => {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onZoomChange = onZoomChange;
    this.size = 512;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.sourceImg = null;
    this.baseScale = 1;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, ox: 0, oy: 0 };
    this._pxScale = 1;
    this._bindEvents();
  }

  loadBlob(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        this.sourceImg = img;
        this.baseScale = Math.max(this.size / img.width, this.size / img.height);
        this.zoom = 1; this.offsetX = 0; this.offsetY = 0;
        this.onZoomChange(this.zoom);
        this._render(true);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  }

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(4, Number(z) || 1));
    this._clampOffsets();
    this.onZoomChange(this.zoom);
    this._render(true);
  }

  reset() {
    this.zoom = 1; this.offsetX = 0; this.offsetY = 0;
    this.onZoomChange(this.zoom);
    this._render(true);
  }

  _clampOffsets() {
    if (!this.sourceImg) return;
    const dw = this.sourceImg.width * this.baseScale * this.zoom;
    const dh = this.sourceImg.height * this.baseScale * this.zoom;
    this.offsetX = Math.max(-(dw - this.size) / 2, Math.min((dw - this.size) / 2, this.offsetX));
    this.offsetY = Math.max(-(dh - this.size) / 2, Math.min((dh - this.size) / 2, this.offsetY));
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.sourceImg) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      this._pxScale = this.canvas.width / rect.width;
      this.isDragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.dragStart = { x: e.clientX, y: e.clientY, ox: this.offsetX, oy: this.offsetY };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.sourceImg) return;
      this.offsetX = this.dragStart.ox + (e.clientX - this.dragStart.x) * this._pxScale;
      this.offsetY = this.dragStart.oy + (e.clientY - this.dragStart.y) * this._pxScale;
      this._clampOffsets();
      this._render(true);
    });
    const stop = () => { this.isDragging = false; };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.sourceImg) return;
      e.preventDefault();
      this.setZoom(this.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    }, { passive: false });
  }

  _render(showGuides = true) {
    if (!this.sourceImg) return;
    this.ctx.clearRect(0, 0, this.size, this.size);
    const dw = this.sourceImg.width * this.baseScale * this.zoom;
    const dh = this.sourceImg.height * this.baseScale * this.zoom;
    const x = (this.size - dw) / 2 + this.offsetX;
    const y = (this.size - dh) / 2 + this.offsetY;
    this.ctx.drawImage(this.sourceImg, x, y, dw, dh);
    if (showGuides) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      this.ctx.lineWidth = 1;
      const t = this.size / 3;
      this.ctx.beginPath();
      this.ctx.moveTo(t, 0); this.ctx.lineTo(t, this.size);
      this.ctx.moveTo(t * 2, 0); this.ctx.lineTo(t * 2, this.size);
      this.ctx.moveTo(0, t); this.ctx.lineTo(this.size, t);
      this.ctx.moveTo(0, t * 2); this.ctx.lineTo(this.size, t * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  exportBlob() {
    this._render(false);
    return new Promise((resolve) => {
      this.canvas.toBlob((b) => { this._render(true); resolve(b); }, 'image/png');
    });
  }
}
