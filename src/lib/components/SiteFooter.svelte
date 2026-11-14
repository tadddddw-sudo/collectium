<script>
  // Computed in the browser, so the year is always current without a rebuild.
  const year = new Date().getFullYear();
</script>

<footer class="site-footer">
  <span>© {year} Collectium</span>
  <span aria-hidden="true">·</span>
  <a href="/terms">Terms of Service</a>
  <span aria-hidden="true">·</span>
  <a href="/privacy">Privacy Policy</a>
</footer>

<style>
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 2.5rem;
    font-size: 0.78rem;
    color: var(--text-dim);
    text-shadow: var(--text-glow);
  }

  .site-footer a {
    color: var(--text-muted);
    text-shadow: none;
  }

  .site-footer a:hover {
    color: var(--accent);
  }
</style>
