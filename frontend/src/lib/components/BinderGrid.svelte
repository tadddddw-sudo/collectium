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
  <div class="toolbar">
    <div class="pager">
      <button class="btn btn-quiet btn-sm" type="button" disabled={!canPrev} on:click={() => dispatch('pageChange', page - 1)}>
        ← Prev
      </button>
      <span class="counter mono">Page {page + 1} / {pages}</span>
      <button class="btn btn-quiet btn-sm" type="button" disabled={!canNext} on:click={() => dispatch('pageChange', page + 1)}>
        Next →
      </button>
    </div>
  </div>

  <div
    class="grid"
    class:with-lines={showGrid}
    style={`grid-template-columns: repeat(${cols}, minmax(0, 1fr));`}
  >
    {#each slots as slotIndex (slotIndex)}
      {@const item = bySlot.get(slotIndex)}
      {#if item}
        <button class="pocket filled" type="button" on:click={() => pick(slotIndex, item)}>
          <img src={item.img} alt={item.name} loading="lazy" />
          <span class="label">{item.name}</span>
        </button>
      {:else}
        <button
          class="pocket empty"
          type="button"
          disabled={!isOwner}
          on:click={() => pick(slotIndex, null)}
        >
          {#if isOwner}<span class="add">+ Add item</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    margin-bottom: 0.9rem;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: var(--vitrine);
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .counter {
    font-size: 0.78rem;
    color: var(--paper-dim);
  }

  .grid {
    display: grid;
    gap: 0.9rem;
    padding: 1.1rem;
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    background: var(--vitrine);
  }

  .pocket {
    position: relative;
    aspect-ratio: 3 / 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.6rem;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    cursor: pointer;
    overflow: hidden;
  }

  .with-lines .pocket {
    border: 1px dashed var(--hairline-strong);
    background: rgba(255, 255, 255, 0.015);
  }

  .pocket.filled:hover,
  .pocket.empty:not(:disabled):hover {
    border-color: var(--mint);
    background: rgba(62, 207, 142, 0.05);
  }

  .pocket.empty:disabled {
    cursor: default;
  }

  .pocket img {
    max-width: 100%;
    max-height: 82%;
    object-fit: contain;
    filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.5));
  }

  .label {
    max-width: 100%;
    font-size: 0.74rem;
    color: var(--paper-dim);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add {
    font-size: 0.78rem;
    color: var(--paper-faint);
  }
</style>
