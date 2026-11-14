<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import GuestLanding from '$lib/components/GuestLanding.svelte';
  import { waitForAuth } from '$lib/stores.js';

  let ready = false;

  onMount(async () => {
    // The layout probes the session once; wait for it instead of re-fetching.
    const profile = await waitForAuth();
    if (profile) {
      goto(`/profile?u=${encodeURIComponent(profile.username)}`, { replaceState: true });
      return;
    }
    ready = true;
  });
</script>

{#if ready}
  <GuestLanding />
{:else}
  <p class="sr-only" aria-live="polite">Loading</p>
{/if}
