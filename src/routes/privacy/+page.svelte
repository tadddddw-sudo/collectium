<script>
  import LegalDocument from '$lib/components/LegalDocument.svelte';
  import source from '$lib/legal/privacy-policy.md?raw';
</script>

<svelte:head><title>Privacy Policy — Collectium</title></svelte:head>

<LegalDocument {source} />
