<script>
  import { onMount } from 'svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';

  /** 'login' or 'signup': only changes the wording. Google creates the account either way. */
  export let mode = 'login';
  /** "Keep me signed in", forwarded so it survives the round trip to Google. */
  export let remember = false;
  /** Same-site path to return to after signing in, or ''. */
  export let next = '';

  let enabled = false;

  onMount(async () => {
    try {
      enabled = (await CollectiumAPI.getAuthProviders()).google === true;
    } catch {
      /* API unreachable or not configured: just show the email form */
    }
  });

  $: verb = mode === 'signup' ? 'Sign up' : 'Continue';

  $: href = (() => {
    const q = new URLSearchParams();
    if (remember) q.set('remember', '1');
    if (next) q.set('next', next);
    const qs = q.toString();
    return `/api/auth/auth0/login${qs ? `?${qs}` : ''}`;
  })();
</script>

{#if enabled}
  <div class="social">
    <!-- A full page navigation on purpose: the server starts the redirect to Google. -->
    <a class="btn btn-ghost btn-block" {href} data-sveltekit-reload>
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18Z" />
        <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71Z" />
        <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795Z" />
      </svg>
      {verb} with Google
    </a>
    {#if mode === 'signup'}
      <p class="legal">
        By signing up you agree to the
        <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>
        and the
        <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
      </p>
    {/if}
    <p class="or"><span>or use your email</span></p>
  </div>
{/if}

<style>
  .social {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .social :global(.btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
  }

  .legal {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-dim);
    text-align: center;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: currentColor;
    opacity: 0.25;
  }
</style>
