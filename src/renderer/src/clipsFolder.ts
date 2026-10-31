import type { ShelfExport } from '../../common/types';
import { isShelfVideo, shelfPathKey } from './shelf';
import type { ShelfFile } from './shelf';
import mainApi from './mainApi';

const { readdir, readFile, stat } = window.require('fs/promises');
const { join } = window.require('path');

/**
 * The clips folder (Beta 6.1): the folder a game recorder saves to, linked once, whose newest clips the start screen
 * shows, so opening the latest one is a click instead of a trip through Explorer.
 */

/** How deep to look: the folder, its subfolders (NVIDIA keeps one per game), and theirs. */
const maxDepth = 2;

/** ClipPress's own size-limited exports by their default names ("19.8MB Quality …"); recorders' folders collect them too. */
export function isClipPressExportName(name: string) {
  return /^\d+(\.\d+)?MB (Max Quality|Quality|Fast|Original|Advanced) /i.test(name) || / clippress-export(-\d+)?\.mp4$/i.test(name);
}

/** The newest videos in a folder and the two levels under it, newest first, leaving out ClipPress's own exports. */
export async function listNewestClips(folder: string, { limit, exports, caseInsensitive }: { limit: number, exports: readonly ShelfExport[], caseInsensitive: boolean }) {
  const outputs = new Set(exports.flatMap((entry) => entry.outputs.map((output) => shelfPathKey(output, caseInsensitive))));
  const found: ShelfFile[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries: { name: string, isFile: () => boolean, isDirectory: () => boolean }[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      const path: string = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !entry.name.startsWith('.')) await walk(path, depth + 1);
        return;
      }
      if (!entry.isFile() || !isShelfVideo(entry.name) || isClipPressExportName(entry.name) || outputs.has(shelfPathKey(path, caseInsensitive))) return;
      try {
        const info = await stat(path);
        found.push({ path, name: entry.name, modifiedAt: info.mtimeMs, size: info.size });
      } catch {
        // Gone meanwhile.
      }
    }));
  };
  await walk(folder, 0);
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit);
}

/** NVIDIA's save folder from `reg query` output: `DefaultPathW` is UTF-16LE text stored as binary, ending in a NUL. */
export function parseNvidiaSaveFolder(regOutput: string) {
  const hex = /DefaultPathW\s+REG_BINARY\s+([\dA-Fa-f]+)/.exec(regOutput)?.[1];
  if (hex == null || hex.length % 2 !== 0) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const path = new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '');
  return path !== '' ? path : undefined;
}

/** An INI file's sections and keys (OBS's settings: a byte-order mark, `;` comments, keys as written). */
export function parseIni(text: string) {
  const sections: Record<string, Record<string, string>> = {};
  let section: Record<string, string> | undefined;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[(.+)]$/.exec(line);
    if (header != null) {
      section = {};
      sections[header[1]!] = section;
    } else if (section != null && line !== '' && !line.startsWith(';')) {
      const equals = line.indexOf('=');
      if (equals > 0) section[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
    }
  }
  return sections;
}

/**
 * Where OBS records, from the active profile's basic.ini: simple or advanced output, standard or FFmpeg recording.
 * Undefined when it was never changed (OBS then records into Videos). OBS writes its backslashes doubled.
 */
export function getObsRecordingFolder(basicIni: string) {
  const ini = parseIni(basicIni);
  const advanced = ini['Output']?.['Mode'] === 'Advanced';
  const path = advanced
    ? (ini['AdvOut']?.['RecType'] === 'FFmpeg' ? ini['AdvOut']?.['FFFilePath'] : ini['AdvOut']?.['RecFilePath'])
    : ini['SimpleOutput']?.['FilePath'];
  return path != null && path !== '' ? path.replaceAll('\\\\', '\\') : undefined;
}

const readText = async (path: string) => readFile(path, 'utf8').catch(() => undefined) as Promise<string | undefined>;

export interface RecorderFolder {
  /** Shown as is: "NVIDIA", "OBS". */
  recorder: string,
  path: string,
}

/** Where the recorders on this PC save (that exist and have a clip in them), the one with the newest clip first. */
export async function findRecorderFolders({ videosFolder, appDataFolder, exports, caseInsensitive }: {
  videosFolder: string,
  appDataFolder: string,
  exports: readonly ShelfExport[],
  caseInsensitive: boolean,
}) {
  const candidates: RecorderFolder[] = [];
  // NVIDIA App and GeForce Experience share this value; on some PCs the app also saves under Videos\NVIDIA.
  const nvidia = parseNvidiaSaveFolder(await mainApi.queryNvidiaCaptureSettings().catch(() => ''));
  if (nvidia != null) candidates.push({ recorder: 'NVIDIA', path: nvidia });
  candidates.push({ recorder: 'NVIDIA', path: join(videosFolder, 'NVIDIA') });
  // OBS: the active profile (user.ini from OBS 31, global.ini before), else Videos itself.
  const obsDir = join(appDataFolder, 'obs-studio');
  const obsSettings = (await readText(join(obsDir, 'user.ini'))) ?? (await readText(join(obsDir, 'global.ini')));
  if (obsSettings != null) {
    const profile = parseIni(obsSettings)['Basic']?.['ProfileDir'];
    const basicIni = profile != null ? await readText(join(obsDir, 'basic', 'profiles', profile, 'basic.ini')) : undefined;
    candidates.push({ recorder: 'OBS', path: (basicIni != null ? getObsRecordingFolder(basicIni) : undefined) ?? videosFolder });
  }
  candidates.push(
    { recorder: 'Xbox Game Bar', path: join(videosFolder, 'Captures') },
    { recorder: 'AMD', path: join(videosFolder, 'Radeon ReLive') },
  );

  const seen = new Set<string>();
  const withClips = await Promise.all(candidates.filter(({ path }) => {
    const key = shelfPathKey(path, caseInsensitive).replace(/\/+$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(async (candidate) => ({ candidate, newest: (await listNewestClips(candidate.path, { limit: 1, exports, caseInsensitive }))[0] })));
  return withClips
    .filter((entry): entry is { candidate: RecorderFolder, newest: ShelfFile } => entry.newest != null)
    .sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt)
    .map(({ candidate }) => candidate);
}
