<script>
  import { createEventDispatcher } from 'svelte';
  import { CollectiumAPI } from '$lib/apiClient.js';
  import { handleAuthFailure } from '$lib/session.js';
  import { compressImage } from '$lib/imageTools.js';

  /** The profile being edited (always the signed-in user's own). */
  export let profile;

  const dispatch = createEventDispatcher();

  const BIO_MAX = 500;
  const NAME_MAX = 50;

  let displayName = profile.display_name || '';
  let username = profile.username;
  let bio = profile.bio || '';

  let saving = false;
  let error = '';
  let imageBusy = ''; // 'avatar' | 'banner' while uploading
  let imageError = '';

  // Latest copy from the server, so picture changes show up straight away.
  let current = profile;

  $: handleChanged = username.trim() !== profile.username;
  $: handleValid = /^[A-Za-z0-9_.-]{3,30}$/.test(username.trim());

  async function save(event) {
    event.preventDefault();
    error = '';
    if (!handleValid) {
      error = 'Handle must be 3–30 characters: letters, numbers, dots, dashes or underscores.';
      return;
    }

    const fields = {};
    if (displayName.trim() !== (profile.display_name || '')) fields.display_name = displayName.trim();
    if (handleChanged) fields.username = username.trim();
    if (bio.trim() !== (profile.bio || '')) fields.bio = bio.trim();

    if (!Object.keys(fields).length) {
      dispatch('saved', { profile: current });
      return;
    }

    saving = true;
    try {
      const data = await CollectiumAPI.updateMyProfile(fields);
      dispatch('saved', { profile: data.profile });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      error = err.message || 'Could not save your profile.';
    } finally {
      saving = false;
    }
  }

  async function pickImage(kind, event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    imageError = '';
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      imageError = 'Choose a PNG, JPEG or WebP image.';
      return;
    }
    imageBusy = kind;
    try {
      // Avatars are shown small; banners span the column. Keeps uploads well under 5 MB.
      const blob = await compressImage(file, kind === 'avatar' ? 512 : 1600);
      const data = await CollectiumAPI.uploadProfileImage(kind, blob);
      current = data.profile;
      dispatch('imageChanged', { profile: data.profile });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      imageError = err.message || 'Could not upload the image.';
    } finally {
      imageBusy = '';
    }
  }

  async function removeImage(kind) {
    imageError = '';
    imageBusy = kind;
    try {
      const data = await CollectiumAPI.removeProfileImage(kind);
      current = data.profile;
      dispatch('imageChanged', { profile: data.profile });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      imageError = err.message || 'Could not remove the image.';
    } finally {
      imageBusy = '';
    }
  }

  function close() {
    if (!saving) dispatch('close');
  }
</script>

<div class="modal" role="presentation" on:click|self={close}>
  <div class="modal-box modal-box-wide" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
    <button class="modal-close" type="button" aria-label="Close" on:click={close}>✕</button>
    <h2 class="modal-title" id="profile-edit-title">Edit profile</h2>

    <section class="pictures">
      <div class="banner-preview" class:has-image={current.banner_url}>
        {#if current.banner_url}
          <img src={current.banner_url} alt="Current banner" />
        {/if}
        <div class="avatar-preview">
          {#if current.avatar_url}
            <img src={current.avatar_url} alt="Current profile picture" />
          {:else}
            <span aria-hidden="true">{(current.display_name || current.username || '?').slice(0, 1).toUpperCase()}</span>
          {/if}
        </div>
      </div>

      <div class="picture-actions">
        <div class="picture-group">
          <span class="field-label">Profile picture</span>
          <div class="cluster">
            <label class="btn btn-ghost btn-sm file-btn" class:disabled={imageBusy}>
              {imageBusy === 'avatar' ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!imageBusy} on:change={(e) => pickImage('avatar', e)} />
            </label>
            {#if current.avatar_url}
              <button class="btn btn-ghost btn-sm" type="button" disabled={!!imageBusy} on:click={() => removeImage('avatar')}>Remove</button>
            {/if}
          </div>
        </div>
        <div class="picture-group">
          <span class="field-label">Banner</span>
          <div class="cluster">
            <label class="btn btn-ghost btn-sm file-btn" class:disabled={imageBusy}>
              {imageBusy === 'banner' ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!imageBusy} on:change={(e) => pickImage('banner', e)} />
            </label>
            {#if current.banner_url}
              <button class="btn btn-ghost btn-sm" type="button" disabled={!!imageBusy} on:click={() => removeImage('banner')}>Remove</button>
            {/if}
          </div>
        </div>
      </div>
      <p class="hint dim">Pictures are public and save as soon as you pick them. A wide image (about 3:1) works best for the banner.</p>
      {#if imageError}
        <p class="notice notice-error" role="alert">{imageError}</p>
      {/if}
    </section>

    <form on:submit={save}>
      {#if error}
        <p class="notice notice-error" role="alert">{error}</p>
      {/if}

      <div class="field">
        <label for="pe-name">Display name</label>
        <input class="input" id="pe-name" maxlength={NAME_MAX} placeholder={profile.username} bind:value={displayName} />
      </div>

      <div class="field">
        <label for="pe-handle">Handle</label>
        <div class="handle-row">
          <span class="at mono" aria-hidden="true">@</span>
          <input
            class="input mono"
            id="pe-handle"
            required
            minlength="3"
            maxlength="30"
            pattern="[A-Za-z0-9_.\-]+"
            autocomplete="username"
            spellcheck="false"
            bind:value={username}
          />
        </div>
        {#if handleChanged}
          <p class="hint warn">Links and QR codes you've already shared with @{profile.username} will stop working.</p>
        {/if}
      </div>

      <div class="field">
        <label for="pe-bio">Biography</label>
        <textarea
          class="input"
          id="pe-bio"
          rows="5"
          maxlength={BIO_MAX}
          placeholder="What do you collect? Where did it start?"
          bind:value={bio}
        ></textarea>
        <span class="counter mono" class:near={bio.length > BIO_MAX - 40}>{bio.length} / {BIO_MAX}</span>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" on:click={close} disabled={saving}>Cancel</button>
        <button class="btn" type="submit" disabled={saving || !handleValid}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .pictures {
    margin-bottom: 1.2rem;
  }

  .banner-preview {
    position: relative;
    height: 110px;
    margin-bottom: 2.4rem;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--banner-bg);
    box-shadow: var(--shadow-near), var(--edge-spec);
  }

  .banner-preview > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }

  .avatar-preview {
    position: absolute;
    left: 1rem;
    bottom: -2rem;
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--on-accent);
    background: var(--accent-gradient);
    border: 1px solid var(--accent-border);
    box-shadow: var(--shadow-near), 0 0 0 4px var(--bg-panel-solid);
  }

  .avatar-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .picture-actions {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .picture-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* The file input sits invisibly inside the button so the label opens the picker. */
  .file-btn {
    position: relative;
    overflow: hidden;
  }

  .file-btn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .file-btn.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .hint {
    margin-top: 0.5rem;
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .hint.warn {
    color: var(--accent);
  }

  .pictures .notice {
    margin-top: 0.6rem;
  }

  form .notice {
    margin-bottom: 0.8rem;
  }

  .handle-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .at {
    color: var(--text-dim);
  }

  textarea.input {
    resize: vertical;
    min-height: 6rem;
    line-height: 1.5;
  }

  .counter {
    align-self: flex-end;
    font-size: 0.7rem;
    color: var(--text-dim);
  }

  .counter.near {
    color: var(--accent);
  }
</style>
