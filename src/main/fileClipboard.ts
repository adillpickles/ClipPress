import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app, nativeImage, type WebContents } from 'electron';

import { isWindows } from './util.js';

const execFileAsync = promisify(execFile);

export const canCopyFiles = isWindows;

/**
 * Puts files on the clipboard the way Explorer's Copy does, so they paste into a chat or a folder. Electron's clipboard
 * can't hold files, so Windows PowerShell's Set-Clipboard does it. The paths go in an environment variable and the
 * command has no quotes in it, so nothing in a file name can change what runs.
 */
export async function copyFilesToClipboard(paths: string[]) {
  if (!canCopyFiles) throw new Error('Copying files is only supported on Windows');
  if (paths.length === 0) return;
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass',
    '-Command', 'Set-Clipboard -LiteralPath ($env:CLIPPRESS_CLIPBOARD_FILES -split [char]10)',
  ], {
    windowsHide: true,
    timeout: 15_000,
    env: { ...process.env, CLIPPRESS_CLIPBOARD_FILES: paths.join('\n') },
  });
}

/** Drags files out of the window (into a chat, a folder…), under a small picture of them. */
export async function startFileDrag(webContents: WebContents, paths: string[], iconDataUrl?: string | undefined) {
  const [first] = paths;
  if (first == null) return;
  const fromThumbnail = iconDataUrl != null ? nativeImage.createFromDataURL(iconDataUrl) : undefined;
  const icon = fromThumbnail != null && !fromThumbnail.isEmpty() ? fromThumbnail : await app.getFileIcon(first, { size: 'normal' });
  webContents.startDrag({ file: first, files: paths, icon });
}
