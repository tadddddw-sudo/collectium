<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Logo from './Logo.svelte';
  import SiteFooter from './SiteFooter.svelte';
  import CookieNotice from './CookieNotice.svelte';
  import { userProfile } from '$lib/stores.js';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { theme, toggleTheme } from '$lib/theme.js';

  /** Auth screens render as a bare, centered card (no rail, no column). */
  export let bare = false;

  $: isLight = $theme === 'light';
  $: themeLabel = isLight ? 'Dark theme' : 'Light theme';

  $: me = $userProfile;
  $: path = $page.url.pathname;
  $: viewingSelf = path === '/profile' && !!me && $page.url.searchParams.get('u') === me.username;

  // One destination per rail item. Home already contains the handle lookup, so
  // signed-out visitors get Home + Settings only; the signed-in collector gets
  // Home + My collections + Settings. The identity chip below is not a link.
  $: nav = me
    ? [
        { id: 'home', label: 'Home', href: '/', icon: 'home' },
        { id: 'shelf', label: 'My collections', href: `/profile?u=${encodeURIComponent(me.username)}`, icon: 'shelf' },
        { id: 'settings', label: 'Settings', href: '/settings', icon: 'gear' }
      ]
    : [
        { id: 'home', label: 'Home', href: '/', icon: 'home' },
        { id: 'settings', label: 'Settings', href: '/settings', icon: 'gear' }
      ];

  // Derived up front: the template compares this, so the highlight really does
  // follow the route (calling a helper that reads `path` from the markup would
  // leave Svelte 4 without a dependency to invalidate).
  $: activeId = path === '/'
    ? 'home'
    : path === '/settings'
      ? 'settings'
      : path === '/profile'
        ? (viewingSelf ? 'shelf' : '')
        : path === '/collection'
          ? (me ? 'shelf' : '')
          : '';

  async function signOut() {
    const redirect = await CollectiumAPI.logout();
    userProfile.set(null);
    // Auth0 sessions also need a visit to Auth0 to end its single sign-on session.
    if (redirect) {
      location.href = redirect;
      return;
    }
    goto('/login');
  }
</script>

{#if bare}
  <div class="bare">
    <a class="bare-brand" href="/" aria-label="Collectium home">
      <Logo size={30} />
      <span>Collectium</span>
    </a>
    <slot />
    <button class="btn btn-ghost btn-sm theme-pill" type="button" on:click={toggleTheme}>
      {#if isLight}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
      {/if}
      {themeLabel}
    </button>
    <SiteFooter />
  </div>
  <CookieNotice />
{:else}
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <a class="brand" href="/" aria-label="Collectium home">
        <Logo size={30} />
        <span class="brand-text">
          <strong>Collectium</strong>
          <em>collector's collections</em>
        </span>
      </a>

      <ul class="nav">
        {#each nav as item (item.id)}
          <li>
            <a
              class="nav-item"
              class:active={activeId === item.id}
              href={item.href}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <span class="glyph" aria-hidden="true">
                {#if item.icon === 'home'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11.2 12 4l8 7.2" /><path d="M6.4 10v9.2h11.2V10" /></svg>
                {:else if item.icon === 'shelf'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M4 14.5h16M9.5 4v10.5" /></svg>
                {:else if item.icon === 'gear'}
                  <!-- eight-tooth gear with a centre hole -->
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M9.67 5.19 L10.38 2.54 L13.62 2.54 L14.33 5.19 L14.76 5.35 L15.17 5.53 L17.54 4.16 L19.84 6.46 L18.47 8.83 L18.65 9.24 L18.81 9.67 L21.46 10.38 L21.46 13.62 L18.81 14.33 L18.65 14.76 L18.47 15.17 L19.84 17.54 L17.54 19.84 L15.17 18.47 L14.76 18.65 L14.33 18.81 L13.62 21.46 L10.38 21.46 L9.67 18.81 L9.24 18.65 L8.83 18.47 L6.46 19.84 L4.16 17.54 L5.53 15.17 L5.35 14.76 L5.19 14.33 L2.54 13.62 L2.54 10.38 L5.19 9.67 L5.35 9.24 L5.53 8.83 L4.16 6.46 L6.46 4.16 L8.83 5.53 L9.24 5.35 Z" /><circle cx="12" cy="12" r="3" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="8.6" r="3.6" /><path d="M5 19.4c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5" /></svg>
                {/if}
              </span>
              <span class="label">{item.label}</span>
            </a>
          </li>
        {/each}
      </ul>

      <div class="rail-foot">
        <button
          class="nav-item as-button"
          type="button"
          on:click={toggleTheme}
          aria-label={`Switch to ${themeLabel.toLowerCase()}`}
          title={`Switch to ${themeLabel.toLowerCase()}`}
        >
          <span class="glyph" aria-hidden="true">
            {#if isLight}
              <!-- moon: switch to dark -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
            {:else}
              <!-- sun: switch to light -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
            {/if}
          </span>
          <span class="label">{themeLabel}</span>
        </button>
        {#if me}
          <div class="me-chip" title={`@${me.username}`}>
            {#if me.avatar_url}
              <img class="avatar" src={me.avatar_url} alt="" />
            {:else}
              <span class="avatar" aria-hidden="true">{(me.display_name || me.username || '?').slice(0, 1).toUpperCase()}</span>
            {/if}
            <span class="me-name mono">@{me.username}</span>
          </div>
          <button class="nav-item as-button" type="button" on:click={signOut}>
            <span class="glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6H7.5A2.5 2.5 0 0 0 5 8.5v7A2.5 2.5 0 0 0 7.5 18H14" /><path d="M15.5 12H20m0 0-2.6-2.6M20 12l-2.6 2.6" /></svg>
            </span>
            <span class="label">Sign out</span>
          </button>
        {:else}
          <a class="nav-item" href="/login">
            <span class="glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h6.5A2.5 2.5 0 0 1 19 8.5v7a2.5 2.5 0 0 1-2.5 2.5H10" /><path d="M8.5 12H4m0 0 2.6-2.6M4 12l2.6 2.6" /></svg>
            </span>
            <span class="label">Sign in</span>
          </a>
        {/if}
      </div>
    </nav>

    <main class="shell-main">
      <div class="shell-column" class:wide={path === '/collection'}>
        <slot />
        <SiteFooter />
      </div>
    </main>
  </div>
  <CookieNotice />
{/if}

<style>
  .bare {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.25rem;
  }

  .bare-brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: 0.01em;
    text-shadow: var(--text-glow);
  }

  .bare-brand:hover {
    text-decoration: none;
  }

  .theme-pill {
    margin-top: 1.5rem;
  }

  .theme-pill svg {
    width: 16px;
    height: 16px;
  }

  /* ---------------- rail ---------------- */

  .shell {
    min-height: 100dvh;
  }

  .shell-main {
    display: flex;
    justify-content: center;
    padding: 2rem 1.5rem 4rem calc(var(--rail) + 32px);
  }

  .shell-column {
    width: 100%;
    max-width: var(--column);
  }

  .shell-column.wide {
    max-width: 1040px;
  }

  .rail {
    position: fixed;
    top: 16px;
    left: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: var(--rail);
    padding: 10px;
    border-radius: var(--r-lg);
    z-index: 40;
    overflow: hidden;
    transition:
      width var(--transition-smooth),
      box-shadow var(--transition-smooth);

    /* A tall slab of matte plastic: sheen on the top band, darker toward the
       floor, crisp specular top edge, occluded bottom edge. */
    background: var(--rail-bg);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-lift), var(--edge-spec), var(--edge-ao);
  }

  /* The rail expands over the content, like an Aero sidebar — no reflow. */
  .rail:hover,
  .rail:focus-within {
    width: var(--rail-wide);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    height: 48px;
    /* 9px = nav-item padding (8) + border (1), so the 30px logo shares a
       centre line with the 30px nav glyphs below it */
    padding: 0 9px;
    border-radius: var(--r-md);
    color: var(--text-main);
    flex: none;
    overflow: hidden;
  }

  .brand:hover {
    text-decoration: none;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    white-space: nowrap;
    opacity: 0;
    transition: opacity var(--transition-smooth) 30ms;
  }

  .rail:hover .brand-text,
  .rail:focus-within .brand-text {
    opacity: 1;
  }

  .brand-text strong {
    font-size: 0.95rem;
    font-weight: 650;
  }

  .brand-text em {
    font-style: normal;
    font-size: 0.7rem;
    color: var(--text-dim);
    text-shadow: var(--text-engrave);
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    flex: none;
  }

  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 48px;
    padding: 0 8px;
    border-radius: var(--r-md);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    text-shadow: var(--text-glow);
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-smooth);
  }

  /* Hover raises a plastic key out of the rail. */
  .nav-item:hover {
    color: var(--text-main);
    text-decoration: none;
    border-color: rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02));
    box-shadow:
      var(--shadow-near),
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      inset 0 -1px 0 rgba(0, 0, 0, 0.4);
  }

  .nav-item:active {
    transform: translateY(1px);
  }

  /* Current route: a lit glass key — cyan backlight under a specular top. */
  .nav-item.active {
    color: var(--accent-text);
    border-color: rgb(var(--accent-rgb) / 0.45);
    background:
      linear-gradient(to bottom, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 50%),
      linear-gradient(180deg, rgb(var(--accent-rgb) / 0.28), rgb(var(--accent-deep-rgb) / 0.2));
    box-shadow:
      var(--shadow-near),
      0 0 12px rgb(var(--accent-rgb) / 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.45);
  }

  .nav-item.active::before {
    content: '';
    position: absolute;
    left: -10px;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
    box-shadow: 0 0 10px rgb(var(--accent-rgb) / 0.9);
  }

  .as-button {
    font: inherit;
    text-align: left;
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
  }

  .glyph svg {
    width: 21px;
    height: 21px;
  }

  .label {
    font-size: 0.84rem;
    font-weight: 550;
    opacity: 0;
    transition: opacity var(--transition-smooth) 30ms;
  }

  .rail:hover .label,
  .rail:focus-within .label {
    opacity: 1;
  }

  .rail-foot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid var(--well-border);
    box-shadow: var(--edge-lip);
    flex: none;
  }

  .me-chip {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 38px;
    padding: 0 7px;
    border-radius: var(--r-md);
    color: var(--text-dim);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: 50%;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--on-accent);
    text-shadow: var(--on-accent-shadow);
    object-fit: cover;
    background: var(--accent-gradient);
    border: 1px solid var(--accent-border);
    box-shadow:
      0 2px 5px rgba(0, 0, 0, 0.5),
      inset 0 2px 2px rgba(255, 255, 255, 0.55),
      inset 0 -2px 2px rgba(0, 0, 0, 0.35);
  }

  .me-name {
    opacity: 0;
    transition: opacity var(--transition-smooth) 30ms;
  }

  .rail:hover .me-name,
  .rail:focus-within .me-name {
    opacity: 1;
  }

  /* ---------------- phone: bottom bar ---------------- */

  @media (max-width: 720px) {
    .shell {
      display: block;
    }

    .shell-main {
      padding: 1.1rem 0.85rem 5rem;
    }

    .rail {
      position: fixed;
      inset: auto 0 0 0;
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      height: auto;
      width: auto;
      margin: 0;
      padding: 8px;
      flex-direction: row;
      align-items: center;
      border-radius: 12px 12px 0 0;
      gap: 4px;
    }

    .rail:hover,
    .rail:focus-within {
      width: auto;
    }

    .brand {
      height: 44px;
      padding: 0 7px;
    }

    .brand-text,
    .label,
    .me-name {
      display: none;
    }

    .nav {
      flex-direction: row;
      flex: 1;
    }

    .nav-item {
      height: 44px;
      justify-content: center;
      padding: 0 6px;
    }

    .nav-item.active::before {
      display: none;
    }

    .rail-foot {
      flex-direction: row;
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
      box-shadow: none;
    }

    .me-chip {
      padding: 0 2px;
    }

    .shell-column {
      max-width: 100%;
    }
  }

</style>
