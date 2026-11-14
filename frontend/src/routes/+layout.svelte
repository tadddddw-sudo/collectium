<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { markAuthReady } from '$lib/stores.js';

  onMount(() => {
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

<slot />
