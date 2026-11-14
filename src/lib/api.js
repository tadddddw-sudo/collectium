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
  signup: (username, email, password) =>
    fetch(`${API_ROOT}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    }).then(handleResponse),

  login: (email, password) =>
    fetch(`${API_ROOT}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handleResponse),

  // ---- Profiles ----
  getProfile: (username) =>
    request(`/profiles/${encodeURIComponent(username)}`),

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
