<script>
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { userProfile } from '$lib/stores.js';
  import GoogleSignIn from '$lib/components/GoogleSignIn.svelte';

  let email = '';
  let password = '';
  let remember = false;
  let error = '';
  let errorCode = '';
  let info = '';
  let busy = false;
  let resending = false;

  const AUTH0_ERRORS = {
    auth0_failed: 'Google sign-in did not complete. Please try again.',
    auth0_denied: 'Google sign-in was cancelled or not allowed for this account.',
    auth0_unavailable: 'Google sign-in is not available right now.',
  };

  // Only same-site paths ("/x"), never "//host" or "https://host".
  $: nextParam = $page.url.searchParams.get('next');
  $: safeNext = nextParam && /^\/(?![/\\])/.test(nextParam) ? nextParam : '';

  onMount(() => {
    const authError = $page.url.searchParams.get('error');
    if (authError && AUTH0_ERRORS[authError]) error = AUTH0_ERRORS[authError];
    // Arriving from the confirmation email: /login?confirmed=1#access_token=…&type=signup
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('error_code') === 'otp_expired') {
      error = 'That confirmation link has expired. Sign in to get a new one.';
    } else if ($page.url.searchParams.get('confirmed') || hash.get('type') === 'signup') {
      info = 'Email confirmed. You can log in now.';
    }
    // Drop the tokens from the address bar; the app signs in with the password instead.
    if (location.hash) replaceState(`${location.pathname}${location.search}`, {});
  });

  async function resend() {
    resending = true;
    try {
      const data = await CollectiumAPI.resendConfirmation(email.trim());
      error = '';
      errorCode = '';
      info = data.message;
    } catch (err) {
      error = err.message || 'Could not send the email.';
    } finally {
      resending = false;
    }
  }

  async function submit(event) {
    event.preventDefault();
    error = '';
    errorCode = '';
    info = '';
    busy = true;
    try {
      const data = await CollectiumAPI.login(email, password, remember);
      const profile = data.profile ?? data.user;
      userProfile.set(profile);
      const destination = safeNext || `/profile?u=${encodeURIComponent(profile.username)}`;
      goto(destination, { replaceState: true });
    } catch (err) {
      error = err.message || 'Could not sign in.';
      errorCode = err.code || '';
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

  <GoogleSignIn mode="login" {remember} next={safeNext} />

  <form on:submit={submit}>
    {#if info}
      <p class="notice notice-success" role="status">{info}</p>
    {/if}
    {#if error}
      <div class="notice notice-error" role="alert">
        <span>{error}</span>
        {#if errorCode === 'EMAIL_NOT_CONFIRMED'}
          <button class="btn btn-ghost btn-sm resend" type="button" on:click={resend} disabled={resending}>
            {resending ? 'Sending…' : 'Resend email'}
          </button>
        {/if}
      </div>
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
      <a class="forgot" href="/forgot-password">Forgot your password?</a>
    </div>

    <label class="check-row remember">
      <input type="checkbox" name="remember" bind:checked={remember} />
      Keep me signed in
    </label>

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

  .forgot {
    display: inline-block;
    margin-top: 0.45rem;
    font-size: 0.8rem;
  }

  .remember {
    margin: 0.1rem 0 1rem;
  }

  .notice-error {
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .resend {
    flex: none;
  }

  .switch {
    margin-top: 1.15rem;
    text-align: center;
    font-size: 0.84rem;
    color: var(--text-dim);
  }
</style>
