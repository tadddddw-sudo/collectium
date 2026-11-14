<script>
  import { renderMarkdown } from '$lib/markdown.js';

  /** Markdown source of the document (bundled with the app, not user input). */
  export let source = '';

  $: html = renderMarkdown(source);
</script>

<article class="aero legal">
  {@html html}
</article>

<style>
  .legal {
    padding: 1.6rem 1.75rem 1.9rem;
    font-size: 0.9rem;
    line-height: 1.65;
    color: var(--text-muted);
  }

  .legal :global(h1) {
    font-size: 1.6rem;
    font-weight: 650;
    color: var(--text-main);
    margin-bottom: 0.4rem;
  }

  .legal :global(h2) {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 1.6rem 0 0.5rem;
  }

  .legal :global(p) {
    margin: 0.55rem 0;
  }

  .legal :global(ul) {
    margin: 0.5rem 0;
    padding-left: 1.3rem;
  }

  .legal :global(li) {
    margin: 0.25rem 0;
  }

  .legal :global(strong) {
    color: var(--text-main);
  }

  .legal :global(code) {
    font-size: 0.84em;
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .legal :global(blockquote) {
    margin: 1rem 0;
    padding: 0.6rem 0.9rem;
    border-left: 3px solid var(--accent-cyan);
    background: rgba(0, 229, 255, 0.06);
    border-radius: 4px;
  }

  .legal :global(hr) {
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    margin: 1.4rem 0;
  }
</style>
