<script>
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { CollectiumAPI } from '$lib/apiClient.js';

  let username = '';
  let email = '';
  let password = '';
  let error = '';
  let success = false;
  let busy = false;
  let timer = null;

  onDestroy(() => clearTimeout(timer));

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      await CollectiumAPI.signup(username.trim(), email, password);
      success = true;
      timer = setTimeout(() => goto('/login', { replaceState: true }), 1200);
    } catch (err) {
      error = err.message || 'Could not create the account.';
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign up — Collectium</title></svelte:head>

<main class="auth">
  <header>
    <p class="eyebrow">Collectium</p>
    <h1>Create an account</h1>
    <p class="sub">Start a binder or a display case in a minute.</p>
  </header>

  {#if success}
    <p class="notice notice-success" role="status">Account created! Redirecting to log in…</p>
  {:else}
    <form on:submit={submit}>
      {#if error}
        <p class="notice notice-error" role="alert">{error}</p>
      {/if}

      <div class="field">
        <label for="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          autocomplete="username"
          placeholder="cool_collector"
          minlength="3"
          required
          bind:value={username}
        />
      </div>

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
          autocomplete="new-password"
          placeholder="At least 6 characters"
          minlength="6"
          required
          bind:value={password}
        />
      </div>

      <button class="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Sign up'}
      </button>
    </form>
  {/if}

  <p class="switch">Already have an account? <a href="/login">Log in</a></p>
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
