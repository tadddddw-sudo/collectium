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

<main class="landing">
  <p class="eyebrow">Collectium</p>
  <h1>Every collection<br />deserves a vitrine.</h1>
  <p class="lede">
    Display binders and glass cases for the things you keep. Look up a collector by
    their handle, or sign in to arrange your own shelves.
  </p>

  <form class="lookup" on:submit={viewProfile}>
    <label for="lookup-user">Collector handle</label>
    <div class="lookup-row">
      <span class="at" aria-hidden="true">@</span>
      <input
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
      <button class="btn" type="submit">View profile</button>
    </div>
    {#if touched && !username.trim()}
      <p class="notice notice-error">Enter a handle to continue.</p>
    {/if}
  </form>

  <p class="switch">or <a href="/login">sign in</a> to manage your own collection.</p>
</main>

<style>
  .landing {
    max-width: 34rem;
    margin: 0 auto;
    padding: clamp(3rem, 12vh, 7rem) 1.25rem 4rem;
  }

  h1 {
    margin: 0.75rem 0 1rem;
    font-size: clamp(2.4rem, 6vw, 3.6rem);
    font-weight: 500;
  }

  .lede {
    max-width: 42ch;
    color: var(--paper-dim);
    font-size: 1rem;
    line-height: 1.65;
    margin-bottom: 2.25rem;
  }

  .lookup {
    margin: 0;
  }

  .lookup > label {
    display: block;
    font-size: 0.78rem;
    color: var(--paper-faint);
    margin-bottom: 0.45rem;
  }

  .lookup-row {
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
    padding: 0.3rem;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    background: var(--ink-raised);
  }

  .lookup-row:focus-within {
    border-color: var(--mint);
  }

  .at {
    display: flex;
    align-items: center;
    padding-left: 0.55rem;
    color: var(--paper-faint);
    font-family: var(--font-data);
  }

  .lookup input {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.25rem;
    border: 0;
    background: transparent;
    color: var(--paper);
    font-size: 1rem;
  }

  .lookup input:focus {
    outline: none;
  }

  .lookup .notice {
    margin: 0.7rem 0 0;
  }

  .switch {
    margin-top: 1.5rem;
    color: var(--paper-faint);
    font-size: 0.9rem;
  }
</style>
