<script>
  import LegalDocument from '$lib/components/LegalDocument.svelte';
  import source from '$lib/legal/terms-of-service.md?raw';
</script>

<svelte:head><title>Terms of Service — Collectium</title></svelte:head>

<LegalDocument {source} />
