<script>
  import { onMount } from 'svelte';

  /**
   * Cookie notice.
   *
   * Collectium only sets strictly necessary cookies (the httpOnly sign-in
   * session) and keeps the theme choice in localStorage. Those need no consent
   * under the EU ePrivacy rules, so there is nothing to opt out of: the banner
   * tells visitors what is stored and remembers that they've seen it.
   * If you ever add analytics or ads, they must wait for an explicit opt-in
   * here before loading.
   */
  const KEY = 'collectium-cookie-notice';
  let visible = false;

  onMount(() => {
    try {
      visible = !localStorage.getItem(KEY);
    } catch {
      visible = true;
    }
  });

  function accept() {
    try {
      localStorage.setItem(KEY, `accepted:${new Date().toISOString()}`);
    } catch {
      /* storage blocked: the notice shows again next visit */
    }
    visible = false;
  }
</script>

{#if visible}
  <div class="cookie-notice aero" role="region" aria-label="Cookie notice">
    <p>
      Collectium uses only essential cookies to keep you signed in, and remembers your theme in
      this browser. No tracking or advertising.
      <a href="/privacy">Learn more</a>
    </p>
    <button class="btn btn-sm" type="button" on:click={accept}>Accept</button>
  </div>
{/if}

<style>
  .cookie-notice {
    position: fixed;
    z-index: 70;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    max-width: 440px;
    padding: 0.85rem 1rem;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-soft);
    background: var(--modal-bg);
    box-shadow: var(--shadow-lift), var(--edge-spec), var(--edge-ao);
  }

  .cookie-notice p {
    flex: 1;
  }

  @media (max-width: 720px) {
    .cookie-notice {
      left: 10px;
      right: 10px;
      /* sit above the bottom navigation bar */
      bottom: 76px;
      max-width: none;
    }
  }
</style>
