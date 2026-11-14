const API_ROOT = '/api';

export const Session = {
  getToken: () => localStorage.getItem('supabase_token'),
  getProfile: () => {
    const raw = localStorage.getItem('collectium_profile');
    try { return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  },
  save: (token, profile) => {
    localStorage.setItem('supabase_token', token);
    localStorage.setItem('collectium_profile', JSON.stringify(profile));
  },
  clear: () => {
    localStorage.removeItem('supabase_token');
    localStorage.removeItem('collectium_profile');
  },
};

function authHeaders(isJson = true) {
  const headers = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  const token = Session.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function parseBody(res) {
  // Handle empty bodies (some 401s have none) without throwing
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
}

async function handleResponse(res) {
  const data = await parseBody(res);
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/**
 * Fetch wrapper: attaches auth headers, and if the token is expired,
 * clears the session and retries once as a guest.
 */
async function request(path, { method = 'GET', body, isJson = true, isFormData = false } = {}) {
  const doFetch = () => {
    const headers = isFormData
      ? (() => {
          const h = {};
          const token = Session.getToken();
          if (token) h['Authorization'] = `Bearer ${token}`;
          return h;
        })()
      : authHeaders(isJson);
    return fetch(`${API_ROOT}${path}`, { method, headers, body });
  };

  let res  = await doFetch();
  let data = await parseBody(res);

  const isJwtError =
    data?.code === 'JWT_EXPIRED' ||
    /jwt|token.*expired|expired.*token/i.test(data?.error || '');

  if (isJwtError && Session.getToken()) {
    // Backend might return 401 OR 500 — both mean "dead token". Drop it and retry as guest.
    Session.clear();
    res  = await doFetch();
    data = await parseBody(res);
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code   = data.code;
    throw err;
  }
  return data;
}

export const CollectiumAPI = {
  // ---- Auth ----
  signup: (username, email, password) =>
    fetch(`${API_ROOT}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    }).then(handleResponse),

  login: async (email, password) => {
    const data = await fetch(`${API_ROOT}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handleResponse);
    Session.save(data.session.access_token, data.profile);
    return data;
  },

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
      isFormData: true,
    });
  },

  updateItem: (itemId, payload) =>
    request(`/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  deleteItem: (itemId) =>
    request(`/items/${itemId}`, { method: 'DELETE' }),
};
