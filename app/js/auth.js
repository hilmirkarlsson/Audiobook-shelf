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

// The Google Identity Services <script> tag loads with `async`, so on a slow
// connection it can still be in flight when initAuth runs; poll rather than
// assume `google` is already defined.
function waitForGoogleIdentity(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error('Google sign-in failed to load. Check your connection and reload.'));
      }
    }, 100);
  });
}

export async function initAuth({ onChange, onError }) {
  onAuthChange = onChange || onAuthChange;

  try {
    await waitForGoogleIdentity();
  } catch (err) {
    console.error(err);
    if (onError) onError(err);
    return;
  }

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
  if (!tokenClient) {
    console.error('signIn called before Google Identity Services finished loading');
    return;
  }
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
