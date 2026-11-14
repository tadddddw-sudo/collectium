<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import CollectionCard from '$lib/components/CollectionCard.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { userProfile, waitForAuth } from '$lib/stores.js';

  let handle = '';
  let error = '';
  let busy = false;

  // "Your vitrine" — the signed-in collector's own collections.
  let mine = [];
  let mineState = 'idle'; // idle | loading | ready

  $: me = $userProfile;

  onMount(async () => {
    const profile = await waitForAuth();
    if (!profile) return;
    mineState = 'loading';
    try {
      const { collections } = await CollectiumAPI.getProfile(profile.username);
      mine = collections || [];
    } catch {
      mine = [];
    } finally {
      mineState = 'ready';
    }
  });

  async function lookup(event) {
    event.preventDefault();
    error = '';
    const name = handle.trim().replace(/^@/, '');
    if (!name) {
      error = 'Enter a collector handle first.';
      return;
    }
    busy = true;
    try {
      await CollectiumAPI.getProfile(name);
      goto(`/profile?u=${encodeURIComponent(name)}`);
    } catch (err) {
      error =
        err?.status === 404
          ? `No collector is using @${name}.`
          : err?.message || 'Could not look up that collector.';
    } finally {
      busy = false;
    }
  }

  function openCollection(col) {
    goto(`/collection?id=${col.id}`);
  }
</script>

<svelte:head><title>Collectium — every collection deserves a vitrine</title></svelte:head>

<section class="head">
  <h1>Home</h1>
  <p class="greeting">
    {#if me}
      Welcome back, <strong>{me.display_name || me.username}</strong>.
    {:else}
      Look up any collector's vitrine — no account needed.
    {/if}
  </p>
</section>

<form class="search" on:submit={lookup} role="search">
  <div class="search-field">
    <span class="at" aria-hidden="true">@</span>
    <input
      class="input"
      type="text"
      name="u"
      autocomplete="off"
      spellcheck="false"
      placeholder="cool_collector"
      aria-label="Collector handle"
      bind:value={handle}
      on:input={() => (error = '')}
    />
    <button class="btn" type="submit" disabled={busy}>
      {busy ? 'Looking…' : 'Open vitrine'}
    </button>
  </div>
  {#if error}
    <p class="notice notice-error" role="alert">{error}</p>
  {/if}
</form>

{#if !me}
  <div class="aero guest-card">
    <div class="guest-mark"><Logo size={44} /></div>
    <div>
      <h2>Start your own vitrine</h2>
      <p class="muted">
        Binders for card pages, glass cases for objects. Share either with a link or a QR code.
      </p>
    </div>
    <div class="guest-actions">
      <a class="btn" href="/signup">Create account</a>
      <a class="btn btn-ghost" href="/login">Sign in</a>
    </div>
  </div>
{:else}
  <section class="mine">
    <div class="section-head">
      <h2>Your collections</h2>
      <a class="link" href={`/profile?u=${encodeURIComponent(me.username)}`}>Open profile ›</a>
    </div>

    {#if mineState === 'loading'}
      <p class="empty-note">Reading your shelves…</p>
    {:else if !mine.length}
      <div class="aero empty-state">
        <p><strong>Nothing on the shelves yet.</strong></p>
        <p class="muted">Create your first binder or display case from your profile.</p>
        <a class="btn" href={`/profile?u=${encodeURIComponent(me.username)}`}>Go to profile</a>
      </div>
    {:else}
      <div class="rows">
        {#each mine.slice(0, 4) as col (col.id)}
          <CollectionCard collection={col} on:open={() => openCollection(col)} />
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .head {
    margin-bottom: 1.25rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: 0.005em;
  }

  .greeting {
    margin-top: 0.2rem;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .greeting strong {
    color: var(--text-soft);
  }

  /* Figma home: one wide handle search bar. */
  .search {
    margin-bottom: 1.75rem;
  }

  .search-field {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    padding: 5px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.16));
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.6),
      0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .search-field:focus-within {
    border-color: rgba(0, 229, 255, 0.6);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.6),
      0 0 12px rgba(0, 229, 255, 0.3);
  }

  .at {
    display: flex;
    align-items: center;
    padding-left: 0.8rem;
    color: var(--text-dim);
    font-family: var(--font-data);
    font-size: 0.95rem;
  }

  .search-field .input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    padding-left: 0.35rem;
  }

  .search-field .input:focus {
    box-shadow: none;
  }

  .search .notice {
    margin-top: 0.75rem;
  }

  /* ---- guest panel ---- */

  .guest-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem 1.1rem;
    align-items: center;
    padding: 1.25rem 1.4rem;
  }

  .guest-mark {
    display: grid;
    place-items: center;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.2), rgba(0, 0, 0, 0.35));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), inset 0 -2px 6px rgba(0, 0, 0, 0.6);
    grid-row: span 2;
  }

  .guest-card h2 {
    font-size: 1.05rem;
  }

  .guest-card p {
    margin-top: 0.2rem;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .guest-actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  /* ---- your collections ---- */

  .mine {
    margin-top: 0.25rem;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .section-head h2 {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .link {
    font-size: 0.8rem;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .empty-state {
    padding: 1.15rem 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  .empty-state .btn {
    margin-top: 0.6rem;
  }

  @media (max-width: 620px) {
    .search-field {
      flex-wrap: wrap;
    }

    .search-field .btn {
      width: 100%;
    }

    .guest-card {
      grid-template-columns: 1fr;
    }

    .guest-mark {
      grid-row: auto;
    }
  }
</style>
