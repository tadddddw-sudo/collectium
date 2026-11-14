<script>
  /**
   * Zoom and pan for one image: buttons, mouse wheel, pinch, drag and
   * double-click/tap. Used in the item dialog so visitors can inspect a piece.
   */
  export let src;
  export let alt = '';

  const MIN = 1;
  const MAX = 6;
  const STEP = 1.5;

  let frame;
  let scale = 1;
  let x = 0; // pan offset in px, relative to the centred image
  let y = 0;
  let dragging = false;

  const pointers = new Map(); // pointerId -> { x, y }
  let pinchStart = null; // { dist, scale }
  let lastTap = 0;

  $: zoomed = scale > 1.01;
  $: percent = Math.round(scale * 100);

  // Reset when another image is shown.
  $: src, reset();

  function reset() {
    scale = 1;
    x = 0;
    y = 0;
  }

  /** Keep the image from being dragged entirely out of the frame. */
  function clampPan() {
    if (!frame) return;
    const maxX = (frame.clientWidth * (scale - 1)) / 2;
    const maxY = (frame.clientHeight * (scale - 1)) / 2;
    x = Math.min(maxX, Math.max(-maxX, x));
    y = Math.min(maxY, Math.max(-maxY, y));
  }

  /** Zoom to `next`, keeping the point under (cx, cy) (frame coordinates) still. */
  function zoomTo(next, cx = null, cy = null) {
    const target = Math.min(MAX, Math.max(MIN, next));
    if (frame && cx != null) {
      const ox = cx - frame.clientWidth / 2;
      const oy = cy - frame.clientHeight / 2;
      const k = target / scale;
      x = ox - (ox - x) * k;
      y = oy - (oy - y) * k;
    }
    scale = target;
    if (scale === 1) {
      x = 0;
      y = 0;
    }
    clampPan();
  }

  function local(event) {
    const rect = frame.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function onWheel(event) {
    event.preventDefault();
    const [cx, cy] = local(event);
    zoomTo(scale * Math.exp(-event.deltaY * 0.0015), cx, cy);
  }

  function onPointerDown(event) {
    frame.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      return;
    }

    // Double tap on touch screens (dblclick covers the mouse).
    if (event.pointerType === 'touch') {
      const now = Date.now();
      if (now - lastTap < 300) {
        const [cx, cy] = local(event);
        zoomTo(zoomed ? 1 : 2.5, cx, cy);
        lastTap = 0;
        return;
      }
      lastTap = now;
    }
    dragging = zoomed;
  }

  function onPointerMove(event) {
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = frame.getBoundingClientRect();
      zoomTo(pinchStart.scale * (dist / pinchStart.dist), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }

    if (dragging) {
      x += point.x - prev.x;
      y += point.y - prev.y;
      clampPan();
    }
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) dragging = false;
  }

  function onDblClick(event) {
    const [cx, cy] = local(event);
    zoomTo(zoomed ? 1 : 2.5, cx, cy);
  }

  function onKeydown(event) {
    if (event.key === '+' || event.key === '=') zoomTo(scale * STEP);
    else if (event.key === '-') zoomTo(scale / STEP);
    else if (event.key === '0') reset();
    else if (zoomed && event.key.startsWith('Arrow')) {
      const d = 40;
      if (event.key === 'ArrowLeft') x += d;
      if (event.key === 'ArrowRight') x -= d;
      if (event.key === 'ArrowUp') y += d;
      if (event.key === 'ArrowDown') y -= d;
      clampPan();
    } else return;
    event.preventDefault();
  }
</script>

<div class="viewer">
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div
    class="frame"
    class:zoomed
    class:dragging
    bind:this={frame}
    tabindex="0"
    role="img"
    aria-label={`${alt}. Zoom ${percent}%. Use + and - to zoom, arrow keys to move.`}
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:dblclick={onDblClick}
    on:keydown={onKeydown}
  >
    <img
      {src}
      {alt}
      draggable="false"
      style={`transform: translate(${x}px, ${y}px) scale(${scale});`}
    />
  </div>

  <div class="controls" role="group" aria-label="Zoom">
    <button class="btn-icon" type="button" aria-label="Zoom out" disabled={scale <= MIN} on:click={() => zoomTo(scale / STEP)}>−</button>
    <span class="level mono" aria-live="polite">{percent}%</span>
    <button class="btn-icon" type="button" aria-label="Zoom in" disabled={scale >= MAX} on:click={() => zoomTo(scale * STEP)}>+</button>
    <button class="btn-icon reset" type="button" aria-label="Reset zoom" title="Reset zoom" disabled={!zoomed} on:click={reset}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v3.8h3.8" /></svg>
    </button>
  </div>
</div>

<style>
  .viewer {
    margin-bottom: 0.9rem;
  }

  /* Sunken lightbox with a checkerboard "transparency" floor. */
  .frame {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: min(52vh, 360px);
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--well-border);
    background:
      repeating-conic-gradient(rgba(128, 128, 128, 0.1) 0% 25%, transparent 0% 50%) 50% / 18px 18px,
      radial-gradient(70% 70% at 50% 100%, rgb(var(--accent-rgb) / 0.1), transparent 70%),
      var(--well-bg);
    box-shadow: var(--shadow-carve), var(--edge-lip);
    cursor: zoom-in;
    touch-action: none;
    user-select: none;
  }

  .frame.zoomed {
    cursor: grab;
  }

  .frame.dragging {
    cursor: grabbing;
  }

  .frame img {
    max-width: calc(100% - 1.6rem);
    max-height: calc(100% - 1.6rem);
    object-fit: contain;
    transform-origin: center center;
    transition: transform 0.12s var(--ease);
    pointer-events: none;
    filter: drop-shadow(0 16px 14px rgba(0, 0, 0, 0.55));
  }

  .frame.dragging img {
    transition: none;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 0.55rem;
  }

  .controls .btn-icon {
    font-size: 1.05rem;
    line-height: 1;
  }

  .controls .btn-icon:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .level {
    min-width: 3.4rem;
    text-align: center;
    font-size: 0.74rem;
    color: var(--text-muted);
  }
</style>
