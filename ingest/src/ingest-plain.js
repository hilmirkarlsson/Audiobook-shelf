#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseArgs } from './cli-args.js';
import { probeMetadata, extractCover } from './metadata.js';
import { getDriveClient } from './drive-auth.js';
import {
  getOrCreateAppFolder,
  getOrCreateJsonFile,
  uploadFile,
  appendBookToLibrary,
} from './drive-upload.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('Usage: ingest-plain --input <dir> --output <dir>');
    process.exit(1);
  }

  fs.mkdirSync(args.output, { recursive: true });

  const files = fs.readdirSync(args.input).filter((f) => /\.(mp3|m4b|m4a)$/i.test(f));
  if (files.length === 0) {
    console.log('No .mp3/.m4b/.m4a files found in', args.input);
    return;
  }

  console.log('Authenticating with Google Drive...');
  const drive = await getDriveClient();
  const folderId = await getOrCreateAppFolder(drive);
  const libraryFileId = await getOrCreateJsonFile(drive, folderId, 'library.json', { version: 1, books: [] });

  for (const file of files) {
    const inputPath = path.join(args.input, file);
    const baseName = path.parse(file).name;
    const ext = path.extname(file).slice(1).toLowerCase();
    const coverPath = path.join(args.output, `${baseName}.jpg`);

    console.log(`\nProcessing ${file}...`);
    const meta = await probeMetadata(inputPath);
    const hasCover = await extractCover(inputPath, coverPath);

    const bookId = uuidv4();
    console.log('  Uploading audio to Drive...');
    const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    const audioFileId = await uploadFile(drive, folderId, inputPath, `${bookId}.${ext}`, mimeType);

    let coverFileId = null;
    if (hasCover) {
      console.log('  Uploading cover art...');
      coverFileId = await uploadFile(drive, folderId, coverPath, `${bookId}.jpg`, 'image/jpeg');
    }

    const bookEntry = {
      id: bookId,
      title: args.title || meta.title || baseName,
      author: args.author || meta.author || 'Unknown',
      narrator: args.narrator || meta.narrator || '',
      coverFileId,
      audioFileId,
      fileName: file,
      durationSec: meta.durationSec || 0,
      chapters: meta.chapters,
      addedAt: new Date().toISOString(),
    };

    console.log('  Appending to library.json...');
    await appendBookToLibrary(drive, libraryFileId, bookEntry);

    console.log(`  Done: "${bookEntry.title}" by ${bookEntry.author}`);
  }

  console.log('\nAll files processed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
