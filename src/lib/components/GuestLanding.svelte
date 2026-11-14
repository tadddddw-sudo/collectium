<script>
  import { goto } from '$app/navigation';

  let username = '';
  let touched = false;

  function viewProfile(event) {
    event.preventDefault();
    const name = username.trim().replace(/^@/, '');
    if (!name) {
      touched = true;
      return;
    }
    goto(`/profile?u=${encodeURIComponent(name)}`);
  }
</script>

<div class="landing aero">
  <span class="eyebrow">Collectium</span>
  <h1>Whose collections are you looking for?</h1>
  <p class="lede">
    Look up a collector by their handle. Binders, display cases, and every piece inside them
    open right up — no account needed.
  </p>

  <form class="lookup" on:submit={viewProfile}>
    <label for="lookup-user">Collector handle</label>
    <div class="lookup-row">
      <span class="at" aria-hidden="true">@</span>
      <input
        class="input"
        id="lookup-user"
        name="u"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="cool_collector"
        bind:value={username}
        on:input={() => (touched = false)}
        aria-invalid={touched && !username.trim()}
      />
      <button class="btn" type="submit">Open collection</button>
    </div>
    {#if touched && !username.trim()}
      <p class="notice notice-error" role="alert">Enter a handle to continue.</p>
    {/if}
  </form>

  <p class="switch">or <a href="/login">sign in</a> to manage your own collection.</p>
</div>

<style>
  .landing {
    width: 100%;
    max-width: 470px;
    padding: 1.75rem 1.6rem 1.5rem;
  }

  h1 {
    margin: 0.45rem 0 0.6rem;
    font-size: 1.55rem;
    font-weight: 650;
  }

  .lede {
    margin-bottom: 1.35rem;
    color: var(--text-muted);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .lookup > label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-soft);
    text-shadow: var(--text-glow);
  }

  .lookup-row {
    display: flex;
    align-items: stretch;
    gap: 0.45rem;
    /* One carved channel holding the input and its button. */
    padding: 5px;
    border-radius: var(--r-md);
    border: 1px solid rgba(0, 0, 0, 0.6);
    background: rgba(0, 0, 0, 0.3);
    box-shadow:
      inset 0px 3px 6px rgba(0, 0, 0, 0.5),
      0px 1px 0px rgba(255, 255, 255, 0.1);
    transition:
      border-color var(--transition-smooth),
      box-shadow var(--transition-smooth);
  }

  .landing .input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    padding-left: 0.3rem;
  }

  .landing .input:focus,
  .landing .input:focus-visible {
    box-shadow: none;
    outline: none;
  }

  .lookup-row:focus-within {
    border-color: var(--accent-cyan);
    box-shadow:
      inset 0px 3px 6px rgba(0, 0, 0, 0.5),
      0px 0px 8px rgba(0, 229, 255, 0.4);
  }

  .at {
    display: flex;
    align-items: center;
    padding-left: 0.7rem;
    color: var(--text-dim);
    font-family: var(--font-data);
  }

  .lookup .notice {
    margin-top: 0.75rem;
  }

  .switch {
    margin-top: 1.2rem;
    font-size: 0.84rem;
    color: var(--text-dim);
  }
</style>
