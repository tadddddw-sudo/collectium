<script>
  import { goto } from '$app/navigation';

  export let collection;

  $: items = collection.collection_items || collection.items || [];
  $: preview = items
    .map((it) => it.image_url || it.image || it.img || it.thumbnail_url)
    .find(Boolean);
  $: layout = collection.layout_config || {};
  $: pages = Number(layout.pages) || 4;
  $: rows = Number(layout.rows) || 3;
  $: cols = Number(layout.cols) || 3;
  $: isBinder = collection.type === 'binder';
  $: badge = isBinder
    ? `Binder (${pages}p · ${rows}×${cols})`
    : 'Display Case';
  $: count = items.length;

  function open() {
    goto(`/collection?id=${collection.id}`);
  }
</script>

<button class="card" type="button" on:click={open}>
  <div class="preview" class:empty={!preview}>
    {#if preview}
      <img src={preview} alt="" loading="lazy" />
    {:else}
      <span class="glyph" aria-hidden="true">{isBinder ? '▤' : '▥'}</span>
      <span class="empty-text">{isBinder ? 'Empty binder' : 'Empty case'}</span>
    {/if}
  </div>
  <div class="body">
    <span class="badge">{badge}</span>
    <h3>{collection.title}</h3>
    <p class="count">{count} {count === 1 ? 'piece' : 'pieces'}</p>
  </div>
</button>

<style>
  .card {
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    background: var(--vitrine);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 140ms ease, transform 140ms ease;
  }

  .card:hover {
    border-color: var(--hairline-strong);
    transform: translateY(-2px);
  }

  .preview {
    aspect-ratio: 4 / 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 1rem;
    background:
      radial-gradient(60% 70% at 50% 100%, rgba(200, 168, 107, 0.09), transparent 70%),
      var(--vitrine-soft);
    border-bottom: 1px solid var(--hairline);
  }

  .preview img {
    max-height: 100%;
    max-width: 100%;
    object-fit: contain;
    filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.55));
  }

  .glyph {
    font-size: 2rem;
    line-height: 1;
    color: var(--paper-faint);
  }

  .empty-text {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--paper-faint);
  }

  .body {
    padding: 0.9rem 1rem 1.05rem;
  }

  .badge {
    font-family: var(--font-data);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mint);
  }

  h3 {
    margin: 0.35rem 0 0.15rem;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .count {
    color: var(--paper-faint);
    font-size: 0.82rem;
  }
</style>
