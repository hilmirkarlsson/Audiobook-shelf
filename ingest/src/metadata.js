import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function probeMetadata(filePath, extraArgs = []) {
  const { stdout } = await execFileAsync('ffprobe', [
    ...extraArgs,
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_chapters',
    filePath,
  ]);
  const probe = JSON.parse(stdout);
  const tags = probe.format?.tags || {};

  const chapters = (probe.chapters || []).map((ch, i) => ({
    title: ch.tags?.title || `Chapter ${i + 1}`,
    startSec: parseFloat(ch.start_time),
  }));

  return {
    title: tags.title || tags.album || null,
    author: tags.artist || tags.album_artist || null,
    narrator: tags.composer || tags.narrator || null,
    durationSec: parseFloat(probe.format?.duration) || null,
    chapters,
  };
}

export async function extractCover(filePath, outPath, extraArgs = []) {
  try {
    await execFileAsync('ffmpeg', [
      ...extraArgs,
      '-y',
      '-i', filePath,
      '-an', '-vcodec', 'copy',
      outPath,
    ]);
    return true;
  } catch {
    return false; // not all files have embedded cover art
  }
}
