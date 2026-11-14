<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import CollectionCard from '$lib/components/CollectionCard.svelte';
  import GuestLanding from '$lib/components/GuestLanding.svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { userProfile, waitForAuth } from '$lib/stores.js';
  import { handleAuthFailure } from '$lib/session.js';
  import { buildProfileUrl, renderQrToDataUrl } from '$lib/qr.js';

  let profile = null;
  let collections = [];
  let loading = true;
  let error = '';
  let needsUsername = false;
  let loadedFor = '';
  let inflightFor = '';
  let loadSeq = 0;

  // New collection modal
  let createOpen = false;
  let creating = false;
  let createError = '';
  let form = { type: 'binder', title: '', description: '', pages: 4, rows: 3, cols: 3, grid: true };

  // Profile QR modal
  let qrOpen = false;
  let qrSrc = '';
  let qrUrl = '';

  $: isOwner = !!profile && $userProfile?.username === profile.username;

  onMount(() => {
    let active = true;

    (async () => {
      const me = await waitForAuth();
      if (!active) return;

      const requested = $page.url.searchParams.get('u');
      if (!requested && !me) {
        needsUsername = true;
        loading = false;
        return;
      }
      ensureLoad(requested || me.username);
    })();

    // ?u= lives in the query string, so SvelteKit keeps this component mounted
    // when it changes. Refetch on navigation instead of remounting. This fires
    // once synchronously on subscribe, which is why ensureLoad() dedupes.
    const unsub = page.subscribe(($p) => {
      if (!active) return;
      const target = $p.url.searchParams.get('u');
      if (target) ensureLoad(target);
    });

    return () => {
      active = false;
      unsub();
    };
  });

  function ensureLoad(target) {
    if (target === loadedFor || target === inflightFor) return;
    load(target);
  }

  async function load(target) {
    const seq = ++loadSeq;
    inflightFor = target;
    loading = true;
    error = '';
    try {
      const data = await CollectiumAPI.getProfile(target);
      if (seq !== loadSeq) return; // a newer navigation won
      profile = data.profile;
      collections = data.collections || [];
      needsUsername = false;
      loadedFor = data.profile.username;
    } catch (err) {
      if (seq !== loadSeq) return;
      profile = null;
      error = err.message || 'Could not load this collector.';
    } finally {
      if (seq === loadSeq) {
        loading = false;
        inflightFor = '';
      }
    }
  }

  function openCreate() {
    createError = '';
    form = { type: 'binder', title: '', description: '', pages: 4, rows: 3, cols: 3, grid: true };
    createOpen = true;
  }

  async function createCollection(event) {
    event.preventDefault();
    createError = '';
    creating = true;
    try {
      const layout_config =
        form.type === 'binder'
          ? {
              pages: Number(form.pages) || 4,
              rows: Number(form.rows) || 3,
              cols: Number(form.cols) || 3,
              show_grid: !!form.grid,
            }
          : { theme: 'glass_shelf' };

      const { collection } = await CollectiumAPI.createCollection({
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        layout_config,
      });
      createOpen = false;
      goto(`/collection?id=${collection.id}`);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      createError = err.message || 'Could not create the collection.';
    } finally {
      creating = false;
    }
  }

  async function showProfileQr() {
    qrUrl = buildProfileUrl(profile.username);
    qrSrc = await renderQrToDataUrl(qrUrl);
    qrOpen = true;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable; input is selectable */
    }
  }

  async function logout() {
    await CollectiumAPI.logout();
    userProfile.set(null);
    goto('/login', { replaceState: true });
  }
</script>

<svelte:head><title>{profile ? profile.display_name || profile.username : 'Profile'} — Collectium</title></svelte:head>

{#if needsUsername}
  <GuestLanding />
{:else}
  <main class="page">
    {#if loading && !profile}
      <p class="loading">Opening the vitrine…</p>
    {:else if error}
      <div class="notice notice-error" role="alert">{error}</div>
      <a class="btn btn-quiet" href="/">Try another collector</a>
    {:else if profile}
      <header class="profile">
        <div class="identity">
          <p class="eyebrow">Collector</p>
          <h1>{profile.display_name || profile.username}</h1>
          <p class="handle mono">@{profile.username}</p>
          <p class="bio">{profile.bio || 'Digital collector on Collectium.'}</p>
        </div>
        <div class="actions">
          {#if isOwner}
            <button class="btn" type="button" on:click={openCreate}>New collection</button>
            <button class="btn btn-quiet" type="button" on:click={showProfileQr}>Profile QR</button>
          {:else if !$userProfile}
            <a class="btn" href="/login">Sign in</a>
          {/if}
          {#if $userProfile}
            <button class="btn btn-quiet" type="button" on:click={logout}>Log out</button>
          {/if}
        </div>
      </header>

      <section>
        <div class="section-head">
          <h2>Binders</h2>
          <span class="tally mono">{collections.filter((c) => c.type === 'binder').length}</span>
        </div>
        <div class="grid">
          {#each collections.filter((c) => c.type === 'binder') as col (col.id)}
            <CollectionCard collection={col} />
          {:else}
            <p class="empty-note">{isOwner ? 'No binders yet. Start one above.' : 'No binders yet.'}</p>
          {/each}
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Display cases</h2>
          <span class="tally mono">{collections.filter((c) => c.type !== 'binder').length}</span>
        </div>
        <div class="grid">
          {#each collections.filter((c) => c.type !== 'binder') as col (col.id)}
            <CollectionCard collection={col} />
          {:else}
            <p class="empty-note">{isOwner ? 'No display cases yet. Start one above.' : 'No display cases yet.'}</p>
          {/each}
        </div>
      </section>
    {/if}
  </main>
{/if}

{#if createOpen}
  <div class="modal" role="presentation" on:click|self={() => (createOpen = false)}>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <button class="modal-close" type="button" aria-label="Close" on:click={() => (createOpen = false)}>×</button>
      <h2 class="modal-title" id="create-title">New collection</h2>
      <form on:submit={createCollection}>
        {#if createError}
          <p class="notice notice-error" role="alert">{createError}</p>
        {/if}

        <div class="field">
          <label for="col-type">Type</label>
          <select id="col-type" bind:value={form.type}>
            <option value="binder">Binder — paged grid of pockets</option>
            <option value="display_case">Display case — freeform glass shelf</option>
          </select>
        </div>

        <div class="field">
          <label for="col-title">Title</label>
          <input id="col-title" required placeholder="Vintage holo cards" bind:value={form.title} />
        </div>

        <div class="field">
          <label for="col-desc">Description</label>
          <input id="col-desc" placeholder="Optional" bind:value={form.description} />
        </div>

        {#if form.type === 'binder'}
          <div class="field-row">
            <div class="field">
              <label for="col-pages">Pages</label>
              <input id="col-pages" type="number" min="1" max="50" bind:value={form.pages} />
            </div>
            <div class="field">
              <label for="col-rows">Rows</label>
              <input id="col-rows" type="number" min="1" max="8" bind:value={form.rows} />
            </div>
            <div class="field">
              <label for="col-cols">Cols</label>
              <input id="col-cols" type="number" min="1" max="8" bind:value={form.cols} />
            </div>
          </div>
          <label class="check-row">
            <input type="checkbox" bind:checked={form.grid} />
            Show pocket grid lines
          </label>
        {/if}

        <div class="modal-actions">
          <button class="btn btn-quiet" type="button" on:click={() => (createOpen = false)}>Cancel</button>
          <button class="btn" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if qrOpen}
  <div class="modal" role="presentation" on:click|self={() => (qrOpen = false)}>
    <div class="modal-box qr-box" role="dialog" aria-modal="true" aria-labelledby="qr-title">
      <button class="modal-close" type="button" aria-label="Close" on:click={() => (qrOpen = false)}>×</button>
      <h2 class="modal-title" id="qr-title">Profile QR</h2>
      <img class="qr" src={qrSrc} alt={`QR code for @${profile?.username}`} />
      <input class="mono qr-url" readonly value={qrUrl} on:focus={(e) => e.currentTarget.select()} />
      <div class="modal-actions" style="justify-content:center;">
        <button class="btn" type="button" on:click={() => copy(qrUrl)}>Copy link</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .loading {
    padding: 4rem 0;
    color: var(--paper-faint);
    font-family: var(--font-data);
    font-size: 0.85rem;
  }

  .profile {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 1.25rem;
    padding-bottom: 1.75rem;
    border-bottom: 1px solid var(--hairline);
  }

  h1 {
    margin: 0.5rem 0 0.1rem;
    font-size: clamp(2rem, 4.5vw, 2.8rem);
    font-weight: 500;
  }

  .handle {
    font-size: 0.85rem;
    color: var(--mint);
  }

  .bio {
    margin-top: 0.65rem;
    max-width: 46ch;
    color: var(--paper-dim);
    font-size: 0.92rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  section {
    margin-top: 2.5rem;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.9rem;
  }

  .section-head h2 {
    font-size: 1.3rem;
    font-weight: 500;
  }

  .tally {
    font-size: 0.72rem;
    color: var(--paper-faint);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 1rem;
  }

  .qr-box {
    text-align: center;
  }

  .qr {
    width: 200px;
    height: 200px;
    margin: 0.5rem auto 0.9rem;
    border-radius: var(--r-md);
  }

  .qr-url {
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    background: var(--ink-raised);
    font-size: 0.75rem;
  }
</style>
