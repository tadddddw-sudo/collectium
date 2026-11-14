import { CollectiumAPI, Session } from '../api.js';
import {
  compressImage,
  autoRemoveBackground,
  preloadBgModel,
  InteractiveOutlineEditor,
  SquareCropEditor,
  perspectiveWarp,
  perspectiveDestSize,
} from './imageTools.js';

const $ = (id) => document.getElementById(id);

// ---- URL / state ----
const params = new URLSearchParams(location.search);
// Accept both `?id=` (from profileView) and legacy `?collection=` deep links
const collectionId = params.get('id') || params.get('collection');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clampInt = (v, a, b) => clamp(parseInt(v, 10) || a, a, b);

let collection = null;   // normalized local shape
let page = 0;            // current binder page (0-based)
let isOwner = false;     // computed from auth + collection ownership

// -------------------------------------------------------------
// Shape mapping: server <-> local
// -------------------------------------------------------------

function toLayoutConfig(layout, type) {
  if (type === 'binder') {
    return {
      pages: layout.pages,
      rows: layout.rows,
      cols: layout.cols,
      show_grid: !!layout.showGrid,
    };
  }
  return { theme: 'glass_shelf' };
}

function normalizeItem(raw, perPage) {
  const pageNumber = Number(raw.page_number) || 1;
  const slotIndex  = raw.slot_index != null ? Number(raw.slot_index) : null;
  const flatSlot   = slotIndex != null ? (pageNumber - 1) * perPage + slotIndex : null;
  const pos        = raw.position_data || {};
  return {
    id: raw.id,
    name: raw.name,
    desc: raw.description || '',
    img: raw.image_url,
    slot: flatSlot,          // flat index across all pages, or null (case items)
    page_number: pageNumber, // 1-based
    slot_index: slotIndex,   // 0-based within page, or null (case items)
    x: pos.x ?? 50,
    y: pos.y ?? 50,
    scale: pos.scale ?? 1,
    z_index: pos.z_index ?? 1,
  };
}

function normalizeCollection(raw) {
  const lc = raw.layout_config || {};
  const rows = Number(lc.rows) || 3;
  const cols = Number(lc.cols) || 3;
  const perPage = rows * cols;
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.description || '',
    type: raw.type,
    user_id: raw.user_id,
    profileUsername: raw.profiles?.username,
    layout: {
      pages: Number(lc.pages) || 4,
      rows,
      cols,
      showGrid: lc.show_grid !== false,
    },
    items: (raw.collection_items || []).map((it) => normalizeItem(it, perPage)),
  };
}

// -------------------------------------------------------------
// Load
// -------------------------------------------------------------

async function loadCollection() {
  if (!collectionId) throw new Error('No collection id in URL.');
  const { collection: raw } = await CollectiumAPI.getCollection(collectionId);
  collection = normalizeCollection(raw);

  // Never hide items that live on pages beyond layout_config.pages
  const maxItemPage = collection.items.reduce(
    (m, it) => Math.max(m, it.page_number || 1), 1
  );
  collection.layout.pages = Math.max(collection.layout.pages, maxItemPage);

  // Owner check
  const me = Session.getProfile();
  isOwner = !!me && (me.id === collection.user_id || me.username === collection.profileUsername);
  if (params.get('viewer') === '1') isOwner = false;

  page = clamp(page, 0, Math.max(0, collection.layout.pages - 1));
  render();
}

// -------------------------------------------------------------
// Binder
// -------------------------------------------------------------

function slotCount() {
  return collection.layout.pages * collection.layout.rows * collection.layout.cols;
}

function nextFreeSlot() {
  const perPage = collection.layout.rows * collection.layout.cols;
  const used = new Set(
    collection.items.filter((i) => i.slot != null).map((i) => i.slot)
  );
  const maxSlots = slotCount();
  for (let s = 0; s < maxSlots; s++) if (!used.has(s)) return s;
  return maxSlots; // caller must bump pages
}

function renderBinder() {
  const { pages, rows, cols, showGrid } = collection.layout;
  page = clamp(page, 0, pages - 1);
  const perPage = rows * cols;
  const grid = $('binder-grid');
  grid.className = 'binder-grid ' + (showGrid ? 'grid-visible' : 'grid-hidden');
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.innerHTML = '';

  const binderItems = collection.items.filter((it) => it.slot != null);

  for (let i = 0; i < perPage; i++) {
    const slotIndex = page * perPage + i;
    const item = binderItems.find((it) => it.slot === slotIndex);
    const slot = document.createElement('div');
    slot.className = 'binder-slot';

    if (item) {
      const img = document.createElement('img');
      img.src = item.img;
      img.alt = item.name;
      const label = document.createElement('div');
      label.className = 'slot-label';
      label.textContent = item.name;
      slot.append(img, label);
      slot.addEventListener('click', () => openItem(item));
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-slot';
      empty.textContent = isOwner ? '+ Add item' : '';
      slot.appendChild(empty);
      if (isOwner) slot.addEventListener('click', () => openUpload(slotIndex));
    }
    grid.appendChild(slot);
  }

  $('page-indicator').textContent = `Page ${page + 1} of ${pages}`;
  $('prev-page').disabled = page <= 0;
  $('next-page').disabled = page >= pages - 1;
}

// -------------------------------------------------------------
// Display case
// -------------------------------------------------------------

function renderCase() {
  const stage = $('case-stage');
  stage.innerHTML = '';

  const caseItems = collection.items.filter((it) => it.slot == null);

  caseItems.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'case-item';
    node.style.left = `${item.x ?? 50}%`;
    node.style.top  = `${item.y ?? 50}%`;

    const img = document.createElement('img');
    img.src = item.img;
    img.alt = item.name;
    node.appendChild(img);
    stage.appendChild(node);

    if (!isOwner) {
      node.addEventListener('click', () => openItem(item));
      return;
    }

    let dragging = false, moved = 0, startX = 0, startY = 0, origX = 0, origY = 0;

    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true; moved = 0;
      startX = e.clientX; startY = e.clientY;
      origX = item.x ?? 50; origY = item.y ?? 50;
      node.setPointerCapture(e.pointerId);
      node.style.cursor = 'grabbing';
    });

    node.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;
      moved = Math.max(moved, Math.hypot(e.clientX - startX, e.clientY - startY));
      item.x = clamp(origX + dx, 5, 95);
      item.y = clamp(origY + dy, 8, 92);
      node.style.left = `${item.x}%`;
      node.style.top  = `${item.y}%`;
    });

    const end = async () => {
      if (!dragging) return;
      dragging = false;
      node.style.cursor = 'grab';
      if (moved < 5) { openItem(item); return; }
      try {
        await CollectiumAPI.updateItem(item.id, {
          position_data: {
            x: item.x,
            y: item.y,
            scale: item.scale ?? 1,
            z_index: item.z_index ?? 1,
          },
        });
      } catch (err) {
        console.error('Position save failed', err);
      }
    };

    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', () => {
      dragging = false; node.style.cursor = 'grab';
    });
  });

  if (!caseItems.length) {
    const hint = document.createElement('p');
    hint.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:#71717a;font-size:0.9rem;text-align:center;padding:1rem;';
    hint.textContent = isOwner
      ? 'No items yet — click “Add Memorabilia Item”.'
      : 'No items in this showcase yet.';
    stage.appendChild(hint);
  }
}

// -------------------------------------------------------------
// Render dispatcher
// -------------------------------------------------------------

function syncCustomizer() {
  $('edit-pages').value = collection.layout.pages;
  $('edit-rows').value  = collection.layout.rows;
  $('edit-cols').value  = collection.layout.cols;
  $('edit-grid').checked = !!collection.layout.showGrid;
}

function render() {
  $('col-title').textContent    = collection.title;
  $('col-subtitle').textContent = collection.subtitle || '';
  document.title = `${collection.title} — Collectium`;

  $('case-add-btn').style.display = isOwner ? '' : 'none';
  $('case-add-btn').textContent = collection.type === 'binder'
    ? '+ Add Collectible'
    : '+ Add Memorabilia Item';
  $('binder-customizer').style.display = isOwner ? 'flex' : 'none';

  if (collection.type === 'binder') {
    $('binder-view').style.display = '';
    $('case-view').style.display   = 'none';
    renderBinder();
  } else {
    $('binder-view').style.display = 'none';
    $('case-view').style.display   = '';
    renderCase();
  }
  syncCustomizer();
}

// -------------------------------------------------------------
// Share / item modal
// -------------------------------------------------------------

function renderQR(text) {
  const img = $('share-item-qr');
  if (typeof window.qrcode === 'function') {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      img.src = qr.createDataURL(6, 4);
      img.style.display = '';
      return;
    } catch (err) { console.warn(err); }
  }
  img.removeAttribute('src');
  img.style.display = 'none';
}

let currentItem = null;

function openItem(item) {
  currentItem = item;
  $('share-item-img').src = item.img;
  $('share-item-img').alt = item.name;
  $('share-item-name').textContent = item.name;
  $('share-item-desc').textContent = item.desc || '';

  const url = new URL(location.href);
  url.searchParams.set('id', collection.id);
  url.searchParams.set('item', item.id);
  $('share-item-url').value = url.toString();
  renderQR(url.toString());

  $('delete-item-btn').style.display = isOwner ? '' : 'none';
  $('item-modal').style.display = 'flex';
}

$('delete-item-btn').addEventListener('click', async () => {
  if (!currentItem || !isOwner) return;
  if (!confirm(`Delete "${currentItem.name}"?`)) return;
  const btn = $('delete-item-btn');
  btn.disabled = true;
  try {
    await CollectiumAPI.deleteItem(currentItem.id);
    currentItem = null;
    $('item-modal').style.display = 'none';
    await loadCollection();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// Upload / image editing pipeline (unchanged except persistence)
// -------------------------------------------------------------

const upload = {
  mode: 'auto',
  pendingSlot: null,
  blob: null,
  autoBlob: null,
  autoPromise: null,
};
const setStatus = (m) => { $('bg-status').textContent = m || ''; };

const outlineEditor = new InteractiveOutlineEditor($('outline-canvas'), ({ pointCount, isClosed }) => {
  $('undo-point-btn').disabled = !(pointCount > 0 || isClosed);
  $('finish-snip-btn').disabled = !(pointCount >= 3 && !isClosed);
});
outlineEditor.onPerspectiveChange = (quad) => updatePerspectivePreview(quad);

const squareEditor = new SquareCropEditor($('square-canvas'), (z) => {
  $('square-zoom-slider').value = z;
  $('square-zoom-label').textContent = `${Number(z).toFixed(1)}x`;
});

const modeButtons = [
  $('mode-auto-btn'),
  $('mode-manual-btn'),
  $('mode-perspective-btn'),
  $('mode-square-btn'),
];
let perspectiveAspect = 'auto';

function getPerspectiveAspect() {
  if (perspectiveAspect === 'auto') return null;
  const [w, h] = perspectiveAspect.split(':').map(Number);
  return [w, h];
}

function updatePerspectivePreview(quad) {
  const wrap = $('perspective-preview-wrap');
  const img  = $('perspective-preview');
  if (!quad || !outlineEditor.sourceImg) { wrap.style.display = 'none'; return; }
  const aspect = getPerspectiveAspect();
  const [dw, dh] = perspectiveDestSize(quad, aspect, 400);
  const canvas = perspectiveWarp(outlineEditor.sourceImg, quad, dw, dh);
  if (!canvas) { wrap.style.display = 'none'; return; }
  canvas.toBlob((blob) => {
    if (!blob) return;
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    const url = URL.createObjectURL(blob);
    img.dataset.url = url;
    img.src = url;
    wrap.style.display = 'block';
  }, 'image/png');
}

function updateModeUI() {
  const mode    = upload.mode;
  const hasImg  = !!upload.blob;
  const isSnip  = mode === 'manual';
  const isPersp = mode === 'perspective';

  modeButtons.forEach((b) => b.classList.toggle('active', b.id === `mode-${mode}-btn`));
  $('ai-preview-wrap').style.display = mode === 'auto' && upload.autoBlob ? 'block' : 'none';
  $('manual-editor-wrap').style.display = (isSnip || isPersp) && hasImg ? 'block' : 'none';
  $('square-editor-wrap').style.display = mode === 'square' && hasImg ? 'block' : 'none';
  $('perspective-controls').style.display = isPersp ? 'block' : 'none';
  $('finish-snip-btn').style.display = isPersp ? 'none' : '';
  $('snip-hint').textContent = isPersp
    ? 'Click the 4 corners of your item (any order). Drag any dot to fine-tune. Preview updates live.'
    : 'Click points around your item, then click the first green dot (or Finish) to snip.';
}

function setMode(mode) {
  upload.mode = mode;
  if (mode === 'manual' || mode === 'perspective') {
    outlineEditor.setMode(mode === 'perspective' ? 'perspective' : 'polygon');
  }
  updateModeUI();
  if (mode === 'auto' && upload.blob && !upload.autoBlob) runAuto().catch(() => {});
  if (mode === 'perspective' && outlineEditor.points.length === 4) {
    updatePerspectivePreview(outlineEditor.getSourcePoints());
  } else if (mode !== 'perspective') {
    $('perspective-preview-wrap').style.display = 'none';
  }
}

function runAuto() {
  if (!upload.blob) return Promise.reject(new Error('No image'));
  if (upload.autoBlob) return Promise.resolve(upload.autoBlob);
  if (upload.autoPromise) return upload.autoPromise;

  setStatus('Removing background with AI… (first run downloads the model)');
  const p = (async () => {
    try {
      const out = await autoRemoveBackground(upload.blob);
      upload.autoBlob = out;
      const img = $('ai-preview-img');
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      const url = URL.createObjectURL(out);
      img.dataset.url = url;
      img.src = url;
      setStatus('Background removed ✓');
      updateModeUI();
      return out;
    } catch (err) {
      console.warn(err);
      upload.autoPromise = null;
      setStatus('AI removal unavailable — try Point Snip or Perspective.');
      throw err;
    }
  })();
  upload.autoPromise = p;
  return p;
}

function openUpload(pendingSlot = null) {
  upload.mode = 'auto';
  upload.pendingSlot = pendingSlot;
  upload.blob = null;
  upload.autoBlob = null;
  upload.autoPromise = null;
  perspectiveAspect = 'auto';
  $('perspective-aspect').value = 'auto';

  $('item-file').value = '';
  $('item-name').value = '';
  $('item-desc').value = '';

  const aiImg = $('ai-preview-img');
  if (aiImg.dataset.url) { URL.revokeObjectURL(aiImg.dataset.url); delete aiImg.dataset.url; }
  aiImg.removeAttribute('src');

  const pImg = $('perspective-preview');
  if (pImg.dataset.url) { URL.revokeObjectURL(pImg.dataset.url); delete pImg.dataset.url; }
  pImg.removeAttribute('src');
  $('perspective-preview-wrap').style.display = 'none';

  setStatus('');
  outlineEditor.setMode('polygon');
  outlineEditor.reset();
  squareEditor.reset();
  updateModeUI();
  $('upload-modal').style.display = 'flex';
  preloadBgModel();
}

$('case-add-btn').addEventListener('click', () => openUpload(null));

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.id.replace('mode-', '').replace('-btn', '');
    setMode(m);
  });
});

$('item-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus('Compressing…');
  const blob = await compressImage(file);
  upload.blob = blob;
  upload.autoBlob = null;
  upload.autoPromise = null;
  setStatus('');
  await Promise.all([
    outlineEditor.loadBlob(blob).catch(() => {}),
    squareEditor.loadBlob(blob).catch(() => {}),
  ]);
  updateModeUI();
  if (upload.mode === 'auto') runAuto().catch(() => {});
});

$('undo-point-btn').addEventListener('click', () => outlineEditor.undoPoint());
$('finish-snip-btn').addEventListener('click', () => outlineEditor.finishCutout());
$('reset-outline-btn').addEventListener('click', () => {
  outlineEditor.reset();
  $('perspective-preview-wrap').style.display = 'none';
});
$('perspective-aspect').addEventListener('change', (e) => {
  perspectiveAspect = e.target.value;
  const quad = outlineEditor.getSourcePoints();
  if (quad) updatePerspectivePreview(quad);
});
$('square-zoom-slider').addEventListener('input', (e) => squareEditor.setZoom(e.target.value));
$('reset-square-btn').addEventListener('click', () => squareEditor.reset());

// ---- SAVE ITEM: now persists to Supabase ----

$('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('item-name').value.trim();
  const desc = $('item-desc').value.trim();
  if (!name) return;
  if (!upload.blob) { setStatus('Please choose a photo.'); return; }

  const btn = $('save-item-btn');
  btn.disabled = true;

  try {
    // 1. Produce a transparent PNG blob (no more dataURL conversion)
    let blob;
    if (upload.mode === 'auto') {
      blob = upload.autoBlob || (await runAuto());
    } else if (upload.mode === 'manual') {
      if (!outlineEditor.isClosed && outlineEditor.points.length >= 3) outlineEditor.finishCutout();
      blob = await outlineEditor.exportBlob();
      if (!blob) { setStatus('Add at least 3 points, then finish the snip.'); return; }
    } else if (upload.mode === 'perspective') {
      const quad = outlineEditor.getSourcePoints();
      if (!quad) { setStatus('Place all 4 corners first.'); return; }
      blob = await outlineEditor.exportPerspectiveBlob(getPerspectiveAspect(), 1024);
      if (!blob) { setStatus('Could not warp — try adjusting the corners.'); return; }
    } else {
      blob = await squareEditor.exportBlob();
    }

    // 2. Build payload for backend
    const fields = { name, description: desc };

    if (collection.type === 'binder') {
      const perPage = collection.layout.rows * collection.layout.cols;
      const requested = upload.pendingSlot;
      const taken = requested != null && collection.items.some((i) => i.slot === requested);
      const slot = requested != null && !taken ? requested : nextFreeSlot();
      const pageNumber = Math.floor(slot / perPage) + 1;
      fields.page_number = pageNumber;
      fields.slot_index  = slot % perPage;
      fields.position_data = { x: 50, y: 50, scale: 1, z_index: 1 };

      // If new item lands on a page beyond what we've declared, bump layout first
      if (pageNumber > collection.layout.pages) {
        await CollectiumAPI.updateCollection(collectionId, {
          layout_config: toLayoutConfig(
            { ...collection.layout, pages: pageNumber },
            collection.type
          ),
        });
      }
    } else {
      fields.position_data = {
        x: 35 + Math.random() * 30,
        y: 40 + Math.random() * 20,
        scale: 1,
        z_index: 1,
      };
    }

    // 3. Upload — backend stores PNG in Supabase Storage + inserts DB row
    await CollectiumAPI.uploadItem(collectionId, blob, fields);

    // 4. Reload and jump to the page the new item is on
    const targetPage = fields.page_number
      ? fields.page_number - 1
      : page;
    await loadCollection();
    page = clamp(targetPage, 0, Math.max(0, collection.layout.pages - 1));

    $('upload-modal').style.display = 'none';
    render();
  } catch (err) {
    console.error(err);
    setStatus('Could not save — ' + (err.message || 'try another mode.'));
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// Page nav + layout customizer (now persisted)
// -------------------------------------------------------------

$('prev-page').addEventListener('click', () => {
  page = Math.max(0, page - 1);
  renderBinder();
});
$('next-page').addEventListener('click', () => {
  page = Math.min(collection.layout.pages - 1, page + 1);
  renderBinder();
});

$('save-layout-btn').addEventListener('click', async () => {
  const pages = clampInt($('edit-pages').value, 1, 50);
  const rows  = clampInt($('edit-rows').value, 1, 8);
  const cols  = clampInt($('edit-cols').value, 1, 8);
  const showGrid = $('edit-grid').checked;
  const total = pages * rows * cols;
  const hidden = collection.items.filter(
    (i) => i.slot != null && i.slot >= total
  ).length;

  const btn = $('save-layout-btn');
  btn.disabled = true;
  try {
    await CollectiumAPI.updateCollection(collectionId, {
      layout_config: { pages, rows, cols, show_grid: showGrid },
    });
    collection.layout = { pages, rows, cols, showGrid };
    page = clamp(page, 0, pages - 1);
    render();
    if (hidden) alert(`${hidden} item(s) fall outside the new layout.`);
  } catch (err) {
    alert('Could not save layout: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// Init
// -------------------------------------------------------------

(async function init() {
  try {
    await loadCollection();

    const deepLinkId = params.get('item');
    if (deepLinkId) {
      const item = collection.items.find((i) => i.id === deepLinkId);
      if (item) openItem(item);
    }
  } catch (err) {
    console.error(err);
    $('col-title').textContent = 'Could not load this collection';
    $('col-subtitle').textContent = err.message;
  }
})();

window.addEventListener('unhandledrejection', (e) =>
  console.error('Unhandled promise rejection:', e.reason)
);
