<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { userProfile } from '$lib/stores.js';

  let email = '';
  let password = '';
  let error = '';
  let busy = false;

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const data = await CollectiumAPI.login(email, password);
      const profile = data.profile ?? data.user;
      userProfile.set(profile);
      const next = $page.url.searchParams.get('next');
      const destination = next || `/profile?u=${encodeURIComponent(profile.username)}`;
      goto(destination, { replaceState: true });
    } catch (err) {
      error = err.message || 'Could not sign in.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Log in — Collectium</title></svelte:head>

<div class="card aero">
  <header>
    <span class="eyebrow">Collectium account</span>
    <h1>Log in</h1>
    <p class="sub">Return to your binders and display cases.</p>
  </header>

  <form on:submit={submit}>
    {#if error}
      <p class="notice notice-error" role="alert">{error}</p>
    {/if}

    <div class="field">
      <label for="email">Email</label>
      <input
        class="input"
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        required
        bind:value={email}
      />
    </div>

    <div class="field">
      <label for="password">Password</label>
      <input
        class="input"
        id="password"
        name="password"
        type="password"
        autocomplete="current-password"
        placeholder="••••••••"
        required
        bind:value={password}
      />
    </div>

    <button class="btn btn-block" type="submit" disabled={busy}>
      {busy ? 'Signing in…' : 'Log in'}
    </button>
  </form>

  <p class="switch">No account yet? <a href="/signup">Create one</a></p>
</div>

<style>
  .card {
    width: 100%;
    max-width: 380px;
    padding: 1.6rem 1.5rem 1.35rem;
  }

  header {
    margin-bottom: 1.35rem;
  }

  h1 {
    margin: 0.35rem 0 0.3rem;
    font-size: 1.65rem;
    font-weight: 650;
  }

  .sub {
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  form .notice {
    margin-bottom: 0.9rem;
  }

  .switch {
    margin-top: 1.15rem;
    text-align: center;
    font-size: 0.84rem;
    color: var(--text-dim);
  }
</style>
