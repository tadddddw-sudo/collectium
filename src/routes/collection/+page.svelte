<script>
  import { onMount } from 'svelte';
  import { page as pageStore } from '$app/stores';
  import BinderGrid from '$lib/components/BinderGrid.svelte';
  import CaseStage from '$lib/components/CaseStage.svelte';
  import ItemModal from '$lib/components/ItemModal.svelte';
  import UploadModal from '$lib/components/UploadModal.svelte';
  import LayoutCustomizer from '$lib/components/LayoutCustomizer.svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { userProfile, waitForAuth } from '$lib/stores.js';
  import { handleAuthFailure } from '$lib/session.js';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let collection = null; // normalized local shape
  let page = 0; // 0-indexed binder page
  let isOwner = false;
  let loading = true;
  let error = '';
  let currentItem = null; // ItemModal
  let uploadOpen = false; // UploadModal
  let uploadSlot = null; // null = display case, number = binder slot
  let customizerOpen = false;
  let actionError = '';

  let collectionId = '';

  /* ------------------------------ normalization ------------------------------ */

  function normalizeCollection(raw) {
    const lc = raw.layout_config || {};
    const rows = Number(lc.rows) || 3;
    const cols = Number(lc.cols) || 3;
    const perPage = rows * cols;

    return {
      id: raw.id,
      title: raw.title,
      subtitle: raw.description || '',
      type: raw.type,
      user_id: raw.user_id,
      profiles: raw.profiles,
      layout: {
        pages: Number(lc.pages) || 4,
        rows,
        cols,
        showGrid: lc.show_grid !== false,
      },
      items: (raw.collection_items || []).map((it) => {
        const pageNumber = Number(it.page_number) || 1;
        const slotIndex = it.slot_index != null ? Number(it.slot_index) : null;
        const pos = it.position_data || {};
        return {
          id: it.id,
          name: it.name,
          desc: it.description || '',
          img: it.image_url,
          slot: slotIndex != null ? (pageNumber - 1) * perPage + slotIndex : null,
          page_number: pageNumber,
          slot_index: slotIndex,
          x: pos.x ?? 50,
          y: pos.y ?? 50,
          scale: pos.scale ?? 1,
          z_index: pos.z_index ?? 1,
        };
      }),
    };
  }

  function computeOwner(next) {
    const me = $userProfile;
    if (!me) return false;
    return me.id === next.user_id || me.username === next.profiles?.username;
  }

  /* --------------------------------- loading --------------------------------- */

  async function reloadCollection() {
    const { collection: raw } = await CollectiumAPI.getCollection(collectionId);
    const next = normalizeCollection(raw);

    // Never hide items that live on pages beyond layout_config.pages.
    const maxItemPage = next.items.reduce((m, it) => Math.max(m, it.page_number || 1), 1);
    next.layout.pages = Math.max(next.layout.pages, maxItemPage);

    collection = next;
    isOwner = computeOwner(next);
    page = clamp(page, 0, Math.max(0, next.layout.pages - 1));
  }

  onMount(() => {
    let active = true;

    (async () => {
      await waitForAuth();
      if (!active) return;

      try {
        collectionId =
          $pageStore.url.searchParams.get('id') ||
          $pageStore.url.searchParams.get('collection') ||
          '';
        if (!collectionId) throw new Error('No collection id in the URL.');

        await reloadCollection();
        openDeepLinkedItem();
      } catch (err) {
        console.error(err);
        error = err.message || 'Could not load this collection.';
      } finally {
        loading = false;
      }
    })();

    // ?id= and ?item= live in the query string, so SvelteKit keeps this
    // component mounted when either changes. React instead of remounting.
    const unsub = pageStore.subscribe(($p) => {
      if (!active || loading) return;
      const nextId = $p.url.searchParams.get('id') || $p.url.searchParams.get('collection') || '';
      if (nextId && nextId !== collectionId) {
        collectionId = nextId;
        page = 0;
        currentItem = null;
        uploadOpen = false;
        uploadSlot = null;
        customizerOpen = false;
        actionError = '';
        reloadCollection()
          .then(openDeepLinkedItem)
          .catch((err) => (error = err.message || 'Could not load this collection.'));
        return;
      }
      openDeepLinkedItem();
    });

    return () => {
      active = false;
      unsub();
    };
  });

  function openDeepLinkedItem() {
    if (!collection) return;
    const itemId = $pageStore.url.searchParams.get('item');
    if (!itemId) return;
    const found = collection.items.find((it) => it.id === itemId);
    if (found) currentItem = found;
  }

  /* ---------------------------------- flows ---------------------------------- */

  function openUpload(slot) {
    uploadSlot = slot;
    uploadOpen = true;
  }

  async function onUploadSaved(event) {
    const { pageNumber } = event.detail;
    uploadOpen = false;
    actionError = '';
    try {
      await reloadCollection();
      if (pageNumber != null) {
        page = clamp(pageNumber - 1, 0, Math.max(0, collection.layout.pages - 1));
      }
    } catch (err) {
      actionError = err.message || 'The item was saved but the collection could not reload.';
    }
  }

  async function onDeleteItem(event) {
    const item = event.detail;
    actionError = '';
    try {
      await CollectiumAPI.deleteItem(item.id);
      currentItem = null;
      await reloadCollection();
    } catch (err) {
      // Close the modal so the page-level error is visible.
      currentItem = null;
      if (handleAuthFailure(err)) return;
      actionError = err.message || 'Could not delete the item.';
    }
  }

  async function savePosition(item) {
    actionError = '';
    try {
      await CollectiumAPI.updateItem(item.id, {
        position_data: {
          x: item.x,
          y: item.y,
          scale: item.scale ?? 1,
          z_index: item.z_index ?? 1,
        },
      });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      actionError = err.message || 'Could not save the new position.';
    }
  }

  async function saveLayout(event) {
    const next = event.detail;
    actionError = '';
    const total = next.pages * next.rows * next.cols;
    const hidden = collection.items.filter((it) => it.slot != null && it.slot >= total).length;

    try {
      await CollectiumAPI.updateCollection(collection.id, {
        layout_config: {
          pages: next.pages,
          rows: next.rows,
          cols: next.cols,
          show_grid: next.showGrid,
        },
      });

      // Re-normalize so slot indexes are recomputed against the new rows × cols.
      await reloadCollection();
      if (hidden) {
        actionError = `${hidden} item${hidden === 1 ? '' : 's'} now fall outside the layout.`;
      }
    } catch (err) {
      if (handleAuthFailure(err)) return;
      actionError = err.message || 'Could not save the layout.';
    }
  }

  function changePage(next) {
    if (!collection) return;
    page = clamp(next, 0, Math.max(0, collection.layout.pages - 1));
  }

  $: addLabel = collection?.type === 'binder' ? 'Add collectible' : 'Add memorabilia';
</script>

<svelte:head>
  <title>{collection ? collection.title : 'Collection'} — Collectium</title>
</svelte:head>

<div class="page wide">
  {#if loading}
    <p class="loading">Opening the collection…</p>
  {:else if error}
    <div class="notice notice-error" role="alert">{error}</div>
    <a class="btn btn-ghost" href="/">Back to Collectium</a>
  {:else if collection}
    <header class="topbar aero">
      <div class="titles">
        <a class="back" href={collection.profiles?.username ? `/profile?u=${collection.profiles.username}` : '/'}>
          ‹ {collection.profiles?.username ? `@${collection.profiles.username}` : 'Home'}
        </a>
        <h1>{collection.title}</h1>
        {#if collection.subtitle}
          <p class="subtitle">{collection.subtitle}</p>
        {/if}
      </div>

      {#if isOwner}
        <div class="owner-tools">
          {#if collection.type === 'binder'}
            <button
              class="btn btn-ghost btn-sm"
              type="button"
              aria-expanded={customizerOpen}
              on:click={() => (customizerOpen = !customizerOpen)}
            >
              Layout
            </button>
          {/if}
          <button class="btn" type="button" on:click={() => openUpload(null)}>{addLabel}</button>
        </div>
      {/if}
    </header>

    {#if actionError}
      <p class="notice notice-error" role="alert">{actionError}</p>
    {/if}

    {#if collection.type === 'binder'}
      {#if isOwner}
        <div class="customizer-row">
          <LayoutCustomizer layout={collection.layout} open={customizerOpen} on:save={saveLayout} />
        </div>
      {/if}
      <BinderGrid
        {collection}
        {page}
        {isOwner}
        on:openItem={(e) => (currentItem = e.detail)}
        on:addItem={(e) => openUpload(e.detail)}
        on:pageChange={(e) => changePage(e.detail)}
      />
    {:else}
      <p class="case-hint">
        Select a piece for its details and share link.{#if isOwner} Drag to arrange the shelf.{/if}
      </p>
      <CaseStage
        {collection}
        {isOwner}
        on:openItem={(e) => (currentItem = e.detail)}
        on:itemMoved={(e) => savePosition(e.detail)}
      />
    {/if}
  {/if}
</div>

{#if uploadOpen && collection}
  <UploadModal
    {collection}
    pendingSlot={uploadSlot}
    on:close={() => (uploadOpen = false)}
    on:saved={onUploadSaved}
  />
{/if}

{#if currentItem && collection}
  <ItemModal
    item={currentItem}
    {collection}
    {isOwner}
    on:close={() => (currentItem = null)}
    on:delete={onDeleteItem}
  />
{/if}

<style>
  .page {
    width: 100%;
    max-width: 1040px;
  }

  .loading {
    padding: 4rem 0;
    color: var(--text-dim);
    font-family: var(--font-data);
    font-size: 0.85rem;
  }

  .topbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1.1rem 1.25rem;
    margin-bottom: 1rem;
  }

  .back {
    font-family: var(--font-data);
    font-size: 0.74rem;
    color: var(--text-dim);
  }

  .back:hover {
    color: var(--accent-cyan);
    text-decoration: none;
  }

  h1 {
    margin: 0.4rem 0 0.15rem;
    font-size: clamp(1.5rem, 3.4vw, 2.1rem);
    font-weight: 650;
  }

  .subtitle {
    max-width: 62ch;
    color: var(--text-muted);
    font-size: 0.86rem;
    text-shadow: var(--text-glow);
  }

  .owner-tools {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .customizer-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.6rem;
  }

  .case-hint {
    margin-bottom: 0.7rem;
    color: var(--text-dim);
    font-size: 0.8rem;
    text-shadow: var(--text-glow);
  }
</style>
