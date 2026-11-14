<script>
  import { createEventDispatcher } from 'svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { handleAuthFailure } from '$lib/session.js';

  /** The normalized collection from routes/collection/+page.svelte. */
  export let collection;

  const dispatch = createEventDispatcher();
  const clampInt = (v, a, b) => Math.min(b, Math.max(a, parseInt(v, 10) || a));

  const isBinder = collection.type === 'binder';

  let title = collection.title;
  let description = collection.subtitle || '';
  let isPublic = collection.isPublic;
  let pages = collection.layout.pages;
  let rows = collection.layout.rows;
  let cols = collection.layout.cols;
  let showGrid = collection.layout.showGrid;

  let saving = false;
  let error = '';

  let confirmingDelete = false;
  let deleteText = '';
  let deleting = false;

  $: itemCount = collection.items.length;
  $: newTotal = clampInt(pages, 1, 50) * clampInt(rows, 1, 8) * clampInt(cols, 1, 8);
  $: hiddenAfter = isBinder
    ? collection.items.filter((it) => it.slot != null && it.slot >= newTotal).length
    : 0;

  async function save(event) {
    event.preventDefault();
    error = '';
    if (!title.trim()) {
      error = 'Give the collection a name.';
      return;
    }

    const fields = {
      title: title.trim(),
      description: description.trim(),
      is_public: isPublic,
    };
    if (isBinder) {
      fields.layout_config = {
        pages: clampInt(pages, 1, 50),
        rows: clampInt(rows, 1, 8),
        cols: clampInt(cols, 1, 8),
        show_grid: showGrid,
      };
    }

    saving = true;
    try {
      await CollectiumAPI.updateCollection(collection.id, fields);
      dispatch('saved', { hidden: hiddenAfter });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      error = err.message || 'Could not save the collection.';
    } finally {
      saving = false;
    }
  }

  async function remove() {
    error = '';
    deleting = true;
    try {
      await CollectiumAPI.deleteCollection(collection.id);
      dispatch('deleted');
    } catch (err) {
      deleting = false;
      if (handleAuthFailure(err)) return;
      error = err.message || 'Could not delete the collection.';
    }
  }

  function close() {
    if (!saving && !deleting) dispatch('close');
  }
</script>

<div class="modal" role="presentation" on:click|self={close}>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="col-edit-title">
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>✕</button>
    <h2 class="modal-title" id="col-edit-title">Edit {isBinder ? 'binder' : 'display case'}</h2>

    <form on:submit={save}>
      {#if error}
        <p class="notice notice-error" role="alert">{error}</p>
      {/if}

      <div class="field">
        <label for="ce-title">Name</label>
        <input class="input" id="ce-title" required maxlength="120" bind:value={title} />
      </div>

      <div class="field">
        <label for="ce-desc">Description</label>
        <textarea class="input" id="ce-desc" rows="3" maxlength="2000" placeholder="Optional" bind:value={description}></textarea>
      </div>

      {#if isBinder}
        <div class="field-row">
          <div class="field">
            <label for="ce-pages">Pages</label>
            <input class="input" id="ce-pages" type="number" min="1" max="50" bind:value={pages} />
          </div>
          <div class="field">
            <label for="ce-rows">Rows</label>
            <input class="input" id="ce-rows" type="number" min="1" max="8" bind:value={rows} />
          </div>
          <div class="field">
            <label for="ce-cols">Columns</label>
            <input class="input" id="ce-cols" type="number" min="1" max="8" bind:value={cols} />
          </div>
        </div>
        <label class="check-row">
          <input type="checkbox" bind:checked={showGrid} />
          Show pocket grid lines
        </label>
        {#if hiddenAfter}
          <p class="notice notice-info layout-note" role="status">
            {hiddenAfter} {hiddenAfter === 1 ? 'item falls' : 'items fall'} outside this layout and
            will be hidden until you make it bigger again. Nothing is deleted.
          </p>
        {/if}
      {/if}

      <label class="check-row visibility">
        <input type="checkbox" bind:checked={isPublic} />
        Public: anyone with the link can see it
      </label>

      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" on:click={close} disabled={saving}>Cancel</button>
        <button class="btn" type="submit" disabled={saving || deleting}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>

    <div class="danger-zone">
      <h3>Delete {isBinder ? 'binder' : 'display case'}</h3>
      {#if !confirmingDelete}
        <p class="dim">Removes the collection and its {itemCount} {itemCount === 1 ? 'item' : 'items'}. This can't be undone.</p>
        <button class="btn btn-danger btn-sm" type="button" on:click={() => (confirmingDelete = true)}>
          Delete…
        </button>
      {:else}
        <label class="field-label" for="ce-confirm">Type the name <strong>{collection.title}</strong> to confirm</label>
        <input class="input" id="ce-confirm" autocomplete="off" bind:value={deleteText} />
        <div class="cluster confirm-actions">
          <button
            class="btn btn-danger btn-sm"
            type="button"
            disabled={deleting || deleteText.trim() !== collection.title.trim()}
            on:click={remove}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button class="btn btn-ghost btn-sm" type="button" disabled={deleting} on:click={() => { confirmingDelete = false; deleteText = ''; }}>
            Cancel
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  form .notice {
    margin-bottom: 0.8rem;
  }

  textarea.input {
    resize: vertical;
    line-height: 1.5;
  }

  .layout-note {
    margin-top: 0.7rem;
  }

  .visibility {
    margin-top: 0.9rem;
  }

  .danger-zone {
    margin-top: 1.4rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .danger-zone h3 {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 0.3rem;
  }

  .danger-zone p {
    margin-bottom: 0.7rem;
    font-size: 0.8rem;
  }

  .danger-zone .input {
    margin: 0.4rem 0 0.6rem;
  }
</style>
