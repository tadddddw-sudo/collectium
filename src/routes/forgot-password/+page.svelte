<script>
  import { CollectiumAPI } from '$lib/apiClient.js';

  let email = '';
  let error = '';
  let sent = '';
  let busy = false;

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const data = await CollectiumAPI.forgotPassword(email.trim());
      sent = data.message || 'If an account exists for that email, a reset link is on its way.';
    } catch (err) {
      error = err.message || 'Could not send the reset email.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Reset your password — Collectium</title></svelte:head>

<div class="card aero">
  <header>
    <span class="eyebrow">Collectium account</span>
    <h1>Forgot password</h1>
    <p class="sub">Enter your account email and we'll send you a link to choose a new password.</p>
  </header>

  {#if sent}
    <p class="notice notice-success" role="status">{sent}</p>
    <p class="hint">The link works once and expires after an hour. Check your spam folder if it doesn't arrive.</p>
  {:else}
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

      <button class="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  {/if}

  <p class="switch">Remembered it? <a href="/login">Log in</a></p>
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

  .sub,
  .hint {
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  .notice {
    margin-bottom: 0.9rem;
  }

  .switch {
    margin-top: 1.15rem;
    text-align: center;
    font-size: 0.84rem;
    color: var(--text-dim);
  }
</style>
