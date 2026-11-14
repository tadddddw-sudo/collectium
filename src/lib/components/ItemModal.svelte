<script>
  import { createEventDispatcher } from 'svelte';
  import { buildItemUrl, renderQrToDataUrl } from '$lib/qr.js';

  export let item;
  export let collection;
  export let isOwner = false;

  const dispatch = createEventDispatcher();

  $: shareUrl = buildItemUrl(collection.id, item.id);

  let qrSrc = '';
  let copied = false;
  let deleting = false;

  $: loadQr(shareUrl);

  async function loadQr(url) {
    try {
      qrSrc = await renderQrToDataUrl(url);
    } catch {
      qrSrc = '';
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* selectable input is the fallback */
    }
  }

  function confirmDelete() {
    if (!isOwner || deleting) return;
    if (!confirm(`Delete "${item.name}"?`)) return;
    deleting = true;
    dispatch('delete', item);
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="modal" role="presentation" on:click|self={close}>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="item-title">
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>✕</button>

    <div class="hero">
      <img src={item.img} alt={item.name} />
    </div>

    <h2 id="item-title">{item.name}</h2>
    {#if item.desc}
      <p class="desc">{item.desc}</p>
    {/if}

    {#if qrSrc}
      <img class="qr" src={qrSrc} alt={`QR code linking to ${item.name}`} />
    {/if}

    <div class="share">
      <input class="input mono share-input" readonly value={shareUrl} on:focus={(e) => e.currentTarget.select()} aria-label="Share link" />
      <button class="btn btn-ghost btn-sm" type="button" on:click={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>

    {#if isOwner}
      <div class="modal-actions">
        <button class="btn btn-danger" type="button" on:click={confirmDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete item'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-box {
    text-align: center;
  }

  /* Gallery hero: a sunken lightbox with a checkerboard "transparency" floor. */
  .hero {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    padding: 0.8rem;
    margin-bottom: 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.6);
    background:
      repeating-conic-gradient(rgba(255, 255, 255, 0.045) 0% 25%, transparent 0% 50%) 50% / 18px 18px,
      radial-gradient(70% 70% at 50% 100%, rgba(0, 229, 255, 0.1), transparent 70%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.15));
    box-shadow:
      inset 0 3px 9px rgba(0, 0, 0, 0.6),
      inset 0 -1px 0 rgba(255, 255, 255, 0.07);
  }

  .hero img {
    max-height: 200px;
    filter: drop-shadow(0 16px 14px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.25));
  }

  h2 {
    font-size: 1.25rem;
    font-weight: 650;
  }

  .desc {
    margin-top: 0.3rem;
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  .qr {
    width: 168px;
    height: 168px;
    margin: 1rem auto 0.75rem;
    border-radius: 8px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .share {
    display: flex;
    gap: 0.4rem;
    align-items: stretch;
  }

  .share-input {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.6rem;
    font-size: 0.72rem;
  }
</style>
