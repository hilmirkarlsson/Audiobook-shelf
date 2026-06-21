#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
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

const execFileAsync = promisify(execFile);

async function decrypt(inputPath, outputPath, args) {
  const isAaxc = inputPath.toLowerCase().endsWith('.aaxc');
  const decryptArgs = isAaxc
    ? ['-audible_key', args.key, '-audible_iv', args.iv]
    : ['-activation_bytes', args['activation-bytes']];

  if (isAaxc && (!args.key || !args.iv)) {
    throw new Error('.aaxc files require --key and --iv (from your Audible voucher file).');
  }
  if (!isAaxc && !args['activation-bytes']) {
    throw new Error('.aax files require --activation-bytes. See ingest/README.md.');
  }

  await execFileAsync('ffmpeg', [
    ...decryptArgs,
    '-y',
    '-i', inputPath,
    '-c', 'copy',
    outputPath,
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('Usage: ingest-aax --input <dir> --activation-bytes <hex> --output <dir> [--key <hex> --iv <hex> for .aaxc]');
    process.exit(1);
  }

  fs.mkdirSync(args.output, { recursive: true });

  const files = fs.readdirSync(args.input).filter((f) => /\.aaxc?$/i.test(f));
  if (files.length === 0) {
    console.log('No .aax/.aaxc files found in', args.input);
    return;
  }

  console.log('Authenticating with Google Drive...');
  const drive = await getDriveClient();
  const folderId = await getOrCreateAppFolder(drive);
  const libraryFileId = await getOrCreateJsonFile(drive, folderId, 'library.json', { version: 1, books: [] });

  for (const file of files) {
    const inputPath = path.join(args.input, file);
    const baseName = path.parse(file).name;
    const m4bPath = path.join(args.output, `${baseName}.m4b`);
    const coverPath = path.join(args.output, `${baseName}.jpg`);

    console.log(`\nDecrypting ${file}...`);
    try {
      await decrypt(inputPath, m4bPath, args);
    } catch (err) {
      console.error(`  Failed to decrypt ${file}: ${err.message}`);
      continue;
    }

    console.log('  Reading metadata...');
    const meta = await probeMetadata(m4bPath);
    const hasCover = await extractCover(m4bPath, coverPath);

    const bookId = uuidv4();
    console.log('  Uploading audio to Drive...');
    const audioFileId = await uploadFile(drive, folderId, m4bPath, `${bookId}.m4b`, 'audio/mp4');

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
