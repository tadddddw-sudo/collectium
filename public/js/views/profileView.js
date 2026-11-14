import { CollectiumAPI, Session } from '../api.js';
import { buildProfileUrl, renderQrToDataUrl } from '../qrHelper.js';

const params = new URLSearchParams(window.location.search);
const loggedInProfile = Session.getProfile();
const targetUsername = params.get('u') || loggedInProfile?.username;

if (!targetUsername) {
  window.location.href = 'login.html';
}

const isOwner = loggedInProfile && loggedInProfile.username === targetUsername;

async function initProfile() {
  try {
    const { profile, collections } = await CollectiumAPI.getProfile(targetUsername);
    document.getElementById('profile-name').textContent = profile.display_name || profile.username;
    document.getElementById('profile-handle').textContent = `@${profile.username}`;
    document.getElementById('profile-bio').textContent = profile.bio || 'Digital Collector on Collectium';

    // Show owner-only controls
    if (isOwner) {
      document.getElementById('owner-actions').style.display = 'flex';
    } else if (!loggedInProfile) {
      document.getElementById('guest-login-btn').style.display = 'inline-block';
    }

    // Master Profile QR Code Modal
    const profileUrl = buildProfileUrl(profile.username);
    document.getElementById('master-qr-btn').onclick = async () => {
      document.getElementById('qr-img').src = await renderQrToDataUrl(profileUrl);
      document.getElementById('qr-url-input').value = profileUrl;
      document.getElementById('qr-modal').style.display = 'flex';
    };

    const hydrated = await Promise.all(collections.map(async (col) => {
      if (col.collection_items?.length) return col;
      try {
        const res = await CollectiumAPI.getCollection(col.id);
        const items = res.items || res.collection_items || res.collection?.collection_items || [];
        return { ...col, collection_items: items };
      } catch {
        return col;
      }
    }));

    renderCollections(hydrated);
  } catch (err) {
    document.body.innerHTML = `<p style="padding:2rem;color:red;">${err.message}</p>`;
  }
}

function renderCollections(collections) {
  console.log('collections payload:', collections);
  collections.forEach((col) => console.log('one col:', col));

  const bindersGrid = document.getElementById('binders-grid');
  const casesGrid = document.getElementById('cases-grid');
  bindersGrid.innerHTML = '';
  casesGrid.innerHTML = '';

  collections.forEach((col) => {
    const card = document.createElement('div');
    card.className = 'collection-card';

    const items = col.collection_items || [];
    const previewImg = items
      .map((it) => it.image_url || it.image || it.img || it.thumbnail_url)
      .find(Boolean);

    const lc = col.layout_config || {};
    const badgeLabel = col.type === 'binder'
      ? `Binder (${lc.pages || 4}p · ${lc.rows || 3}x${lc.cols || 3})`
      : 'Display Case';

    card.innerHTML = `
      <div class="card-preview">
        ${previewImg
          ? `<img src="${previewImg}" alt="${col.title}" />`
          : `<span>${col.type === 'binder' ? '📖 Empty Binder' : '🏛️ Empty Case'}</span>`}
      </div>
      <div class="card-body">
        <span class="badge">${badgeLabel}</span>
        <h3>${col.title}</h3>
        <p>${items.length} items</p>
      </div>
    `;
    card.onclick = () => (window.location.href = `collection.html?id=${col.id}`);

    if (col.type === 'binder') bindersGrid.appendChild(card);
    else casesGrid.appendChild(card);
  });

  if (!bindersGrid.children.length) bindersGrid.innerHTML = '<p class="empty">No binders yet.</p>';
  if (!casesGrid.children.length) casesGrid.innerHTML = '<p class="empty">No display cases yet.</p>';
}

// Create New Collection Modal Logic
const typeSelect = document.getElementById('col-type');
typeSelect.addEventListener('change', () => {
  document.getElementById('binder-options').style.display =
    typeSelect.value === 'binder' ? 'block' : 'none';
});

document.getElementById('new-col-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = typeSelect.value;
  const title = document.getElementById('col-title').value.trim();
  const description = document.getElementById('col-desc').value.trim();

  const layout_config =
    type === 'binder'
      ? {
          pages: Number(document.getElementById('col-pages').value) || 4,
          rows: Number(document.getElementById('col-rows').value) || 3,
          cols: Number(document.getElementById('col-cols').value) || 3,
          show_grid: document.getElementById('col-grid').checked,
        }
      : { theme: 'glass_shelf' };

  const { collection } = await CollectiumAPI.createCollection({
    title,
    description,
    type,
    layout_config,
  });
  window.location.href = `collection.html?id=${collection.id}`;
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
  Session.clear();
  window.location.href = 'login.html';
});

initProfile();
