import { CONFIG } from './config.js';
import { getAccessToken, requestFreshToken } from './auth.js';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function authedFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token.accessToken}`,
    },
  });
  if (res.status === 401) {
    // Access token expired/revoked outside the normal refresh window.
    requestFreshToken();
    throw new Error('Drive auth expired, re-authenticating');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }
  return res;
}

let cachedFolderId = null;

export async function getOrCreateAppFolder() {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(
    `name='${CONFIG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const listRes = await authedFetch(`${API_BASE}/files?q=${q}&fields=files(id,name)`);
  const { files } = await listRes.json();
  if (files && files.length > 0) {
    cachedFolderId = files[0].id;
    return cachedFolderId;
  }

  const createRes = await authedFetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CONFIG.DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await createRes.json();
  cachedFolderId = folder.id;
  return cachedFolderId;
}

async function findFileInFolder(folderId, name) {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const res = await authedFetch(`${API_BASE}/files?q=${q}&fields=files(id,name)`);
  const { files } = await res.json();
  return files && files.length > 0 ? files[0] : null;
}

export async function getOrCreateJsonFile(folderId, name, defaultContent) {
  const existing = await findFileInFolder(folderId, name);
  if (existing) return existing.id;

  const metadata = { name, parents: [folderId], mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(defaultContent, null, 2)], { type: 'application/json' }));

  const res = await authedFetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body: form,
  });
  const file = await res.json();
  return file.id;
}

export async function readJsonFile(fileId) {
  const res = await authedFetch(`${API_BASE}/files/${fileId}?alt=media`);
  return res.json();
}

export async function writeJsonFile(fileId, data) {
  await authedFetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function uploadFile(folderId, name, blob, mimeType) {
  const metadata = { name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob.slice(0, blob.size, mimeType));

  const res = await authedFetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body: form,
  });
  const file = await res.json();
  return file.id;
}

export async function downloadFile(fileId) {
  const res = await authedFetch(`${API_BASE}/files/${fileId}?alt=media`);
  return res.blob();
}

export function getFileStreamUrl(fileId) {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in to Drive');
  return `${API_BASE}/files/${fileId}?alt=media&access_token=${token.accessToken}`;
}
