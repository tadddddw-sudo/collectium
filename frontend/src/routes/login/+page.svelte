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

<main class="auth">
  <header>
    <p class="eyebrow">Collectium</p>
    <h1>Log in</h1>
    <p class="sub">Return to your binders and cases.</p>
  </header>

  <form on:submit={submit} novalidate={false}>
    {#if error}
      <p class="notice notice-error" role="alert">{error}</p>
    {/if}

    <div class="field">
      <label for="email">Email</label>
      <input
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
</main>

<style>
  .auth {
    max-width: 24rem;
    margin: 0 auto;
    padding: clamp(2.5rem, 10vh, 6rem) 1.25rem 4rem;
  }

  header {
    margin-bottom: 1.75rem;
  }

  h1 {
    margin: 0.6rem 0 0.35rem;
    font-size: 2.1rem;
    font-weight: 500;
  }

  .sub {
    color: var(--paper-dim);
    font-size: 0.92rem;
  }

  .switch {
    margin-top: 1.4rem;
    font-size: 0.88rem;
    color: var(--paper-faint);
  }
</style>
