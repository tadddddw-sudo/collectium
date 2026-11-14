<script>
  import { createEventDispatcher } from 'svelte';
  import { buildItemUrl, renderQrToDataUrl } from '$lib/qr.js';
  import ZoomViewer from './ZoomViewer.svelte';

  export let item;
  export let collection;
  export let isOwner = false;

  const dispatch = createEventDispatcher();

  $: shareUrl = buildItemUrl(collection.id, item.id);

  let qrSrc = '';
  let copied = false;
  let deleting = false;

  // Owner editing of the item's name and description.
  export let saving = false;
  export let saveError = '';
  let editing = false;
  let editName = '';
  let editDesc = '';

  function startEdit() {
    editName = item.name || '';
    editDesc = item.desc || '';
    editing = true;
  }

  function saveEdit(event) {
    event.preventDefault();
    if (!editName.trim()) return;
    dispatch('update', { item, name: editName.trim(), description: editDesc.trim() });
  }

  // The parent swaps in the saved item; leave edit mode once the save lands.
  let lastItem = item;
  $: if (item !== lastItem) {
    lastItem = item;
    editing = false;
  }

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

    <ZoomViewer src={item.img} alt={item.name} />

    {#if editing}
      <form class="edit" on:submit={saveEdit}>
        {#if saveError}
          <p class="notice notice-error" role="alert">{saveError}</p>
        {/if}
        <div class="field">
          <label for="item-name">Name</label>
          <input class="input" id="item-name" required maxlength="120" bind:value={editName} />
        </div>
        <div class="field">
          <label for="item-desc">Description</label>
          <textarea class="input" id="item-desc" rows="3" maxlength="2000" bind:value={editDesc}></textarea>
        </div>
        <div class="cluster edit-actions">
          <button class="btn btn-ghost btn-sm" type="button" on:click={() => (editing = false)} disabled={saving}>Cancel</button>
          <button class="btn btn-sm" type="submit" disabled={saving || !editName.trim()}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    {:else}
      <h2 id="item-title">{item.name}</h2>
      {#if item.desc}
        <p class="desc">{item.desc}</p>
      {/if}
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
        {#if !editing}
          <button class="btn btn-ghost" type="button" on:click={startEdit}>Edit details</button>
        {/if}
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

  h2 {
    font-size: 1.25rem;
    font-weight: 650;
  }

  .edit {
    text-align: left;
  }

  .edit .notice {
    margin-bottom: 0.7rem;
  }

  .edit textarea {
    resize: vertical;
  }

  .edit-actions {
    justify-content: flex-end;
  }

  .desc {
    white-space: pre-line;
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
