<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Logo from './Logo.svelte';
  import { userProfile } from '$lib/stores.js';
  import { CollectiumAPI } from '$lib/apiClient.js';

  /** Auth screens render as a bare, centered card (no rail, no column). */
  export let bare = false;

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
    await CollectiumAPI.logout();
    userProfile.set(null);
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
  </div>
{:else}
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <a class="brand" href="/" aria-label="Collectium home">
        <Logo size={30} />
        <span class="brand-text">
          <strong>Collectium</strong>
          <em>collector's vitrine</em>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.9l1.9 1.1M17.2 15l1.9 1.1M4.9 16.1l1.9-1.1M17.2 9l1.9-1.1" /></svg>
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
        {#if me}
          <div class="me-chip" title={`@${me.username}`}>
            <span class="avatar" aria-hidden="true">{(me.display_name || me.username || '?').slice(0, 1).toUpperCase()}</span>
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
      </div>
    </main>
  </div>
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
    background:
      linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 120px),
      linear-gradient(180deg, rgba(31, 40, 56, 0.97), rgba(15, 20, 30, 0.97));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow:
      var(--shadow-lift),
      inset 0px 1px 0px rgba(255, 255, 255, 0.4),
      inset 0px -1px 0px rgba(0, 0, 0, 0.6),
      inset -1px 0 0 rgba(0, 0, 0, 0.35);
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
    padding: 0 7px;
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
    color: #eafdff;
    border-color: rgba(0, 229, 255, 0.45);
    background:
      linear-gradient(to bottom, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 50%),
      linear-gradient(180deg, rgba(0, 229, 255, 0.28), rgba(0, 85, 255, 0.2));
    box-shadow:
      var(--shadow-near),
      0 0 12px rgba(0, 229, 255, 0.25),
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
    background: var(--accent-cyan);
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.9);
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
    border-top: 1px solid rgba(0, 0, 0, 0.55);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
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
    color: #fff;
    text-shadow: var(--text-glow);
    background: var(--accent-gradient);
    border: 1px solid #0033aa;
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
      padding: 0 5px;
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
