// File-system and ffprobe glue for originalRecycling.ts (kept apart so that module stays pure and testable).
import { readFileFfprobeMeta } from './ffmpeg';
import type { FileIdentity, OutputProbe } from './originalRecycling';

const { stat } = window.require('fs/promises');

export async function identifyFile(path: string): Promise<FileIdentity | undefined> {
  try {
    const st = await stat(path);
    return st.isFile() ? { size: st.size, mtimeMs: st.mtimeMs } : undefined;
  } catch {
    return undefined;
  }
}

export async function statOutput(path: string) {
  try {
    const st = await stat(path);
    return { size: st.size as number, isFile: st.isFile() as boolean };
  } catch {
    return undefined;
  }
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function probeOutput(path: string): Promise<OutputProbe> {
  const { format, streams } = await readFileFfprobeMeta(path);
  const duration = format.duration != null ? Number.parseFloat(format.duration) : Number.NaN;
  return {
    duration: Number.isFinite(duration) ? duration : undefined,
    streamCount: streams.filter((s) => s.codec_type === 'video' || s.codec_type === 'audio').length,
  };
}
