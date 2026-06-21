import { initAuth, signIn, signOut, getAccessToken } from './auth.js';
import { getOrCreateAppFolder, getOrCreateJsonFile, readJsonFile } from './drive.js';

const statusEl = document.getElementById('status');
const authBtn = document.getElementById('auth-btn');

function setStatus(text) {
  statusEl.textContent = text;
}

async function bootstrapLibrary() {
  setStatus('Connecting to Drive...');
  const folderId = await getOrCreateAppFolder();
  setStatus(`Drive folder ready (id: ${folderId})\nChecking library.json / progress.json...`);

  const libraryId = await getOrCreateJsonFile(folderId, 'library.json', { version: 1, books: [] });
  const progressId = await getOrCreateJsonFile(folderId, 'progress.json', { version: 1, progress: {} });

  const library = await readJsonFile(libraryId);
  const progress = await readJsonFile(progressId);

  setStatus(
    `Connected.\nFolder: ${folderId}\nlibrary.json: ${libraryId} (${library.books.length} books)\n` +
    `progress.json: ${progressId} (${Object.keys(progress.progress).length} entries)`
  );
}

function updateAuthUI(token) {
  if (token) {
    authBtn.textContent = 'Sign out';
    bootstrapLibrary().catch((err) => setStatus(`Error: ${err.message}`));
  } else {
    authBtn.textContent = 'Sign in with Google';
    setStatus('Not signed in.');
  }
}

authBtn.addEventListener('click', () => {
  const token = getAccessToken();
  if (token) signOut();
  else signIn();
});

window.addEventListener('load', () => {
  initAuth({ onChange: updateAuthUI });
});
