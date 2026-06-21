import { readJsonFile, writeJsonFile } from './drive.js';

const OFFLINE_QUEUE_KEY = 'progress_offline_queue';
const DEBOUNCE_MS = 12000;

let progressFileId = null;
let pendingTimer = null;
let pendingWrite = null;

function loadQueue() {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function queueUpdate(bookId, entry) {
  const queue = loadQueue();
  const existing = queue[bookId];
  if (existing && existing.updatedAt > entry.updatedAt) return;
  queue[bookId] = entry;
  saveQueue(queue);
}

export function init(fileId) {
  progressFileId = fileId;
  window.addEventListener('online', () => flushQueue());
}

export function recordProgress(bookId, { positionSec, status }) {
  const entry = {
    positionSec,
    status,
    lastPlayedAt: new Date().toISOString(),
    updatedAt: Date.now(),
  };
  queueUpdate(bookId, entry);

  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => flushQueue(), DEBOUNCE_MS);
}

export function flushNow(bookId, data) {
  if (bookId && data) queueUpdate(bookId, { ...data, updatedAt: Date.now() });
  clearTimeout(pendingTimer);
  return flushQueue();
}

let flushing = false;

export async function flushQueue() {
  if (flushing) return;
  const queue = loadQueue();
  const bookIds = Object.keys(queue);
  if (bookIds.length === 0 || !navigator.onLine) return;

  flushing = true;
  try {
    const remote = await readJsonFile(progressFileId);
    for (const bookId of bookIds) {
      const local = queue[bookId];
      const remoteEntry = remote.progress[bookId];
      // Last-write-wins: only overwrite if our queued update is newer.
      if (!remoteEntry || local.updatedAt >= remoteEntry.updatedAt) {
        remote.progress[bookId] = local;
      }
    }
    await writeJsonFile(progressFileId, remote);
    saveQueue({});
  } catch (err) {
    console.error('Progress sync failed, will retry', err);
  } finally {
    flushing = false;
  }
}

export async function getProgress(bookId) {
  const queue = loadQueue();
  if (queue[bookId]) return queue[bookId];
  const remote = await readJsonFile(progressFileId);
  return remote.progress[bookId] || null;
}

export async function getAllProgress() {
  const remote = await readJsonFile(progressFileId);
  const queue = loadQueue();
  return { ...remote.progress, ...queue };
}
