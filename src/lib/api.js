const API_ROOT = '/api';

/** Same-origin fetch; the session is an httpOnly cookie the browser attaches. */
function authHeaders(isJson = true) {
  return isJson ? { 'Content-Type': 'application/json' } : {};
}

async function parseBody(res) {
  // Handle empty bodies (some 401s have none) without throwing
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
}

function fail(res, data) {
  const err = new Error(data.error || `Request failed (${res.status})`);
  err.status = res.status;
  err.code = data.code;
  return err;
}

async function handleResponse(res) {
  const data = await parseBody(res);
  if (!res.ok) throw fail(res, data);
  return data;
}

/** Fetch wrapper: JSON by default, credentials always sent. */
async function request(path, { method = 'GET', body, isJson = true } = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: authHeaders(isJson),
    body,
    credentials: 'include',
  });
  return handleResponse(res);
}

export const CollectiumAPI = {
  // ---- Auth ----
  signup: (username, email, password, acceptedTerms) =>
    fetch(`${API_ROOT}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, accepted_terms: acceptedTerms === true }),
    }).then(handleResponse),

  forgotPassword: (email) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  /** `link` is `{ token_hash }` or `{ access_token, refresh_token }` from the reset email. */
  resetPassword: (password, link) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ ...link, password }),
    }),

  /** Whether "Continue with Google" is set up: `{ google }`. */
  getAuthProviders: () => request('/auth/providers'),

  /** A password (Supabase accounts) or `{ confirm_username }` (Auth0 accounts). */
  deleteAccount: (confirmation) =>
    request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify(typeof confirmation === 'string' ? { password: confirmation } : confirmation),
    }),

  resendConfirmation: (email) =>
    request('/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ email }) }),

  // ---- Profiles ----
  getProfile: (username) =>
    request(`/profiles/${encodeURIComponent(username)}`),

  /** `fields`: any of display_name, username, bio, featured_collection_ids. */
  updateMyProfile: (fields) =>
    request('/profiles/me', { method: 'PATCH', body: JSON.stringify(fields) }),

  /** kind: 'avatar' | 'banner' */
  uploadProfileImage: (kind, blob) => {
    const formData = new FormData();
    formData.append('image', blob, `${kind}.${blob.type === 'image/png' ? 'png' : 'jpg'}`);
    return request(`/profiles/me/${kind}`, { method: 'POST', body: formData, isJson: false });
  },

  removeProfileImage: (kind) => request(`/profiles/me/${kind}`, { method: 'DELETE' }),

  // ---- Collections ----
  getCollection: (id) =>
    request(`/collections/${encodeURIComponent(id)}`),

  createCollection: (payload) =>
    request('/collections', { method: 'POST', body: JSON.stringify(payload) }),

  updateCollection: (id, payload) =>
    request(`/collections/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  deleteCollection: (id) =>
    request(`/collections/${id}`, { method: 'DELETE' }),

  // ---- Items ----
  uploadItem: (collectionId, imageBlob, fields) => {
    const formData = new FormData();
    formData.append('image', imageBlob, 'collectible.png');
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        formData.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
      }
    });
    return request(`/collections/${collectionId}/items`, {
      method: 'POST',
      body: formData,
      isJson: false,
    });
  },

  updateItem: (itemId, payload) =>
    request(`/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  deleteItem: (itemId) =>
    request(`/items/${itemId}`, { method: 'DELETE' }),
};
