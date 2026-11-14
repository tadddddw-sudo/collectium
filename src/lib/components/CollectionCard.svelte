<script>
  import { createEventDispatcher } from 'svelte';

  export let collection;

  const dispatch = createEventDispatcher();

  $: items = collection.collection_items || collection.items || [];
  $: preview = items
    .map((it) => it.image_url || it.image || it.img || it.thumbnail_url)
    .find(Boolean);
  $: layout = collection.layout_config || {};
  $: pages = Number(layout.pages) || 4;
  $: rows = Number(layout.rows) || 3;
  $: cols = Number(layout.cols) || 3;
  $: isBinder = collection.type === 'binder';
  $: badge = isBinder ? `Binder · ${pages}p · ${rows}×${cols}` : 'Display case';
  $: count = items.length;
</script>

<button class="row" type="button" on:click={() => dispatch('open', collection)}>
  <span class="thumb" class:empty={!preview}>
    {#if preview}
      <img src={preview} alt="" loading="lazy" />
    {:else}
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
          {#if isBinder}
            <rect x="4" y="3.5" width="16" height="17" rx="2" />
            <path d="M4 14.5h16M9.6 3.5v11" />
          {:else}
            <path d="M3.5 7.5h17M3.5 12h17M3.5 16.5h17" />
            <rect x="3.5" y="4" width="17" height="16" rx="2" />
          {/if}
        </svg>
      </span>
      <span class="empty-text">{isBinder ? 'Empty binder' : 'Empty case'}</span>
    {/if}
  </span>

  <span class="meta">
    <span class="badge">{badge}</span>
    <span class="title">{collection.title}</span>
    <span class="count">{count} {count === 1 ? 'piece' : 'pieces'}</span>
    {#if collection.description}
      <span class="desc">{collection.description}</span>
    {/if}
  </span>

  <span class="chevron" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  </span>
</button>

<style>
  .row {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.1rem;
    width: 100%;
    padding: 0.9rem;
    text-align: left;
    border-radius: var(--r-lg);
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 55%),
      rgba(28, 35, 48, 0.82);
    box-shadow:
      0 8px 20px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.26),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5);
    cursor: pointer;
    transition: border-color 150ms var(--ease), box-shadow 150ms var(--ease), transform 150ms var(--ease);
  }

  .row:hover {
    border-color: rgba(0, 229, 255, 0.38);
    transform: translateY(-1px);
    box-shadow:
      0 12px 26px rgba(0, 0, 0, 0.6),
      0 0 16px rgba(0, 229, 255, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.32),
      inset 0 -1px 0 rgba(0, 0, 0, 0.5);
  }

  .thumb {
    position: relative;
    display: grid;
    place-items: center;
    height: 118px;
    border-radius: 7px;
    overflow: hidden;
    background:
      radial-gradient(60% 60% at 50% 100%, rgba(0, 229, 255, 0.08), transparent 70%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.15));
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    padding: 0.55rem;
  }

  .thumb img {
    position: absolute;
    inset: 0.55rem;
    width: calc(100% - 1.1rem);
    height: calc(100% - 1.1rem);
    object-fit: contain;
    filter: drop-shadow(0 12px 10px rgba(0, 0, 0, 0.65));
  }

  .glyph {
    color: #52627a;
  }

  .glyph svg {
    width: 34px;
    height: 34px;
  }

  .thumb.empty {
    grid-auto-flow: row;
    gap: 0.3rem;
    align-content: center;
  }

  .empty-text {
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .badge {
    font-family: var(--font-data);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-cyan);
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
  }

  .title {
    font-size: 1.12rem;
    font-weight: 600;
    color: var(--text-main);
    text-shadow: var(--text-glow);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .desc {
    margin-top: 0.25rem;
    font-size: 0.82rem;
    color: var(--text-dim);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .chevron {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: var(--text-dim);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.01));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .chevron svg {
    width: 16px;
    height: 16px;
  }

  .row:hover .chevron {
    color: var(--accent-cyan);
  }

  @media (max-width: 620px) {
    .row {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .thumb {
      height: 86px;
    }

    .chevron {
      display: none;
    }
  }
</style>
