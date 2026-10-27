// Thin wrapper around fetch for the VaultKeep API.
// Owner and nominee sessions use separate tokens so the two portals never mix.

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const OWNER_TOKEN_KEY = 'vk_owner_token';
const NOMINEE_TOKEN_KEY = 'vk_nominee_token';

export const tokens = {
  getOwner: () => localStorage.getItem(OWNER_TOKEN_KEY),
  setOwner: (t) => localStorage.setItem(OWNER_TOKEN_KEY, t),
  clearOwner: () => localStorage.removeItem(OWNER_TOKEN_KEY),
  // Nominee sessions are short-lived (2h on the server) and kept per-tab only.
  getNominee: () => sessionStorage.getItem(NOMINEE_TOKEN_KEY),
  setNominee: (t) => sessionStorage.setItem(NOMINEE_TOKEN_KEY, t),
  clearNominee: () => sessionStorage.removeItem(NOMINEE_TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Called when an owner request comes back 401 so the app can drop the session.
let onOwnerUnauthorized = () => {};
export function setOwnerUnauthorizedHandler(fn) {
  onOwnerUnauthorized = fn;
}

async function request(path, { method = 'GET', body, token, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // browser sets the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('Cannot reach the VaultKeep server. Check that the API is running.', 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }

  if (raw) return res;
  return res.json();
}

function ownerRequest(path, opts = {}) {
  return request(path, { ...opts, token: tokens.getOwner() }).catch((err) => {
    if (err.status === 401) onOwnerUnauthorized(err.message);
    throw err;
  });
}

function nomineeRequest(path, opts = {}) {
  return request(path, { ...opts, token: tokens.getNominee() });
}

// Downloads go through fetch (not a plain link) because they need the
// Authorization header; the decrypted bytes are handed to the browser as a blob.
async function saveBlob(res, filename) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  // ---- Owner auth & account ----
  register: (data) => request('/api/auth/register', { method: 'POST', body: data }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => ownerRequest('/api/auth/me'),
  changePassword: (current_password, new_password) =>
    ownerRequest('/api/auth/change-password', {
      method: 'POST',
      body: { current_password, new_password },
    }),

  // ---- Check-ins ----
  checkIn: () => ownerRequest('/api/checkin', { method: 'POST' }),
  checkinStatus: () => ownerRequest('/api/checkin/status'),
  checkinHistory: () => ownerRequest('/api/checkin/history'),
  updateCheckinSettings: (settings) =>
    ownerRequest('/api/checkin/settings', { method: 'PATCH', body: settings }),

  // ---- Documents ----
  listDocuments: () => ownerRequest('/api/documents'),
  uploadDocument: (file, title, category) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('category', category);
    return ownerRequest('/api/documents/upload', { method: 'POST', body: form });
  },
  deleteDocument: (id) => ownerRequest(`/api/documents/${id}`, { method: 'DELETE' }),
  downloadDocument: async (id, filename) => {
    const res = await ownerRequest(`/api/documents/${id}/download`, { raw: true });
    await saveBlob(res, filename);
  },

  // ---- Nominees ----
  listNominees: () => ownerRequest('/api/nominees'),
  createNominee: (data) => ownerRequest('/api/nominees', { method: 'POST', body: data }),
  updateNominee: (id, data) => ownerRequest(`/api/nominees/${id}`, { method: 'PUT', body: data }),
  deleteNominee: (id) => ownerRequest(`/api/nominees/${id}`, { method: 'DELETE' }),
  setNomineeReleases: (id, document_ids) =>
    ownerRequest(`/api/nominees/${id}/releases`, { method: 'POST', body: { document_ids } }),

  // ---- Audit ----
  auditLog: (action) =>
    ownerRequest(`/api/audit?limit=100${action ? `&action=${encodeURIComponent(action)}` : ''}`),

  // ---- Nominee portal ----
  nomineeVerify: (email, access_code) =>
    request('/api/nominee-portal/verify-code', {
      method: 'POST',
      body: { email, access_code },
    }),
  nomineeDocuments: () => nomineeRequest('/api/nominee-portal/documents'),
  nomineeDownload: async (id, filename) => {
    const res = await nomineeRequest(`/api/nominee-portal/documents/${id}/download`, { raw: true });
    await saveBlob(res, filename);
  },
};
