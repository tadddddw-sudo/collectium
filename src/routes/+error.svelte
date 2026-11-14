<script>
  import { page } from '$app/stores';
  import Logo from '$lib/components/Logo.svelte';

  $: notFound = $page.status === 404;
</script>

<svelte:head>
  <title>{notFound ? 'Page not found' : 'Something went wrong'} — Collectium</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="error aero">
  <div class="mark"><Logo size={52} /></div>
  <p class="code mono">{$page.status}</p>
  <h1>{notFound ? 'This shelf is empty' : 'Something went wrong'}</h1>
  <p class="muted">
    {#if notFound}
      There's nothing at <span class="mono">{$page.url.pathname}</span>. The link may be mistyped, or
      the page was moved or deleted.
    {:else}
      {$page.error?.message || 'An unexpected error occurred. Please try again.'}
    {/if}
  </p>
  <div class="actions">
    <a class="btn" href="/">Back to home</a>
    <button class="btn btn-ghost" type="button" on:click={() => history.back()}>Go back</button>
  </div>
</section>

<style>
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 2rem;
    padding: 2.2rem 1.5rem 2rem;
    text-align: center;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    margin-bottom: 0.4rem;
    border-radius: 50%;
    border: 1px solid var(--well-border);
    background: var(--well-bg);
    box-shadow: var(--shadow-carve), var(--edge-lip);
  }

  .code {
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 18px rgb(var(--accent-rgb) / 0.35);
  }

  h1 {
    font-size: 1.35rem;
    font-weight: 650;
  }

  p.muted {
    max-width: 46ch;
    font-size: 0.9rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 0.9rem;
  }
</style>
