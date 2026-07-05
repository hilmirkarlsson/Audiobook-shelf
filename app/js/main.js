import { initAuth, signIn, signOut, getAccessToken } from './auth.js';
import { getOrCreateAppFolder, getOrCreateJsonFile, readJsonFile, getFileStreamUrl } from './drive.js';
import { renderLibrary } from './library.js';
import { initPlayer, openPlayer, closePlayer, refreshSourceIfPlaying } from './player.js';
import * as sync from './sync.js';

const statusEl = document.getElementById('status');
const authBtn = document.getElementById('auth-btn');
const libraryView = document.getElementById('library-view');
const playerView = document.getElementById('player-view');
const backBtn = document.getElementById('back-btn');

const libraryState = { query: '', sortBy: 'recent', filter: 'all' };
let books = [];
let libraryFileId = null;

const playerEls = {
  cover: document.getElementById('player-cover'),
  backdrop: document.getElementById('player-backdrop'),
  title: document.getElementById('player-title'),
  author: document.getElementById('player-author'),
  scrubber: document.getElementById('scrubber'),
  currentTime: document.getElementById('current-time'),
  totalTime: document.getElementById('total-time'),
  playBtn: document.getElementById('play-btn'),
  skipBackBtn: document.getElementById('skip-back-btn'),
  skipForwardBtn: document.getElementById('skip-forward-btn'),
  speedSelect: document.getElementById('speed-select'),
  sleepSelect: document.getElementById('sleep-select'),
  sleepLabel: document.getElementById('sleep-label'),
  chapterList: document.getElementById('chapter-list'),
};
initPlayer(playerEls);

function setStatus(text) {
  statusEl.textContent = text;
}

function showLibrary() {
  closePlayer();
  playerView.classList.add('hidden');
  libraryView.classList.remove('hidden');
}

async function showPlayer(book) {
  libraryView.classList.add('hidden');
  playerView.classList.remove('hidden');
  const progress = await sync.getProgress(book.id);
  await openPlayer(book, progress);
}

backBtn.addEventListener('click', showLibrary);

async function refreshLibraryView() {
  const progressMap = await sync.getAllProgress();
  renderLibrary({
    container: libraryView,
    books,
    progressMap,
    state: libraryState,
    onSelect: showPlayer,
  });
}

async function bootstrapLibrary() {
  setStatus('Connecting to Drive...');
  const folderId = await getOrCreateAppFolder();

  libraryFileId = await getOrCreateJsonFile(folderId, 'library.json', { version: 1, books: [] });
  const progressFileId = await getOrCreateJsonFile(folderId, 'progress.json', { version: 1, progress: {} });
  sync.init(progressFileId);

  const library = await readJsonFile(libraryFileId);
  books = library.books.map((b) => ({
    ...b,
    coverUrl: b.coverFileId ? getFileStreamUrl(b.coverFileId) : null,
  }));

  setStatus('');
  await refreshLibraryView();
  libraryView.classList.remove('hidden');
}

function updateAuthUI(token) {
  if (token) {
    authBtn.textContent = 'Sign out';
    refreshSourceIfPlaying();
    bootstrapLibrary().catch((err) => setStatus(`Error: ${err.message}`));
  } else {
    authBtn.textContent = 'Sign in with Google';
    libraryView.classList.add('hidden');
    playerView.classList.add('hidden');
    setStatus('Not signed in.');
  }
}

authBtn.addEventListener('click', () => {
  const token = getAccessToken();
  if (token) signOut();
  else signIn();
});

window.addEventListener('load', () => {
  initAuth({
    onChange: updateAuthUI,
    onError: (err) => {
      authBtn.disabled = true;
      setStatus(`${err.message} (tap to retry)`);
      statusEl.style.cursor = 'pointer';
      statusEl.addEventListener('click', () => window.location.reload(), { once: true });
    },
  });
});
