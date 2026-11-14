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
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>×</button>

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
      <input class="mono" readonly value={shareUrl} on:focus={(e) => e.currentTarget.select()} aria-label="Share link" />
      <button class="btn btn-quiet btn-sm" type="button" on:click={copy}>
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

  .hero {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 150px;
    padding: 0.75rem;
    margin-bottom: 0.9rem;
    border-radius: var(--r-md);
    background:
      repeating-conic-gradient(#1e2228 0% 25%, #171a1f 0% 50%) 50% / 16px 16px;
  }

  .hero img {
    max-height: 190px;
    filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.55));
  }

  h2 {
    font-size: 1.35rem;
    font-weight: 500;
  }

  .desc {
    margin-top: 0.35rem;
    color: var(--paper-dim);
    font-size: 0.88rem;
  }

  .qr {
    width: 168px;
    height: 168px;
    margin: 1rem auto 0.75rem;
    border-radius: var(--r-md);
  }

  .share {
    display: flex;
    gap: 0.4rem;
    align-items: stretch;
  }

  .share input {
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    background: var(--ink-raised);
    font-size: 0.72rem;
  }
</style>
