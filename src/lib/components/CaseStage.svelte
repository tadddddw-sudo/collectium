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
  /* A glass display case: dark interior, a polished shelf, a bright top rim. */
  .stage {
    position: relative;
    width: 100%;
    height: clamp(430px, 62vh, 600px);
    border-radius: var(--r-lg);
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--stage-bg);
    box-shadow:
      var(--shadow-deep),
      var(--edge-spec),
      inset 0px -1px 0px rgba(0, 0, 0, 0.7),
      inset 0px -40px 60px rgba(0, 0, 0, 0.45);
  }

  /* specular sheen + the shelf's reflected highlight */
  .stage::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(70% 55% at 50% 22%, rgba(255, 255, 255, 0.07), transparent 70%),
      linear-gradient(180deg, transparent 48.6%, rgba(255, 255, 255, 0.14) 49.8%, rgba(255, 255, 255, 0) 51%);
  }

  .case-item {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 132px;
    max-width: 24vw;
    padding: 6px;
    border-radius: var(--r-md);
    transition: transform var(--transition-smooth);
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

  /* plastic-object look: deep cast shadow + faint edge light */
  .case-item img {
    width: 100%;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(0 16px 14px rgba(0, 0, 0, 0.72)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.28));
  }

  .tag {
    position: absolute;
    left: 50%;
    bottom: -1.25rem;
    transform: translateX(-50%);
    max-width: 140px;
    padding: 0.08rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--line);
    background: var(--tag-bg);
    font-size: 0.66rem;
    color: var(--text-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transition: opacity var(--transition-smooth);
    box-shadow:
      0px 3px 8px rgba(0, 0, 0, 0.5),
      inset 0px 1px 0px rgba(255, 255, 255, 0.3),
      var(--edge-ao);
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
    color: var(--text-dim);
    font-size: 0.86rem;
    text-align: center;
    text-shadow: var(--text-glow);
  }
</style>
