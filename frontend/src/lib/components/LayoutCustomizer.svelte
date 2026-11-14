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
  <form class="customizer" on:submit={apply}>
    <label>
      <span>Pages</span>
      <input type="number" min="1" max="50" bind:value={pages} />
    </label>
    <label>
      <span>Rows</span>
      <input type="number" min="1" max="8" bind:value={rows} />
    </label>
    <label>
      <span>Cols</span>
      <input type="number" min="1" max="8" bind:value={cols} />
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
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.8rem;
  }

  label:not(.check-row) {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--paper-faint);
  }

  input[type='number'] {
    width: 3.2rem;
    padding: 0.28rem 0.35rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.8rem;
  }

  .check-row {
    color: var(--paper-faint);
    font-size: 0.8rem;
  }
</style>
