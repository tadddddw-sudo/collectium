<script>
  import { createEventDispatcher } from 'svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { handleAuthFailure } from '$lib/session.js';

  /** The owner's collections to choose from. */
  export let collections = [];
  /** Currently featured ids, in display order. */
  export let featuredIds = [];

  const MAX = 3;
  const dispatch = createEventDispatcher();

  // Keep the order in which boxes were ticked: that is the display order.
  let selected = featuredIds.filter((id) => collections.some((c) => c.id === id));
  let saving = false;
  let error = '';

  function toggle(id) {
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < MAX) selected = [...selected, id];
  }

  async function save() {
    error = '';
    saving = true;
    try {
      const data = await CollectiumAPI.updateMyProfile({ featured_collection_ids: selected });
      dispatch('saved', { profile: data.profile });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      error = err.message || 'Could not save your featured collections.';
    } finally {
      saving = false;
    }
  }

  function close() {
    if (!saving) dispatch('close');
  }
</script>

<div class="modal" role="presentation" on:click|self={close}>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="featured-title">
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>✕</button>
    <h2 class="modal-title" id="featured-title">Featured collections</h2>
    <p class="dim lead">
      Pick up to {MAX}. They're shown on your profile in the order you pick them. With none picked,
      your first {MAX} collections are shown.
    </p>

    {#if error}
      <p class="notice notice-error" role="alert">{error}</p>
    {/if}

    {#if collections.length}
      <ul class="choices">
        {#each collections as col (col.id)}
          {@const position = selected.indexOf(col.id)}
          <li>
            <label class="choice" class:on={position >= 0} class:locked={position < 0 && selected.length >= MAX}>
              <input
                type="checkbox"
                checked={position >= 0}
                disabled={position < 0 && selected.length >= MAX}
                on:change={() => toggle(col.id)}
              />
              <span class="title">{col.title}</span>
              <span class="kind dim">{col.type === 'binder' ? 'Binder' : 'Display case'}</span>
              {#if position >= 0}
                <span class="order mono" aria-label={`Position ${position + 1}`}>{position + 1}</span>
              {/if}
            </label>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty-note">Create a collection first.</p>
    {/if}

    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" on:click={() => (selected = [])} disabled={saving || !selected.length}>Clear</button>
      <button class="btn btn-ghost" type="button" on:click={close} disabled={saving}>Cancel</button>
      <button class="btn" type="button" on:click={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
</div>

<style>
  .lead {
    margin-bottom: 0.9rem;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .notice {
    margin-bottom: 0.8rem;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 50vh;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--r-sm);
    border: 1px solid var(--well-border);
    background: var(--well-bg);
    box-shadow: var(--shadow-carve), var(--edge-lip);
    cursor: pointer;
    font-size: 0.86rem;
  }

  .choice.on {
    border-color: var(--accent-line);
  }

  .choice.locked {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .choice input {
    accent-color: var(--accent);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kind {
    font-size: 0.74rem;
  }

  .order {
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--on-accent);
    background: var(--accent-gradient);
  }
</style>
