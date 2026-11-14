<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { PASSWORD_RULES, isPasswordValid } from '$lib/password.js';
  import { userProfile } from '$lib/stores.js';

  // The credentials from the email link. Held in memory only.
  let link = null;
  let linkError = '';

  let password = '';
  let confirm = '';
  let error = '';
  let done = false;
  let busy = false;
  let timer = null;

  $: passwordOk = isPasswordValid(password);
  $: matches = password === confirm;

  onMount(() => {
    // Default Supabase email: /reset-password#access_token=…&refresh_token=…&type=recovery
    // Custom template:        /reset-password?token_hash=…&type=recovery
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);

    if (hash.get('error') || hash.get('error_code')) {
      linkError =
        hash.get('error_code') === 'otp_expired'
          ? 'This reset link has expired or was already used.'
          : hash.get('error_description') || 'This reset link is not valid.';
    } else if (query.get('token_hash')) {
      link = { token_hash: query.get('token_hash') };
    } else if (hash.get('access_token') && hash.get('refresh_token')) {
      link = { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') };
    } else {
      linkError = 'Open this page from the link in your password reset email.';
    }

    // Take the tokens out of the address bar and browser history.
    replaceState('/reset-password', {});
  });

  onDestroy(() => clearTimeout(timer));

  async function submit(event) {
    event.preventDefault();
    error = '';
    if (!passwordOk) {
      error = 'Password does not meet the requirements.';
      return;
    }
    if (!matches) {
      error = 'The passwords do not match.';
      return;
    }
    busy = true;
    try {
      await CollectiumAPI.resetPassword(password, link);
      link = null;
      done = true;
      // Every session was signed out on the server, including this browser's.
      userProfile.set(null);
      timer = setTimeout(() => goto('/login', { replaceState: true }), 1500);
    } catch (err) {
      if (err.code === 'INVALID_RESET_LINK') {
        link = null;
        linkError = err.message;
      } else {
        error = err.message || 'Could not reset the password.';
      }
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Choose a new password — Collectium</title></svelte:head>

<div class="card aero">
  <header>
    <span class="eyebrow">Collectium account</span>
    <h1>New password</h1>
    <p class="sub">Choose a new password. You'll be signed out on every device.</p>
  </header>

  {#if done}
    <p class="notice notice-success" role="status">Password changed. Redirecting to log in…</p>
  {:else if linkError}
    <p class="notice notice-error" role="alert">{linkError}</p>
    <a class="btn btn-block" href="/forgot-password">Request a new link</a>
  {:else if link}
    <form on:submit={submit}>
      {#if error}
        <p class="notice notice-error" role="alert">{error}</p>
      {/if}

      <div class="field">
        <label for="password">New password</label>
        <input
          class="input"
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
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

      <div class="field">
        <label for="confirm">Confirm new password</label>
        <input
          class="input"
          id="confirm"
          name="confirm"
          type="password"
          autocomplete="new-password"
          required
          bind:value={confirm}
        />
      </div>

      <button class="btn btn-block" type="submit" disabled={busy || !passwordOk || !matches}>
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  {/if}

  <p class="switch"><a href="/login">Back to log in</a></p>
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
