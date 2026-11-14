<script>
  import { createEventDispatcher } from 'svelte';

  export let layout;
  export let open = false;

  const dispatch = createEventDispatcher();

  const clampInt = (v, a, b) => Math.min(b, Math.max(a, parseInt(v, 10) || a));

  let pages = layout.pages;
  let rows = layout.rows;
  let cols = layout.cols;
  let showGrid = layout.showGrid;
  let saved = false;

  // Re-sync when the parent opens the panel or the persisted layout changes.
  $: if (open) sync(layout);

  function sync(next) {
    pages = next.pages;
    rows = next.rows;
    cols = next.cols;
    showGrid = next.showGrid;
  }

  function apply(event) {
    event.preventDefault();
    const next = {
      pages: clampInt(pages, 1, 50),
      rows: clampInt(rows, 1, 8),
      cols: clampInt(cols, 1, 8),
      showGrid,
    };
    pages = next.pages;
    rows = next.rows;
    cols = next.cols;
    dispatch('save', next);
    saved = true;
    setTimeout(() => (saved = false), 1400);
  }
</script>

{#if open}
  <form class="customizer aero" on:submit={apply} aria-label="Binder layout">
    <span class="eyebrow">Layout</span>
    <label>
      <span>Pages</span>
      <input class="input num" type="number" min="1" max="50" bind:value={pages} />
    </label>
    <label>
      <span>Rows</span>
      <input class="input num" type="number" min="1" max="8" bind:value={rows} />
    </label>
    <label>
      <span>Cols</span>
      <input class="input num" type="number" min="1" max="8" bind:value={cols} />
    </label>
    <label class="check-row">
      <input type="checkbox" bind:checked={showGrid} />
      Grid
    </label>
    <button class="btn btn-sm" type="submit">{saved ? 'Saved' : 'Apply'}</button>
  </form>
{/if}

<style>
  .customizer {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    padding: 0.55rem 0.75rem;
    font-size: 0.78rem;
  }

  .eyebrow {
    margin-right: 0.15rem;
  }

  label:not(.check-row) {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--text-muted);
  }

  .num {
    width: 3.3rem;
    padding: 0.3rem 0.4rem;
    font-size: 0.78rem;
  }

  .check-row {
    color: var(--text-muted);
    font-size: 0.78rem;
  }
</style>
