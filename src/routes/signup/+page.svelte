<script>
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { PASSWORD_RULES, isPasswordValid } from '$lib/password.js';

  let username = '';
  let email = '';
  let password = '';
  let error = '';
  let success = false;
  let busy = false;
  let timer = null;

  $: passwordOk = isPasswordValid(password);

  onDestroy(() => clearTimeout(timer));

  async function submit(event) {
    event.preventDefault();
    error = '';
    if (!passwordOk) {
      error = 'Password does not meet the requirements.';
      return;
    }
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

<div class="card aero">
  <header>
    <span class="eyebrow">Collectium account</span>
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
          class="input"
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
          autocomplete="new-password"
          placeholder="At least 8 characters"
          minlength="8"
          required
          aria-describedby="password-rules"
          bind:value={password}
        />
        <ul class="rules" id="password-rules">
          {#each PASSWORD_RULES as rule (rule.id)}
            <li class:met={rule.test(password)}>
              <span aria-hidden="true">{rule.test(password) ? '✓' : '•'}</span>
              {rule.label}
            </li>
          {/each}
        </ul>
      </div>

      <button class="btn btn-block" type="submit" disabled={busy || !passwordOk}>
        {busy ? 'Creating…' : 'Sign up'}
      </button>
    </form>
  {/if}

  <p class="switch">Already have an account? <a href="/login">Log in</a></p>
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

  form .notice,
  .notice {
    margin-bottom: 0.9rem;
  }

  .rules {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .rules li.met {
    color: var(--text-muted);
    font-weight: 600;
  }

  .switch {
    margin-top: 1.15rem;
    text-align: center;
    font-size: 0.84rem;
    color: var(--text-dim);
  }
</style>
