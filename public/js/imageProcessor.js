import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm';

let segmenterPromise = null;

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      try {
        return await pipeline('background-removal', 'Xenova/modnet', {
          dtype: 'q8',
          device: navigator.gpu ? 'webgpu' : 'wasm',
        });
      } catch {
        return await pipeline('background-removal', 'Xenova/modnet', {
          dtype: 'q8',
          device: 'wasm',
        });
      }
    })();
  }
  return segmenterPromise;
}

export function preloadBgModel() {
  getSegmenter().catch((err) => console.warn('Model preload skipped:', err));
}

// 1. Client-side compression & downscaling
export function compressImage(file, maxDimension = 768) {
  return new Promise((resolve) => {
    const img = new Image();
    const srcUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(srcUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    };
    img.src = srcUrl;
  });
}

// 2. Fast GPU-Accelerated Background Removal
export async function autoRemoveBackground(compressedBlob) {
  const segmenter = await getSegmenter();
  const blobUrl = URL.createObjectURL(compressedBlob);
  try {
    const output = await segmenter(blobUrl);
    return await output[0].toBlob();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// 3. Precision Point-to-Point Polygon Snip Editor
export class InteractiveOutlineEditor {
  constructor(canvasElement, onStateChange = () => {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onStateChange = onStateChange;
    this.sourceImg = null;
    this.points = [];
    this.hoverPoint = null;
    this.isClosed = false;
    this._bindEvents();
  }

  export class SquareCropEditor {
    constructor(canvasElement, onZoomChange = () => {}) {
      this.canvas = canvasElement;
      this.ctx = canvasElement.getContext('2d');
      this.onZoomChange = onZoomChange;
      this.size = 320;
      this.canvas.width = this.size;
      this.canvas.height = this.size;

      this.sourceImg = null;
      this.baseScale = 1;
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.isDragging = false;
      this.dragStart = { x: 0, y: 0 };

      this._bindEvents();
    }

    loadBlob(blob) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          this.sourceImg = img;
          // Base scale fills the square completely at 1.0x zoom
          this.baseScale = Math.max(this.size / img.width, this.size / img.height);
          this.zoom = 1;
          this.offsetX = 0;
          this.offsetY = 0;
          this.onZoomChange(this.zoom);
          this._render(true);
          resolve();
        };
        img.src = url;
      });
    }

    setZoom(newZoom) {
      this.zoom = Math.max(1, Math.min(4, Number(newZoom)));
      this._clampOffsets();
      this.onZoomChange(this.zoom);
      this._render(true);
    }

    reset() {
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.onZoomChange(this.zoom);
      this._render(true);
    }

    _clampOffsets() {
      if (!this.sourceImg) return;
      const drawW = this.sourceImg.width * this.baseScale * this.zoom;
      const drawH = this.sourceImg.height * this.baseScale * this.zoom;
      const maxOffsetX = Math.max(0, (drawW - this.size) / 2);
      const maxOffsetY = Math.max(0, (drawH - this.size) / 2);
      this.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.offsetX));
      this.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.offsetY));
    }

    _bindEvents() {
      this.canvas.addEventListener('pointerdown', (e) => {
        if (!this.sourceImg) return;
        e.preventDefault();
        this.isDragging = true;
        this.canvas.setPointerCapture(e.pointerId);
        this.dragStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
      });

      this.canvas.addEventListener('pointermove', (e) => {
        if (!this.isDragging || !this.sourceImg) return;
        this.offsetX = e.clientX - this.dragStart.x;
        this.offsetY = e.clientY - this.dragStart.y;
        this._clampOffsets();
        this._render(true);
      });

      const stopDrag = () => {
        this.isDragging = false;
      };
      this.canvas.addEventListener('pointerup', stopDrag);
      this.canvas.addEventListener('pointercancel', stopDrag);

      // Optional: scroll wheel over the square to scale up/down smoothly
      this.canvas.addEventListener('wheel', (e) => {
        if (!this.sourceImg) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.setZoom(this.zoom + delta);
      }, { passive: false });
    }

    _render(showGuides = true) {
      if (!this.sourceImg) return;
      this.ctx.clearRect(0, 0, this.size, this.size);

      const drawW = this.sourceImg.width * this.baseScale * this.zoom;
      const drawH = this.sourceImg.height * this.baseScale * this.zoom;
      const x = (this.size - drawW) / 2 + this.offsetX;
      const y = (this.size - drawH) / 2 + this.offsetY;

      this.ctx.drawImage(this.sourceImg, x, y, drawW, drawH);

      // Subtle alignment grid during editing (excluded when exporting)
      if (showGuides) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.lineWidth = 1;
        const third = this.size / 3;
        this.ctx.beginPath();
        this.ctx.moveTo(third, 0);
        this.ctx.lineTo(third, this.size);
        this.ctx.moveTo(third * 2, 0);
        this.ctx.lineTo(third * 2, this.size);
        this.ctx.moveTo(0, third);
        this.ctx.lineTo(this.size, third);
        this.ctx.moveTo(0, third * 2);
        this.ctx.lineTo(this.size, third * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    exportBlob() {
      this._render(false); // Render clean square without alignment lines
      return new Promise((resolve) => {
        this.canvas.toBlob((blob) => {
          this._render(true); // Restore guides on screen
          resolve(blob);
        }, 'image/png');
      });
    }
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
      img.src = url;
    });
  }

  reset() {
    this.points = [];
    this.hoverPoint = null;
    this.isClosed = false;
    this._render();
    this.onStateChange({ pointCount: 0, isClosed: false });
  }

  undoPoint() {
    if (this.isClosed) {
      this.isClosed = false;
    } else {
      this.points.pop();
    }
    this._render();
    this.onStateChange({ pointCount: this.points.length, isClosed: this.isClosed });
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

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.sourceImg || this.isClosed) return;
      e.preventDefault();
      const pt = this._getCoords(e);

      // Clicking near the starting point closes and snips the polygon
      if (this._isNearFirstPoint(pt)) {
        this.finishCutout();
        return;
      }

      this.points.push(pt);
      this._render();
      this.onStateChange({ pointCount: this.points.length, isClosed: false });
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.sourceImg || this.isClosed || this.points.length === 0) return;
      this.hoverPoint = this._getCoords(e);
      this._render();
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPoint = null;
      if (!this.isClosed) this._render();
    });

    this.canvas.addEventListener('dblclick', (e) => {
      if (!this.sourceImg || this.isClosed || this.points.length < 3) return;
      e.preventDefault();
      this.finishCutout();
    });
  }

  _render() {
    if (!this.sourceImg) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.isClosed && this.points.length >= 3) {
      // Render clipped transparent cutout
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
        this.ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      this.ctx.closePath();
      this.ctx.clip();
      this.ctx.drawImage(this.sourceImg, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      return;
    }

    // Draw full source image + polygon guide lines & vertex dots
    this.ctx.drawImage(this.sourceImg, 0, 0, this.canvas.width, this.canvas.height);
    if (this.points.length === 0) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      this.ctx.lineTo(this.points[i].x, this.points[i].y);
    }

    // Live rubber-band line to cursor
    const snapToStart = this.hoverPoint && this._isNearFirstPoint(this.hoverPoint);
    if (this.hoverPoint) {
      const target = snapToStart ? this.points[0] : this.hoverPoint;
      this.ctx.lineTo(target.x, target.y);
    }

    this.ctx.strokeStyle = '#3ecf8e';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    // Draw clickable vertex dots
    this.points.forEach((pt, idx) => {
      this.ctx.beginPath();
      const radius = idx === 0 && snapToStart ? 8 : 4.5;
      this.ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = idx === 0 ? '#3ecf8e' : '#ffffff';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#18181b';
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  finishCutout() {
    if (!this.sourceImg || this.points.length < 3) return;
    this.isClosed = true;
    this.hoverPoint = null;
    this._render();
    this.onStateChange({ pointCount: this.points.length, isClosed: true });
  }

  exportBlob() {
    if (!this.isClosed && this.points.length >= 3) {
      this.finishCutout();
    }
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }
}

export class SquareCropEditor {
  constructor(canvasElement, onZoomChange = () => {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onZoomChange = onZoomChange;
    this.size = 320;
    this.canvas.width = this.size;
    this.canvas.height = this.size;

    this.sourceImg = null;
    this.baseScale = 1;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this._bindEvents();
  }

  loadBlob(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        this.sourceImg = img;
        // Base scale fills the square completely at 1.0x zoom
        this.baseScale = Math.max(this.size / img.width, this.size / img.height);
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.onZoomChange(this.zoom);
        this._render(true);
        resolve();
      };
      img.src = url;
    });
  }

  setZoom(newZoom) {
    this.zoom = Math.max(1, Math.min(4, Number(newZoom)));
    this._clampOffsets();
    this.onZoomChange(this.zoom);
    this._render(true);
  }

  reset() {
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.onZoomChange(this.zoom);
    this._render(true);
  }

  _clampOffsets() {
    if (!this.sourceImg) return;
    const drawW = this.sourceImg.width * this.baseScale * this.zoom;
    const drawH = this.sourceImg.height * this.baseScale * this.zoom;
    const maxOffsetX = Math.max(0, (drawW - this.size) / 2);
    const maxOffsetY = Math.max(0, (drawH - this.size) / 2);
    this.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.offsetX));
    this.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.offsetY));
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.sourceImg) return;
      e.preventDefault();
      this.isDragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.dragStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.sourceImg) return;
      this.offsetX = e.clientX - this.dragStart.x;
      this.offsetY = e.clientY - this.dragStart.y;
      this._clampOffsets();
      this._render(true);
    });

    const stopDrag = () => {
      this.isDragging = false;
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);

    // Optional: scroll wheel over the square to scale up/down smoothly
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.sourceImg) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.setZoom(this.zoom + delta);
    }, { passive: false });
  }

  _render(showGuides = true) {
    if (!this.sourceImg) return;
    this.ctx.clearRect(0, 0, this.size, this.size);

    const drawW = this.sourceImg.width * this.baseScale * this.zoom;
    const drawH = this.sourceImg.height * this.baseScale * this.zoom;
    const x = (this.size - drawW) / 2 + this.offsetX;
    const y = (this.size - drawH) / 2 + this.offsetY;

    this.ctx.drawImage(this.sourceImg, x, y, drawW, drawH);

    // Subtle alignment grid during editing (excluded when exporting)
    if (showGuides) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      this.ctx.lineWidth = 1;
      const third = this.size / 3;
      this.ctx.beginPath();
      this.ctx.moveTo(third, 0);
      this.ctx.lineTo(third, this.size);
      this.ctx.moveTo(third * 2, 0);
      this.ctx.lineTo(third * 2, this.size);
      this.ctx.moveTo(0, third);
      this.ctx.lineTo(this.size, third);
      this.ctx.moveTo(0, third * 2);
      this.ctx.lineTo(this.size, third * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  exportBlob() {
    this._render(false); // Render clean square without alignment lines
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        this._render(true); // Restore guides on screen
        resolve(blob);
      }, 'image/png');
    });
  }
}
