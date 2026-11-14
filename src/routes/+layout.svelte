<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AppShell from '$lib/components/AppShell.svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { markAuthReady } from '$lib/stores.js';

  let mounted = false;

  // Auth pages are a bare, centered card — no rail.
  const BARE_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password'];
  $: bare = BARE_PAGES.includes($page.url.pathname);

  onMount(() => {
    // If Supabase sent a reset link to the Site URL instead of /reset-password
    // (APP_URL unset or not on the redirect allow list), hand it over.
    if (location.pathname !== '/reset-password' && /[#&]type=recovery(&|$)/.test(location.hash)) {
      location.replace(`/reset-password${location.hash}`);
      return;
    }
    // Same for a signup confirmation link.
    if (location.pathname !== '/login' && /[#&]type=signup(&|$)/.test(location.hash)) {
      location.replace(`/login?confirmed=1${location.hash}`);
      return;
    }
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
