<script>
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import {
    compressImage,
    autoRemoveBackground,
    preloadBgModel,
    InteractiveOutlineEditor,
    SquareCropEditor,
    perspectiveWarp,
    perspectiveDestSize,
  } from '$lib/imageTools.js';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { handleAuthFailure } from '$lib/session.js';

  export let collection;
  export let pendingSlot = null;

  const dispatch = createEventDispatcher();

  const MODES = [
    { id: 'auto', label: 'Auto AI' },
    { id: 'manual', label: 'Snip' },
    { id: 'perspective', label: 'Perspective' },
    { id: 'square', label: 'Square' },
  ];

  const ASPECTS = [
    { value: 'auto', label: 'Auto (from corners)' },
    { value: '2.5:3.5', label: 'Card · 2.5 : 3.5' },
    { value: '1:1', label: 'Square · 1 : 1' },
    { value: '4:3', label: 'Photo · 4 : 3' },
    { value: '3:2', label: 'Photo · 3 : 2' },
    { value: '16:9', label: 'Wide · 16 : 9' },
  ];

  /* ---------------- state machine (same as the legacy upload object) ---------------- */

  let mode = 'auto';
  let blob = null;
  let autoBlob = null;
  let autoPromise = null;
  let perspectiveAspect = 'auto';

  let name = '';
  let desc = '';
  let status = '';
  let saving = false;
  let saveError = '';

  // Mirrors of editor callback state (presentation only — the editors own the truth).
  let pointCount = 0;
  let cutoutClosed = false;
  let zoom = 1;

  let aiPreviewUrl = '';
  let perspectivePreviewUrl = '';

  let outlineCanvas;
  let squareCanvas;
  let outlineEditor = null;
  let squareEditor = null;

  const isSnipMode = () => mode === 'manual' || mode === 'perspective';

  $: hasImage = !!blob;
  $: showAiPreview = mode === 'auto' && !!aiPreviewUrl;
  $: showOutlineEditor = isSnipMode() && hasImage;
  $: showSquareEditor = mode === 'square' && hasImage;
  $: canUndo = pointCount > 0 || cutoutClosed;
  $: canFinish = pointCount >= 3 && !cutoutClosed;
  $: zoomLabel = `${Number(zoom).toFixed(1)}×`;
  function getPerspectiveAspect() {
    if (perspectiveAspect === 'auto') return null;
    const [w, h] = perspectiveAspect.split(':').map(Number);
    return [w, h];
  }

  /* ------------------------------- editor wiring ------------------------------- */

  onMount(async () => {
    // The canvases must exist in the DOM before the imperative editors attach.
    await tick();

    outlineEditor = new InteractiveOutlineEditor(outlineCanvas, ({ pointCount: n, isClosed }) => {
      pointCount = n;
      cutoutClosed = isClosed;
    });
    outlineEditor.onPerspectiveChange = (quad) => updatePerspectivePreview(quad);

    squareEditor = new SquareCropEditor(squareCanvas, (z) => {
      zoom = Number(z);
    });

    preloadBgModel();
  });

  onDestroy(() => {
    revoke(aiPreviewUrl);
    revoke(perspectivePreviewUrl);
    outlineEditor = null;
    squareEditor = null;
  });

  function revoke(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  /* ----------------------------- image pipeline ----------------------------- */

  function setStatus(message) {
    status = message || '';
  }

  async function onFileChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setStatus('Compressing…');
    const compressed = await compressImage(file);
    blob = compressed;
    autoBlob = null;
    autoPromise = null;
    if (aiPreviewUrl) {
      revoke(aiPreviewUrl);
      aiPreviewUrl = '';
    }
    setStatus('');
    await Promise.all([
      outlineEditor?.loadBlob(compressed).catch(() => {}),
      squareEditor?.loadBlob(compressed).catch(() => {}),
    ]);
    if (mode === 'auto') runAuto().catch(() => {});
  }

  function runAuto() {
    if (!blob) return Promise.reject(new Error('No image'));
    if (autoBlob) return Promise.resolve(autoBlob);
    if (autoPromise) return autoPromise;

    setStatus('Removing the background with AI… (the first run downloads the model)');
    const promise = (async () => {
      try {
        const out = await autoRemoveBackground(blob);
        autoBlob = out;
        revoke(aiPreviewUrl);
        aiPreviewUrl = URL.createObjectURL(out);
        setStatus('Background removed.');
        return out;
      } catch (err) {
        console.warn(err);
        autoPromise = null;
        setStatus('AI removal unavailable — try Snip or Perspective.');
        throw err;
      }
    })();
    autoPromise = promise;
    return promise;
  }

  function updatePerspectivePreview(quad) {
    if (!quad || !outlineEditor?.sourceImg) {
      revoke(perspectivePreviewUrl);
      perspectivePreviewUrl = '';
      return;
    }
    const [dw, dh] = perspectiveDestSize(quad, getPerspectiveAspect(), 400);
    const canvas = perspectiveWarp(outlineEditor.sourceImg, quad, dw, dh);
    if (!canvas) {
      revoke(perspectivePreviewUrl);
      perspectivePreviewUrl = '';
      return;
    }
    canvas.toBlob((out) => {
      if (!out) return;
      revoke(perspectivePreviewUrl);
      perspectivePreviewUrl = URL.createObjectURL(out);
    }, 'image/png');
  }

  function setMode(next) {
    mode = next;
    if (next === 'manual' || next === 'perspective') {
      outlineEditor?.setMode(next === 'perspective' ? 'perspective' : 'polygon');
    }
    if (next === 'auto' && blob && !autoBlob) runAuto().catch(() => {});
    if (next === 'perspective' && outlineEditor?.points.length === 4) {
      updatePerspectivePreview(outlineEditor.getSourcePoints());
    } else if (next !== 'perspective') {
      revoke(perspectivePreviewUrl);
      perspectivePreviewUrl = '';
    }
  }

  function onUndo() {
    outlineEditor?.undoPoint();
  }

  function onFinish() {
    outlineEditor?.finishCutout();
  }

  function onResetOutline() {
    outlineEditor?.reset();
    revoke(perspectivePreviewUrl);
    perspectivePreviewUrl = '';
  }

  function onAspectChange() {
    const quad = outlineEditor?.getSourcePoints();
    if (quad) updatePerspectivePreview(quad);
  }

  function onZoomInput(event) {
    squareEditor?.setZoom(event.currentTarget.value);
  }

  function onResetSquare() {
    squareEditor?.reset();
  }

  /* --------------------------------- payload --------------------------------- */

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

  function nextFreeSlot() {
    const { rows, cols, pages } = collection.layout;
    const perPage = rows * cols;
    const used = new Set(collection.items.filter((i) => i.slot != null).map((i) => i.slot));
    const maxSlots = pages * perPage;
    for (let s = 0; s < maxSlots; s++) if (!used.has(s)) return s;
    return maxSlots;
  }

  function binderSlot() {
    const perPage = collection.layout.rows * collection.layout.cols;
    const requested = pendingSlot;
    const taken = requested != null && collection.items.some((i) => i.slot === requested);
    return requested != null && !taken ? requested : nextFreeSlot();
  }

  async function produceBlob() {
    if (mode === 'auto') {
      return autoBlob || (await runAuto());
    }
    if (mode === 'manual') {
      if (!outlineEditor.isClosed && outlineEditor.points.length >= 3) outlineEditor.finishCutout();
      return outlineEditor.exportBlob();
    }
    if (mode === 'perspective') {
      const quad = outlineEditor.getSourcePoints();
      if (!quad) throw new Error('Place all four corners first.');
      const out = await outlineEditor.exportPerspectiveBlob(getPerspectiveAspect(), 1024);
      if (!out) throw new Error('Could not warp the image. Adjust the corners.');
      return out;
    }
    return squareEditor.exportBlob();
  }

  async function save(event) {
    event.preventDefault();
    saveError = '';
    if (!name.trim()) {
      saveError = 'Give the piece a name.';
      return;
    }
    if (!blob) {
      setStatus('Choose a photo first.');
      return;
    }

    saving = true;
    try {
      let out;
      try {
        out = await produceBlob();
      } catch (err) {
        saveError = err.message || 'Could not prepare the image.';
        return;
      }
      if (!out) {
        saveError = 'The cutout came back empty. Add points or switch modes.';
        return;
      }

      const fields = { name: name.trim(), description: desc.trim() };
      let pageNumber = null;

      if (collection.type === 'binder') {
        const perPage = collection.layout.rows * collection.layout.cols;
        const slot = binderSlot();
        pageNumber = Math.floor(slot / perPage) + 1;
        fields.page_number = pageNumber;
        fields.slot_index = slot % perPage;
        fields.position_data = { x: 50, y: 50, scale: 1, z_index: 1 };

        // Items on an undeclared page would be invisible: declare the page first.
        if (pageNumber > collection.layout.pages) {
          await CollectiumAPI.updateCollection(collection.id, {
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

      const res = await CollectiumAPI.uploadItem(collection.id, out, fields);
      dispatch('saved', { item: res.item, pageNumber });
    } catch (err) {
      console.error(err);
      if (handleAuthFailure(err)) return;
      saveError = err.message || 'Could not save the item.';
    } finally {
      saving = false;
    }  }

  function close() {
    if (saving) return;
    dispatch('close');
  }
</script>

<div class="modal" role="presentation" on:click|self={close}>
  <div class="modal-box modal-box-wide" role="dialog" aria-modal="true" aria-labelledby="upload-title">
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>×</button>
    <h2 class="modal-title" id="upload-title">Add a piece</h2>

    <div class="modes" role="tablist" aria-label="Cutout method">
      {#each MODES as m (m.id)}
        <button
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          class="mode"
          class:active={mode === m.id}
          on:click={() => setMode(m.id)}
        >
          {m.label}
        </button>
      {/each}
    </div>

    <form on:submit={save}>
      <div class="field">
        <label for="item-file">Photo</label>
        <input
          id="item-file"
          type="file"
          accept="image/*"
          required
          on:change={onFileChange}
        />
        {#if status}
          <p class="status">{status}</p>
        {/if}
      </div>

      {#if showAiPreview}
        <div class="preview checker">
          <img src={aiPreviewUrl} alt="Background removed preview" />
        </div>
      {/if}

      <!-- The canvases stay mounted for the whole modal lifetime: the imperative
           editors attach to them once in onMount, so they must always exist.
           Only the surrounding editor chrome toggles with the mode. -->
      <div class="editor" hidden={!showOutlineEditor}>
        <p class="hint">
          {mode === 'perspective'
            ? 'Click the four corners of the piece (any order), then drag the handles to fine-tune. The preview updates live.'
            : 'Click points around the piece, then close the loop on the first dot or press Finish snip.'}
        </p>
        <canvas bind:this={outlineCanvas} class="outline-canvas" />

        <div class="editor-tools">
          <button class="btn btn-quiet btn-sm" type="button" disabled={!canUndo} on:click={onUndo}>
            Undo point
          </button>
          {#if mode !== 'perspective'}
            <button class="btn btn-sm" type="button" disabled={!canFinish} on:click={onFinish}>
              Finish snip
            </button>
          {/if}
          <button class="btn btn-quiet btn-sm" type="button" on:click={onResetOutline}>Reset</button>
        </div>

        {#if mode === 'perspective'}
          <div class="aspect">
            <label for="aspect-select">Aspect</label>
            <select id="aspect-select" bind:value={perspectiveAspect} on:change={onAspectChange}>
              {#each ASPECTS as a (a.value)}
                <option value={a.value}>{a.label}</option>
              {/each}
            </select>
          </div>

          {#if perspectivePreviewUrl}
            <div class="warp-preview">
              <p class="hint">Warp preview</p>
              <img class="checker" src={perspectivePreviewUrl} alt="Perspective warp preview" />
            </div>
          {/if}
        {/if}
      </div>

      <div class="editor" hidden={!showSquareEditor}>
        <p class="hint">Drag to centre the piece, then scale it until it fills the pocket.</p>
        <canvas bind:this={squareCanvas} class="square-canvas" />
        <div class="zoom">
          <span>Scale</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.05"
            value={zoom}
            on:input={onZoomInput}
            aria-label="Scale"
          />
          <span class="mono zoom-value">{zoomLabel}</span>
          <button class="btn btn-quiet btn-sm" type="button" on:click={onResetSquare}>Reset</button>
        </div>
      </div>

      <div class="field">
        <label for="item-name">Name</label>
        <input id="item-name" required placeholder="1st edition holo" bind:value={name} />
      </div>

      <div class="field">
        <label for="item-desc">Notes</label>
        <input id="item-desc" placeholder="Mint, 1999" bind:value={desc} />
      </div>

      {#if saveError}
        <p class="notice notice-error" role="alert">{saveError}</p>
      {/if}

      <button class="btn btn-block" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save to collection'}
      </button>
    </form>
  </div>
</div>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
    padding: 3px;
    margin-bottom: 1rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    background: var(--ink);
  }

  .mode {
    padding: 0.5rem 0.25rem;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--paper-faint);
    font-size: 0.75rem;
    font-weight: 650;
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
  }

  .mode.active {
    background: var(--mint);
    color: var(--mint-ink);
  }

  .status {
    margin-top: 0.4rem;
    font-size: 0.78rem;
    color: var(--mint);
  }

  .checker {
    background: repeating-conic-gradient(#1e2228 0% 25%, #171a1f 0% 50%) 50% / 16px 16px;
  }

  .preview {
    display: flex;
    justify-content: center;
    padding: 0.5rem;
    margin-bottom: 1rem;
    border-radius: var(--r-md);
  }

  .preview img {
    max-height: 200px;
  }

  .editor {
    margin-bottom: 1rem;
  }

  .editor[hidden] {
    display: none;
  }

  .hint {
    font-size: 0.78rem;
    color: var(--paper-faint);
    line-height: 1.5;
    margin-bottom: 0.4rem;
  }

  .outline-canvas {
    display: block;
    max-width: 100%;
    margin: 0 auto;
    border: 2px dashed var(--mint);
    border-radius: var(--r-md);
    cursor: crosshair;
    touch-action: none;
    background: repeating-conic-gradient(#1e2228 0% 25%, #171a1f 0% 50%) 50% / 16px 16px;
  }

  .square-canvas {
    display: block;
    width: 260px;
    max-width: 100%;
    height: auto;
    aspect-ratio: 1;
    margin: 0.4rem auto;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    cursor: grab;
    touch-action: none;
  }

  .square-canvas:active {
    cursor: grabbing;
  }

  .editor-tools {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 0.55rem;
  }

  .aspect {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 0.7rem;
    font-size: 0.8rem;
    color: var(--paper-dim);
  }

  .aspect select {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.8rem;
  }

  .warp-preview {
    margin-top: 0.75rem;
    text-align: center;
  }

  .warp-preview img {
    max-width: 220px;
    max-height: 220px;
    margin: 0 auto;
    padding: 6px;
    border-radius: var(--r-md);
  }

  .zoom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--paper-dim);
  }

  .zoom input[type='range'] {
    flex: 1;
    max-width: 180px;
    accent-color: var(--mint);
  }

  .zoom-value {
    min-width: 2.6rem;
    color: var(--mint);
  }
</style>
