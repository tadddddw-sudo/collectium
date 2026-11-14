<script>
  import { createEventDispatcher } from 'svelte';

  export let collection;
  export let page = 0;
  export let isOwner = false;

  const dispatch = createEventDispatcher();

  $: rows = collection.layout.rows;
  $: cols = collection.layout.cols;
  $: pages = collection.layout.pages;
  $: showGrid = collection.layout.showGrid;
  $: perPage = rows * cols;

  // Only binder items (they always carry a flat slot index) participate in the grid.
  $: binderItems = collection.items.filter((it) => it.slot != null);
  $: bySlot = new Map(binderItems.map((it) => [it.slot, it]));

  $: slots = Array.from({ length: perPage }, (_, i) => page * perPage + i);
  $: canPrev = page > 0;
  $: canNext = page < pages - 1;

  function pick(slotIndex, item) {
    if (item) dispatch('openItem', item);
    else if (isOwner) dispatch('addItem', slotIndex);
  }
</script>

<div class="binder">
  <div class="toolbar aero">
    <div class="pager">
      <button class="btn btn-ghost btn-sm" type="button" disabled={!canPrev} on:click={() => dispatch('pageChange', page - 1)}>
        ‹ Prev
      </button>
      <span class="counter mono">Page {page + 1} / {pages}</span>
      <button class="btn btn-ghost btn-sm" type="button" disabled={!canNext} on:click={() => dispatch('pageChange', page + 1)}>
        Next ›
      </button>
    </div>
    <span class="hint">{binderItems.length} pieces on the shelf</span>
  </div>

  <div class="page-slab">
    <div
      class="grid"
      class:with-lines={showGrid}
      style={`grid-template-columns: repeat(${cols}, minmax(0, 1fr));`}
    >
      {#each slots as slotIndex (slotIndex)}
        {@const item = bySlot.get(slotIndex)}
        {#if item}
          <button class="pocket filled" type="button" on:click={() => pick(slotIndex, item)}>
            <span class="art"><img src={item.img} alt={item.name} loading="lazy" /></span>
            <span class="label">{item.name}</span>
          </button>
        {:else if isOwner}
          <button
            class="pocket empty"
            type="button"
            aria-label={`Add an item in slot ${slotIndex + 1}`}
            on:click={() => pick(slotIndex, null)}
          >
            <span class="add">+ Add item</span>
          </button>
        {:else}
          <div class="pocket empty" aria-hidden="true"></div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    margin-bottom: 0.85rem;
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .counter {
    font-size: 0.76rem;
    color: var(--text-soft);
    text-shadow: var(--text-glow);
  }

  .hint {
    font-size: 0.72rem;
    color: var(--text-dim);
    text-shadow: var(--text-glow);
  }

  /* The binder page itself: a slab of dark plastic with an embossed rim. */
  .page-slab {
    max-width: 760px;
    margin: 0 auto;
    padding: 3px;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 4%);
    box-shadow:
      0 16px 34px rgba(0, 0, 0, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      inset 0 -2px 5px rgba(0, 0, 0, 0.6);
  }

  .grid {
    display: grid;
    gap: 0.85rem;
    padding: 1.05rem;
    border-radius: 12px;
    background:
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 4px),
      linear-gradient(180deg, #1b2331 0%, #121924 55%, #0d141e 100%);
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.55);
  }

  /* Every pocket is a recessed well: dark inset + a lip of light on top. */
  .pocket {
    position: relative;
    aspect-ratio: 3 / 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.55rem;
    border-radius: 7px;
    border: 1px solid rgba(0, 0, 0, 0.55);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.12));
    box-shadow:
      inset 0 4px 9px rgba(0, 0, 0, 0.55),
      inset 0 -1px 0 rgba(255, 255, 255, 0.06);
    cursor: pointer;
    overflow: hidden;
    transition: box-shadow 150ms var(--ease), border-color 150ms var(--ease);
  }

  .with-lines .pocket {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.09);
  }

  button.pocket.filled:hover,
  button.pocket.empty:hover {
    border-color: rgba(0, 229, 255, 0.5);
    box-shadow:
      inset 0 4px 9px rgba(0, 0, 0, 0.5),
      inset 0 0 18px rgba(0, 229, 255, 0.14),
      0 0 14px rgba(0, 229, 255, 0.16);
  }

  /* Reader view: an empty pocket is inert decoration, not a control. */
  div.pocket.empty {
    cursor: default;
  }

  /* Art floats above the pocket with a cast shadow, like a sleeved card. */
  .art {
    display: grid;
    place-items: center;
    max-width: 100%;
    max-height: 84%;
  }

  .pocket img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 12px 9px rgba(0, 0, 0, 0.68));
  }

  .label {
    max-width: 100%;
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: var(--text-glow);
  }

  .add {
    font-size: 0.75rem;
    color: var(--text-dim);
    text-shadow: var(--text-glow);
  }
</style>
