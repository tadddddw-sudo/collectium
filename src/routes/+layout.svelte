<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AppShell from '$lib/components/AppShell.svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { markAuthReady } from '$lib/stores.js';

  let mounted = false;

  // Auth pages are a bare, centered card — no rail.
  $: bare = $page.url.pathname === '/login' || $page.url.pathname === '/signup';

  onMount(() => {
    mounted = true;
    // Resolve the session exactly once; every page reads the store afterwards.
    (async () => {
      let profile = null;
      try {
        profile = await CollectiumAPI.me();
      } catch {
        profile = null;
      }
      markAuthReady(profile);
    })();
  });
</script>

{#if mounted}
  <AppShell bare={bare}>
    <slot />
  </AppShell>
{:else}
  <!-- First paint: keep the Aero desktop visible instead of a white flash. -->
  <div class="boot" aria-hidden="true"></div>
{/if}

<style>
  .boot {
    min-height: 100dvh;
  }
</style>
