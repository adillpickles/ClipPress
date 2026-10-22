import type { ShelfExport, ShelfOrder } from '../../common/types';

/** A video in the shelf's folder. */
export interface ShelfFile {
  path: string,
  name: string,
  /** Milliseconds since the epoch: when the recording was last written, which survives copying. */
  modifiedAt: number,
  size: number,
}

export interface ShelfItem {
  file: ShelfFile,
  exported: boolean,
}

/** Exports remembered for the shelf: enough for months of clips, small enough to stay a short list. */
export const maxShelfExports = 300;
const maxOutputsPerExport = 20;

const videoExtensions = new Set(['3gp', 'avi', 'flv', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'mxf', 'ogv', 'ts', 'webm', 'wmv']);

export function isShelfVideo(fileName: string) {
  if (fileName.startsWith('.')) return false;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 && videoExtensions.has(fileName.slice(dot + 1).toLowerCase());
}

/** The same file, allowing for Windows paths being case-insensitive and either slash. */
export function shelfPathKey(path: string, caseInsensitive: boolean) {
  const slashes = path.replaceAll('\\', '/');
  return caseInsensitive ? slashes.toLowerCase() : slashes;
}

/** Notes an export: its source sinks to the bottom of the shelf, and its outputs aren't offered as clips. */
export function rememberShelfExport(list: readonly ShelfExport[], { source, outputs, exportedAt }: ShelfExport, caseInsensitive: boolean): ShelfExport[] {
  const key = shelfPathKey(source, caseInsensitive);
  const previous = list.find((entry) => shelfPathKey(entry.source, caseInsensitive) === key);
  const allOutputs = [...outputs, ...(previous?.outputs ?? [])];
  const uniqueOutputs = allOutputs.filter((output, index) => allOutputs.findIndex((other) => shelfPathKey(other, caseInsensitive) === shelfPathKey(output, caseInsensitive)) === index);
  return [
    { source, outputs: uniqueOutputs.slice(0, maxOutputsPerExport), exportedAt },
    ...list.filter((entry) => shelfPathKey(entry.source, caseInsensitive) !== key),
  ].slice(0, maxShelfExports);
}

const compareNames = (a: ShelfFile, b: ShelfFile) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The shelf's order: clips still to do first (oldest recording first, or by name), then the ones already
 * exported. ClipPress's own exports are left out.
 */
export function buildShelfQueue(files: readonly ShelfFile[], { order, exports, caseInsensitive }: {
  order: ShelfOrder,
  exports: readonly ShelfExport[],
  caseInsensitive: boolean,
}): ShelfItem[] {
  const exportedSources = new Set(exports.map((entry) => shelfPathKey(entry.source, caseInsensitive)));
  const outputs = new Set(exports.flatMap((entry) => entry.outputs.map((output) => shelfPathKey(output, caseInsensitive))));
  const compare = order === 'name' ? compareNames : (a: ShelfFile, b: ShelfFile) => (a.modifiedAt - b.modifiedAt) || compareNames(a, b);
  const items = files
    .filter((file) => !outputs.has(shelfPathKey(file.path, caseInsensitive)))
    .sort(compare)
    .map((file) => ({ file, exported: exportedSources.has(shelfPathKey(file.path, caseInsensitive)) }));
  return [...items.filter((item) => !item.exported), ...items.filter((item) => item.exported)];
}

/** The clip to edit after the current one: the next one not yet exported, wrapping round to the top. */
export function pickNextClip(queue: readonly ShelfItem[], currentPath: string | undefined, caseInsensitive: boolean) {
  const currentKey = currentPath != null ? shelfPathKey(currentPath, caseInsensitive) : undefined;
  const index = queue.findIndex((item) => shelfPathKey(item.file.path, caseInsensitive) === currentKey);
  const isCandidate = (item: ShelfItem) => !item.exported && shelfPathKey(item.file.path, caseInsensitive) !== currentKey;
  if (index === -1) return queue.find((item) => isCandidate(item))?.file;
  return (queue.slice(index + 1).find((item) => isCandidate(item)) ?? queue.slice(0, index).find((item) => isCandidate(item)))?.file;
}
