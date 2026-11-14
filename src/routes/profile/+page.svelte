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
  $: binders = collections.filter((c) => c.type === 'binder');
  $: cases = collections.filter((c) => c.type !== 'binder');
  $: pieces = collections.reduce((n, c) => n + (c.collection_items?.length || 0), 0);

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

  function openCollection(col) {
    goto(`/collection?id=${col.id}`);
  }
</script>

<svelte:head>
  <title>{profile ? `${profile.display_name || profile.username} — Collectium` : 'Profile — Collectium'}</title>
</svelte:head>

{#if needsUsername}
  <GuestLanding />
{:else if loading && !profile}
  <p class="empty-note">Opening the collection…</p>
{:else if error}
  <div class="notice notice-error" role="alert">{error}</div>
  <a class="btn btn-ghost" href="/">Back to home</a>
{:else if profile}
  <section class="banner">
    <div class="banner-glow" aria-hidden="true"></div>
    <div class="banner-tag">
      <span class="eyebrow">Collector</span>
      <span class="mono">{pieces} {pieces === 1 ? 'piece' : 'pieces'} · {collections.length} shelves</span>
    </div>
    {#if isOwner}
      <button class="btn btn-ghost btn-sm banner-edit" type="button" on:click={showProfileQr}>
        Profile QR
      </button>
    {/if}
  </section>

  <section class="identity aero">
    <div class="avatar" aria-hidden="true">
      <span>{(profile.display_name || profile.username || '?').slice(0, 1).toUpperCase()}</span>
    </div>
    <div class="who">
      <h1>{profile.display_name || profile.username}</h1>
      <p class="handle mono">@{profile.username}</p>
    </div>
    <div class="identity-actions">
      {#if isOwner}
        <button class="btn" type="button" on:click={openCreate}>New collection</button>
      {:else if !$userProfile}
        <a class="btn" href={`/login?next=${encodeURIComponent(`/profile?u=${profile.username}`)}`}>Sign in</a>
      {/if}
    </div>
  </section>

  <section class="bio aero">
    <p>{profile.bio || 'This collector has not written a bio yet.'}</p>
  </section>

  {#if collections.length}
    <section class="featured">
      <span class="eyebrow">Featured collections</span>
      <div class="chips">
        {#each collections.slice(0, 3) as col (col.id)}
          <a class="chip" href={`/collection?id=${col.id}`}>{col.title}</a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="shelves">
    <div class="section-head">
      <h2>Binders</h2>
      <span class="tally mono">{binders.length}</span>
    </div>
    {#if binders.length}
      <div class="rows">
        {#each binders as col (col.id)}
          <CollectionCard collection={col} on:open={() => openCollection(col)} />
        {/each}
      </div>
    {:else}
      <p class="empty-note">{isOwner ? 'No binders yet — create one above.' : 'No binders yet.'}</p>
    {/if}

    <div class="section-head">
      <h2>Display cases</h2>
      <span class="tally mono">{cases.length}</span>
    </div>
    {#if cases.length}
      <div class="rows">
        {#each cases as col (col.id)}
          <CollectionCard collection={col} on:open={() => openCollection(col)} />
        {/each}
      </div>
    {:else}
      <p class="empty-note">{isOwner ? 'No display cases yet — create one above.' : 'No display cases yet.'}</p>
    {/if}
  </section>
{/if}

{#if createOpen}
  <div class="modal" role="presentation" on:click|self={() => (createOpen = false)}>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <button class="modal-close" type="button" aria-label="Close" on:click={() => (createOpen = false)}>✕</button>
      <h2 class="modal-title" id="create-title">New collection</h2>
      <form on:submit={createCollection}>
        {#if createError}
          <p class="notice notice-error" role="alert">{createError}</p>
        {/if}

        <div class="field">
          <label for="col-type">Type</label>
          <select class="input" id="col-type" bind:value={form.type}>
            <option value="binder">Binder — paged grid of pockets</option>
            <option value="display_case">Display case — freeform glass shelf</option>
          </select>
        </div>

        <div class="field">
          <label for="col-title">Title</label>
          <input class="input" id="col-title" required placeholder="Vintage holo cards" bind:value={form.title} />
        </div>

        <div class="field">
          <label for="col-desc">Description</label>
          <input class="input" id="col-desc" placeholder="Optional" bind:value={form.description} />
        </div>

        {#if form.type === 'binder'}
          <div class="field-row">
            <div class="field">
              <label for="col-pages">Pages</label>
              <input class="input" id="col-pages" type="number" min="1" max="50" bind:value={form.pages} />
            </div>
            <div class="field">
              <label for="col-rows">Rows</label>
              <input class="input" id="col-rows" type="number" min="1" max="8" bind:value={form.rows} />
            </div>
            <div class="field">
              <label for="col-cols">Cols</label>
              <input class="input" id="col-cols" type="number" min="1" max="8" bind:value={form.cols} />
            </div>
          </div>
          <label class="check-row">
            <input type="checkbox" bind:checked={form.grid} />
            Show pocket grid lines
          </label>
        {/if}

        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" on:click={() => (createOpen = false)}>Cancel</button>
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
      <button class="modal-close" type="button" aria-label="Close" on:click={() => (qrOpen = false)}>✕</button>
      <h2 class="modal-title" id="qr-title">Profile QR</h2>
      <img class="qr" src={qrSrc} alt={`QR code for @${profile?.username}`} />
      <input class="input mono qr-url" readonly value={qrUrl} on:focus={(e) => e.currentTarget.select()} />
      <div class="modal-actions" style="justify-content:center;">
        <button class="btn" type="button" on:click={() => copy(qrUrl)}>Copy link</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* --- banner + identity, mirroring the Figma profile stack --- */

  .banner {
    position: relative;
    height: 190px;
    border-radius: var(--r-lg);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      radial-gradient(120% 140% at 20% -20%, rgba(0, 229, 255, 0.22), transparent 55%),
      radial-gradient(90% 120% at 90% 120%, rgba(0, 85, 255, 0.28), transparent 60%),
      linear-gradient(160deg, #23324a 0%, #131a26 55%, #0b111a 100%);
    box-shadow:
      var(--shadow-deep),
      inset 0px 1px 0px rgba(255, 255, 255, 0.4),
      inset 0px -1px 0px rgba(0, 0, 0, 0.6);
  }

  /* the Aero glint sweeping across the banner */
  .banner-glow {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 42%),
      repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.035) 0 2px, transparent 2px 22px);
    pointer-events: none;
  }

  .banner-tag {
    position: absolute;
    left: 1.25rem;
    top: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .banner-tag .mono {
    font-size: 0.72rem;
    color: var(--text-soft);
    text-shadow: var(--text-glow);
  }

  .banner-edit {
    position: absolute;
    right: 1rem;
    top: 1rem;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: -34px;
    margin-inline: 1rem;
    padding: 1rem 1.15rem;
    z-index: 1;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 74px;
    height: 74px;
    flex: none;
    border-radius: 50%;
    font-size: 1.7rem;
    font-weight: 700;
    /* a glossy bead set into a dark bezel */
    color: #fff;
    background: var(--accent-gradient);
    border: 1px solid #0033aa;
    box-shadow:
      0px 8px 20px rgba(0, 0, 0, 0.6),
      0px 0px 12px rgba(0, 229, 255, 0.3),
      inset 0px 3px 4px rgba(255, 255, 255, 0.6),
      inset 0px -4px 6px rgba(0, 0, 0, 0.4),
      0 0 0 4px rgba(15, 20, 30, 0.9);
    text-shadow: var(--text-glow);
  }

  .who {
    min-width: 0;
    flex: 1;
  }

  h1 {
    font-size: 1.45rem;
    font-weight: 650;
    letter-spacing: 0.005em;
  }

  .handle {
    font-size: 0.8rem;
    color: var(--accent-cyan);
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .identity-actions {
    flex: none;
  }

  .bio {
    margin-top: 0.9rem;
    padding: 0.95rem 1.15rem;
    font-size: 0.88rem;
    line-height: 1.6;
    color: var(--text-soft);
  }

  .shelves {
    margin-top: 1.6rem;
  }

  .featured {
    margin-top: 1.1rem;
  }

  .chips {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.35rem 0 0.7rem;
  }

  .section-head:first-child {
    margin-top: 0;
  }

  .section-head h2 {
    font-size: 1.02rem;
    font-weight: 600;
  }

  .tally {
    font-size: 0.72rem;
    color: var(--text-dim);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .qr-box {
    text-align: center;
  }

  .qr {
    width: 198px;
    height: 198px;
    margin: 0.5rem auto 0.9rem;
    border-radius: var(--r-md);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
  }

  .qr-url {
    font-size: 0.74rem;
  }

  @media (max-width: 560px) {
    .identity {
      flex-wrap: wrap;
      margin-inline: 0.6rem;
    }

    .identity-actions {
      width: 100%;
    }

    .identity-actions .btn {
      width: 100%;
    }
  }
</style>
