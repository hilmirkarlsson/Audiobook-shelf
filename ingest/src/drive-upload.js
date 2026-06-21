import fs from 'fs';
import { Readable } from 'stream';

const FOLDER_NAME = 'Audiobook Shelf';

export async function getOrCreateAppFolder(drive) {
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const { data } = await drive.files.list({ q, fields: 'files(id,name)' });
  if (data.files.length > 0) return data.files[0].id;

  const { data: folder } = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.id;
}

async function findFile(drive, folderId, name) {
  const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
  const { data } = await drive.files.list({ q, fields: 'files(id,name)' });
  return data.files[0] || null;
}

export async function getOrCreateJsonFile(drive, folderId, name, defaultContent) {
  const existing = await findFile(drive, folderId, name);
  if (existing) return existing.id;

  const { data } = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: 'application/json', body: JSON.stringify(defaultContent, null, 2) },
    fields: 'id',
  });
  return data.id;
}

export async function readJsonFile(drive, fileId) {
  const { data } = await drive.files.get({ fileId, alt: 'media' });
  return data;
}

export async function writeJsonFile(drive, fileId, content) {
  await drive.files.update({
    fileId,
    media: { mimeType: 'application/json', body: JSON.stringify(content, null, 2) },
  });
}

export async function uploadFile(drive, folderId, filePath, name, mimeType) {
  const { data } = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id',
  });
  return data.id;
}

export async function appendBookToLibrary(drive, libraryFileId, bookEntry) {
  const library = await readJsonFile(drive, libraryFileId);
  library.books.push(bookEntry);
  await writeJsonFile(drive, libraryFileId, library);
}
