import { getFileStreamUrl } from './drive.js';
import * as sync from './sync.js';

const SKIP_BACK_SEC = 15;
const SKIP_FORWARD_SEC = 30;
const PROGRESS_TICK_MS = 5000; // local UI/progress-queue tick; actual Drive flush is debounced separately in sync.js

let audio = null;
let currentBook = null;
let sleepTimerHandle = null;
let sleepTimerEndAt = null;
let progressTickHandle = null;
let els = null;

function formatTime(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function currentStatus() {
  if (!currentBook) return 'not-started';
  const pct = audio.currentTime / (audio.duration || currentBook.durationSec || 1);
  if (pct >= 0.98) return 'finished';
  if (audio.currentTime > 0) return 'in-progress';
  return 'not-started';
}

function persistProgress() {
  if (!currentBook) return;
  sync.recordProgress(currentBook.id, {
    positionSec: audio.currentTime,
    status: currentStatus(),
  });
}

function updateMediaSessionPosition() {
  if (!('mediaSession' in navigator) || !Number.isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  } catch (_) {
    // setPositionState throws if duration/position are momentarily inconsistent during seeks.
  }
}

function setupMediaSession(book) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: book.title,
    artist: book.author,
    album: book.narrator || '',
    artwork: book.coverUrl ? [{ src: book.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
  });

  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekbackward', (d) => skip(-(d.seekOffset || SKIP_BACK_SEC)));
  navigator.mediaSession.setActionHandler('seekforward', (d) => skip(d.seekOffset || SKIP_FORWARD_SEC));
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    audio.currentTime = d.seekTime;
    updateMediaSessionPosition();
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => jumpChapter(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => jumpChapter(1));
}

function skip(deltaSec) {
  audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + deltaSec));
  updateMediaSessionPosition();
}

function currentChapterIndex() {
  if (!currentBook?.chapters?.length) return -1;
  const chapters = currentBook.chapters;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (audio.currentTime >= chapters[i].startSec) return i;
  }
  return 0;
}

function jumpChapter(direction) {
  if (!currentBook?.chapters?.length) return;
  const idx = currentChapterIndex();
  const target = Math.max(0, Math.min(currentBook.chapters.length - 1, idx + direction));
  audio.currentTime = currentBook.chapters[target].startSec;
}

function renderChapters() {
  els.chapterList.innerHTML = '';
  if (!currentBook?.chapters?.length) {
    els.chapterList.classList.add('hidden');
    return;
  }
  els.chapterList.classList.remove('hidden');
  currentBook.chapters.forEach((ch, i) => {
    const item = document.createElement('button');
    item.className = 'chapter-item';
    item.textContent = ch.title;
    item.addEventListener('click', () => {
      audio.currentTime = ch.startSec;
    });
    els.chapterList.appendChild(item);
  });
}

function highlightActiveChapter() {
  if (!currentBook?.chapters?.length) return;
  const idx = currentChapterIndex();
  [...els.chapterList.children].forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
}

function updateScrubber() {
  if (!Number.isFinite(audio.duration)) return;
  els.scrubber.max = audio.duration;
  els.scrubber.value = audio.currentTime;
  els.currentTime.textContent = formatTime(audio.currentTime);
  els.totalTime.textContent = formatTime(audio.duration);
}

function setSleepTimer(minutes) {
  clearTimeout(sleepTimerHandle);
  if (!minutes) {
    sleepTimerEndAt = null;
    els.sleepLabel.textContent = 'Off';
    return;
  }
  sleepTimerEndAt = Date.now() + minutes * 60000;
  els.sleepLabel.textContent = `${minutes}m`;
  sleepTimerHandle = setTimeout(() => {
    audio.pause();
    sleepTimerEndAt = null;
    els.sleepLabel.textContent = 'Off';
  }, minutes * 60000);
}

export function initPlayer(elements) {
  els = elements;
  audio = new Audio();
  audio.preload = 'auto';

  audio.addEventListener('loadedmetadata', () => {
    updateScrubber();
    updateMediaSessionPosition();
  });
  audio.addEventListener('timeupdate', () => {
    updateScrubber();
    updateMediaSessionPosition();
    highlightActiveChapter();
  });
  audio.addEventListener('play', () => {
    els.playBtn.textContent = '⏸';
  });
  audio.addEventListener('pause', () => {
    els.playBtn.textContent = '▶';
    persistProgress();
    sync.flushNow();
  });
  audio.addEventListener('ended', () => {
    if (currentBook) {
      sync.recordProgress(currentBook.id, { positionSec: audio.duration, status: 'finished' });
      sync.flushNow();
    }
  });

  els.playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play();
    else audio.pause();
  });
  els.skipBackBtn.addEventListener('click', () => skip(-SKIP_BACK_SEC));
  els.skipForwardBtn.addEventListener('click', () => skip(SKIP_FORWARD_SEC));
  els.scrubber.addEventListener('input', () => {
    audio.currentTime = Number(els.scrubber.value);
  });
  els.speedSelect.addEventListener('change', () => {
    audio.playbackRate = Number(els.speedSelect.value);
  });
  els.sleepSelect.addEventListener('change', () => {
    const val = Number(els.sleepSelect.value);
    setSleepTimer(val || null);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistProgress();
      sync.flushNow();
    }
  });
  window.addEventListener('beforeunload', () => {
    persistProgress();
    sync.flushNow();
  });

  progressTickHandle = setInterval(() => {
    if (!audio.paused) persistProgress();
  }, PROGRESS_TICK_MS);
}

export async function openPlayer(book, progressEntry) {
  currentBook = book;
  audio.pause();
  audio.src = getFileStreamUrl(book.audioFileId);
  audio.playbackRate = Number(els.speedSelect.value) || 1;

  const resumeAt = progressEntry?.positionSec || 0;
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = resumeAt;
  }, { once: true });

  els.title.textContent = book.title;
  els.author.textContent = book.author;
  els.cover.style.backgroundImage = book.coverUrl ? `url(${book.coverUrl})` : '';

  renderChapters();
  setupMediaSession(book);
  setSleepTimer(null);
  els.sleepSelect.value = '0';

  await audio.play().catch(() => {
    // Autoplay can be blocked; user can tap play manually.
  });
}

// Drive stream URLs carry the access token as a query param, which expires
// after ~1hr; call this once a fresh token is available (see main.js) to
// reload the same position without interrupting a long-running book.
export function refreshSourceIfPlaying() {
  if (!currentBook) return;
  const wasPlaying = !audio.paused;
  const resumeAt = audio.currentTime;
  audio.src = getFileStreamUrl(currentBook.audioFileId);
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = resumeAt;
    if (wasPlaying) audio.play().catch(() => {});
  }, { once: true });
}

export function closePlayer() {
  if (!currentBook) return;
  persistProgress();
  sync.flushNow();
  audio.pause();
  currentBook = null;
}
