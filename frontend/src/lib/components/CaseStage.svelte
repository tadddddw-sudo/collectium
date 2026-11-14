<script>
  import { createEventDispatcher, tick } from 'svelte';

  export let collection;
  export let isOwner = false;

  const dispatch = createEventDispatcher();

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let stage;
  /** Local visual positions, keyed by item id. Kept apart so dragging never mutates collection.items. */
  let positions = {};
  let seededFrom = null;

  $: caseItems = collection.items.filter((it) => it.slot == null);
  // Re-seed only when the collection object itself changes (reload / navigation),
  // never in response to a drag, which would fight the pointer.
  $: if (collection !== seededFrom) {
    seededFrom = collection;
    positions = Object.fromEntries(caseItems.map((it) => [it.id, { x: it.x ?? 50, y: it.y ?? 50 }]));
  }

  let drag = null; // { id, pointerId, startX, startY, origX, origY, moved }

  function onPointerDown(event, item) {
    if (!isOwner) return;
    event.preventDefault();
    const pos = positions[item.id];
    drag = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: 0,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is an optimisation; pointermove still fires on the node */
    }
    event.currentTarget.classList.add('dragging');
  }

  function onPointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    drag.moved = Math.max(drag.moved, Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
    positions = {
      ...positions,
      [drag.id]: {
        x: clamp(drag.origX + dx, 5, 95),
        y: clamp(drag.origY + dy, 8, 92),
      },
    };
  }

  async function onPointerUp(event) {
    if (!drag) return;
    const current = drag;
    drag = null;
    event.currentTarget.classList.remove('dragging');

    const item = caseItems.find((it) => it.id === current.id);
    if (!item) return;

    if (current.moved < 5) {
      dispatch('openItem', item);
      return;
    }

    // Persist exactly once, on release — never on every pointermove.
    const pos = positions[item.id];
    item.x = pos.x;
    item.y = pos.y;
    await tick();
    dispatch('itemMoved', item);
  }

  function onPointerCancel(event) {
    drag = null;
    event.currentTarget.classList.remove('dragging');
  }

  function openGuest(event, item) {
    if (isOwner) return;
    event.preventDefault();
    dispatch('openItem', item);
  }
</script>

<div class="stage" bind:this={stage}>
  {#each caseItems as item (item.id)}
    {@const pos = positions[item.id] ?? { x: item.x ?? 50, y: item.y ?? 50 }}
    <div
      class="case-item"
      class:owner={isOwner}
      class:dragging={drag?.id === item.id}
      style={`left: ${pos.x}%; top: ${pos.y}%; z-index: ${item.z_index ?? 1};`}
      role="button"
      tabindex="0"
      aria-label={item.name}
      on:pointerdown={(e) => onPointerDown(e, item)}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:pointercancel={onPointerCancel}
      on:click={(e) => openGuest(e, item)}
      on:keydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          dispatch('openItem', item);
        }
      }}
    >
      <img src={item.img} alt={item.name} draggable="false" loading="lazy" />
      <span class="tag">{item.name}</span>
    </div>
  {/each}

  {#if !caseItems.length}
    <p class="hint">
      {isOwner ? 'Nothing on the shelf yet. Add your first piece.' : 'This case is still empty.'}
    </p>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: clamp(420px, 62vh, 600px);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    overflow: hidden;
    background:
      linear-gradient(180deg, var(--vitrine) 0%, #14171b 46%, #23262b 49.4%, #3a3f46 50%, #23262b 50.6%, #12151a 96%, #2c3036 100%);
    box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.5);
  }

  .stage::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(70% 60% at 50% 30%, rgba(255, 255, 255, 0.04), transparent 70%);
  }

  .case-item {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 132px;
    max-width: 24vw;
    padding: 6px;
    border-radius: var(--r-md);
    transition: transform 120ms ease;
    user-select: none;
    touch-action: none;
  }

  .case-item.owner {
    cursor: grab;
  }

  .case-item.owner:hover {
    transform: translate(-50%, -50%) scale(1.04);
  }

  .case-item.dragging {
    cursor: grabbing;
    transition: none;
    transform: translate(-50%, -50%) scale(1.06);
  }

  .case-item img {
    width: 100%;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.65));
  }

  .tag {
    position: absolute;
    left: 50%;
    bottom: -1.25rem;
    transform: translateX(-50%);
    max-width: 140px;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    background: rgba(11, 12, 14, 0.75);
    font-size: 0.68rem;
    color: var(--paper-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .case-item:hover .tag,
  .case-item:focus-visible .tag,
  .case-item.dragging .tag {
    opacity: 1;
  }

  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    color: var(--paper-faint);
    font-size: 0.88rem;
    text-align: center;
  }
</style>
