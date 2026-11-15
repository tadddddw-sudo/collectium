<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { userProfile, waitForAuth } from '$lib/stores.js';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { handleAuthFailure } from '$lib/session.js';
  import { buildProfileUrl, renderQrToDataUrl } from '$lib/qr.js';

  let me = null;
  let ready = false;
  let qrSrc = '';
  let qrUrl = '';
  let copied = false;

  let exportNote = false;

  let confirmingDelete = false;
  let deletePassword = '';
  // Accounts created through Auth0 / Google have no password to type.
  $: usesPassword = me?.auth_provider !== 'auth0';
  let deleteError = '';
  let deleting = false;

  function startDelete() {
    confirmingDelete = true;
    deletePassword = '';
    deleteError = '';
  }

  function cancelDelete() {
    confirmingDelete = false;
    deletePassword = '';
    deleteError = '';
  }

  async function deleteAccount(event) {
    event.preventDefault();
    deleteError = '';
    deleting = true;
    try {
      await CollectiumAPI.deleteAccount(
        usesPassword ? deletePassword : { confirm_username: deletePassword }
      );
      userProfile.set(null);
      goto('/', { replaceState: true });
    } catch (err) {
      deleting = false;
      if (handleAuthFailure(err)) return;
      deleteError = err.message || 'Could not delete the account.';
    }
  }

  // Follow the store so edits made on the profile page show up here.
  $: if (ready) me = $userProfile;

  onMount(async () => {
    me = await waitForAuth();
    ready = true;
    if (me) {
      qrUrl = buildProfileUrl(me.username);
      try {
        qrSrc = await renderQrToDataUrl(qrUrl);
      } catch {
        qrSrc = '';
      }
    }
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(qrUrl);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* the input is selectable */
    }
  }

  async function signOut() {
    const redirect = await CollectiumAPI.logout();
    userProfile.set(null);
    // Auth0 sessions also need a visit to Auth0 to end its single sign-on session.
    if (redirect) {
      location.href = redirect;
      return;
    }
    goto('/login');
  }
</script>

<svelte:head><title>Settings — Collectium</title></svelte:head>

<section class="head">
  <h1>Settings</h1>
  <p class="greeting">Account and sharing options for this browser session.</p>
</section>

{#if !ready}
  <p class="empty-note">Reading your session…</p>
{:else if !me}
  <div class="aero group">
    <div class="group-head">
      <h2>Not signed in</h2>
      <p class="dim">Sign in to manage your collections and profile.</p>
    </div>
    <div class="group-body actions">
      <a class="btn" href="/login">Sign in</a>
      <a class="btn btn-ghost" href="/signup">Create account</a>
    </div>
  </div>
{:else}
  <div class="stack">
    <div class="aero group">
      <div class="group-head">
        <h2>Account</h2>
        <p class="dim">Your public identity on Collectium.</p>
      </div>
      <div class="group-body rows">
        <div class="setting-row">
          <span class="k">Display name</span>
          <span class="v">{me.display_name || me.username}</span>
        </div>
        <div class="setting-row">
          <span class="k">Handle</span>
          <span class="v mono">@{me.username}</span>
        </div>
        <div class="setting-row">
          <span class="k">Profile</span>
          <a class="v link" href={`/profile?u=${encodeURIComponent(me.username)}`}>Open my collection ›</a>
        </div>
        <div class="actions">
          <a class="btn btn-sm" href={`/profile?u=${encodeURIComponent(me.username)}&edit=1`}>
            Edit name, handle, bio and pictures
          </a>
        </div>
      </div>

      <div class="subsection">
        <h3>Your data</h3>
        <p class="dim">Download a copy of the images you have uploaded.</p>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" type="button" on:click={() => (exportNote = true)}>
            Download my data
          </button>
        </div>
        {#if exportNote}
          <p class="notice notice-info" role="status">Data export is coming soon.</p>
        {/if}
      </div>

      <div class="subsection">
        <h3>Delete account</h3>
        <p class="dim">
          Permanently deletes your account, collections, items and images. This cannot be undone.
        </p>
        {#if !confirmingDelete}
          <div class="actions">
            <button class="btn btn-danger btn-sm" type="button" on:click={startDelete}>
              Delete account
            </button>
          </div>
        {:else}
          <form class="confirm" on:submit={deleteAccount}>
            {#if deleteError}
              <p class="notice notice-error" role="alert">{deleteError}</p>
            {/if}
            <div class="field">
              <label for="delete-password">
                {usesPassword ? 'Enter your password to confirm' : `Type your username (${me.username}) to confirm`}
              </label>
              {#if usesPassword}
                <input
                  class="input"
                  id="delete-password"
                  name="password"
                  type="password"
                  autocomplete="current-password"
                  required
                  bind:value={deletePassword}
                />
              {:else}
                <input
                  class="input"
                  id="delete-password"
                  name="username"
                  type="text"
                  autocomplete="off"
                  required
                  bind:value={deletePassword}
                />
              {/if}
            </div>
            <div class="actions">
              <button class="btn btn-danger btn-sm" type="submit" disabled={deleting || !deletePassword}>
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button class="btn btn-ghost btn-sm" type="button" on:click={cancelDelete} disabled={deleting}>
                Cancel
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>

    <div class="aero group">
      <div class="group-head">
        <h2>Share profile</h2>
        <p class="dim">A link and QR code that opens your collection on any device.</p>
      </div>
      <div class="group-body share">
        {#if qrSrc}
          <img class="qr" src={qrSrc} alt={`QR code for @${me.username}`} />
        {/if}
        <div class="share-side">
          <input class="input mono share-url" readonly value={qrUrl} on:focus={(e) => e.currentTarget.select()} />
          <button class="btn btn-ghost btn-sm" type="button" on:click={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>

    <div class="aero group">
      <div class="group-head">
        <h2>Session</h2>
        <p class="dim">Signing out clears the httpOnly session cookies on this device.</p>
      </div>
      <div class="group-body actions">
        <button class="btn btn-danger" type="button" on:click={signOut}>Sign out</button>
      </div>
    </div>
  </div>
{/if}


<style>
  .head {
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 650;
  }

  .greeting {
    margin-top: 0.2rem;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .group {
    padding: 1.15rem 1.25rem 1.25rem;
  }

  .group-head h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  .group-head p {
    margin-top: 0.15rem;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .group-body {
    margin-top: 0.9rem;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .setting-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.8rem;
    /* a shallow carved channel, one per value */
    border-radius: var(--r-sm);
    border: 1px solid var(--well-border);
    background: var(--well-bg);
    box-shadow: var(--shadow-carve), var(--edge-lip);
  }

  .k {
    font-size: 0.8rem;
    color: var(--text-dim);
  }

  .v {
    font-size: 0.86rem;
    color: var(--text-main);
    text-shadow: var(--text-glow);
  }

  .link {
    font-size: 0.84rem;
  }

  .share {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .qr {
    width: 148px;
    height: 148px;
    border-radius: 8px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .share-side {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .share-url {
    width: 100%;
    font-size: 0.74rem;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .subsection {
    margin-top: 1.1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .subsection h3 {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .subsection > p.dim {
    margin: 0.15rem 0 0.7rem;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .subsection .notice {
    margin-top: 0.7rem;
  }

  .confirm {
    max-width: 360px;
  }

  .confirm .notice {
    margin: 0 0 0.7rem;
  }

</style>
