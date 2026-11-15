<script>
  /**
   * Choose which part of a picture to keep: drag to move it, zoom with the
   * slider, the scroll wheel, a pinch, or the +/- keys. Dispatches `confirm`
   * with the cropped Blob, or `cancel`.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { FrameCropEditor } from '$lib/imageTools.js';

  /** The picked File. */
  export let file;
  /** Frame width ÷ height. */
  export let aspect = 1;
  /** Show a circular frame (profile pictures are displayed as circles). */
  export let round = false;
  /** Widest side of the exported image, in pixels. */
  export let outputWidth = 512;
  /** Logical width of the frame in the editor, in CSS pixels. */
  export let frameWidth = 280;
  export let title = 'Crop picture';
  export let busy = false;

  const dispatch = createEventDispatcher();
  const PADDING = 22; // dimmed margin around the frame, in CSS pixels

  $: boxW = frameWidth + PADDING * 2;
  $: boxH = frameWidth / aspect + PADDING * 2;

  let canvas;
  let editor = null;
  let ready = false;
  let loadError = '';
  let zoom = 1;
  let minZoom = 1;
  let maxZoom = 5;

  onMount(async () => {
    editor = new FrameCropEditor(canvas, {
      aspect,
      round,
      frameWidth,
      padding: PADDING,
      onChange: (state) => {
        zoom = state.zoom;
        minZoom = state.minZoom;
        maxZoom = state.maxZoom;
      },
    });
    try {
      await editor.loadBlob(file);
      ready = true;
      canvas.focus({ preventScroll: true });
    } catch (err) {
      loadError = err.message || 'That image could not be opened.';
    }
  });

  onDestroy(() => editor?.destroy());

  function onZoomInput(event) {
    editor?.setZoom(event.currentTarget.value);
  }

  async function confirm() {
    if (!editor || !ready || busy) return;
    // Keep transparency for formats that can carry it; photos go out as JPEG.
    const type = /png|webp/i.test(file.type || '') ? 'image/png' : 'image/jpeg';
    const blob = await editor.exportBlob(outputWidth, type, 0.9);
    if (blob) dispatch('confirm', { blob });
  }
</script>

<div class="cropper">
  <div class="cropper-head">
    <span class="field-label">{title}</span>
    <span class="hint dim">Drag to move · scroll or pinch to zoom</span>
  </div>

  <canvas
    bind:this={canvas}
    class="crop-canvas"
    class:ready
    style={`max-width: ${boxW}px; aspect-ratio: ${boxW} / ${boxH};`}
    tabindex="0"
    role="application"
    aria-label={`${title}. Use the arrow keys to move the picture and plus or minus to zoom.`}
  />

  {#if loadError}
    <p class="notice notice-error" role="alert">{loadError}</p>
  {/if}

  <div class="zoom">
    <span>Zoom</span>
    <input
      type="range"
      min={minZoom}
      max={maxZoom}
      step="0.01"
      value={zoom}
      disabled={!ready}
      on:input={onZoomInput}
      aria-label="Zoom"
    />
    <span class="mono zoom-value">{zoom.toFixed(1)}×</span>
    <button class="btn btn-ghost btn-sm" type="button" disabled={!ready} on:click={() => editor?.reset()}>Reset</button>
  </div>

  <div class="cropper-actions">
    <button class="btn btn-ghost btn-sm" type="button" disabled={busy} on:click={() => dispatch('cancel')}>Cancel</button>
    <button class="btn btn-sm" type="button" disabled={!ready || busy} on:click={confirm}>
      {busy ? 'Uploading…' : 'Use this crop'}
    </button>
  </div>
</div>

<style>
  .cropper {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .cropper-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .hint {
    font-size: 0.76rem;
  }

  .crop-canvas {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 auto;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.14) 0% 25%, transparent 0% 50%) 50% / 16px 16px,
      var(--bg-deep);
    box-shadow: var(--shadow-carve);
    cursor: grab;
    touch-action: none;
  }

  .crop-canvas:active {
    cursor: grabbing;
  }

  .crop-canvas:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .zoom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .zoom input[type='range'] {
    flex: 1;
    max-width: 220px;
  }

  .zoom-value {
    min-width: 2.6rem;
    color: var(--accent);
  }

  .cropper-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
