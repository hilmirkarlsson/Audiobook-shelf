import { CONFIG } from './config.js';

const TOKEN_STORAGE_KEY = 'gdrive_token';

let tokenClient = null;
let onAuthChange = () => {};

function loadStoredToken() {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  const token = JSON.parse(raw);
  if (token.expiresAt <= Date.now()) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
  return token;
}

function storeToken(tokenResponse) {
  const token = {
    accessToken: tokenResponse.access_token,
    // Google access tokens last 1hr; refresh a bit early.
    expiresAt: Date.now() + (tokenResponse.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  return token;
}

export function initAuth({ onChange }) {
  onAuthChange = onChange || onAuthChange;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.DRIVE_SCOPE,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('OAuth error', tokenResponse);
        onAuthChange(null);
        return;
      }
      const token = storeToken(tokenResponse);
      onAuthChange(token);
    },
  });

  const existing = loadStoredToken();
  if (existing) onAuthChange(existing);
}

export function signIn() {
  // 'consent' only needed first time; '' lets Google skip the prompt on repeat visits.
  tokenClient.requestAccessToken({ prompt: '' });
}

export function signOut() {
  const token = loadStoredToken();
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  if (token) {
    google.accounts.oauth2.revoke(token.accessToken, () => {});
  }
  onAuthChange(null);
}

export function getAccessToken() {
  return loadStoredToken();
}

// Called when a Drive API call gets a 401: token expired/revoked unexpectedly.
export function requestFreshToken() {
  tokenClient.requestAccessToken({ prompt: '' });
}
