import { execFile, spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app, nativeImage, type WebContents } from 'electron';

import { isWindows } from './util.js';

const execFileAsync = promisify(execFile);

export const canCopyFiles = isWindows;

const powerShellArgs = ['-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass'];
const copyTimeoutMs = 15_000;
/** The helper goes a minute after it was last used or asked for (it holds ~70 MB while it runs). */
const helperIdleMs = 60_000;
/**
 * The helper's loop: one line in per copy, the paths as base64 of UTF-8 text (one per line), one line out ("ok" or
 * "error"). The paths are only ever data, never part of what runs.
 */
const helperScript = '$in = [Console]::In; while (($line = $in.ReadLine()) -ne $null) { try { Set-Clipboard -LiteralPath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)) -split [char]10); [Console]::Out.WriteLine("ok") } catch { [Console]::Out.WriteLine("error") } }';

/**
 * Puts files on the clipboard the way Explorer's Copy does, in a Windows PowerShell started for this one copy. The
 * paths go in an environment variable and the command has no quotes in it, so nothing in a file name can change what
 * runs.
 */
async function copyOnce(paths: string[]) {
  await execFileAsync('powershell.exe', [
    ...powerShellArgs,
    '-Command', 'Set-Clipboard -LiteralPath ($env:CLIPPRESS_CLIPBOARD_FILES -split [char]10)',
  ], {
    windowsHide: true,
    timeout: copyTimeoutMs,
    env: { ...process.env, CLIPPRESS_CLIPBOARD_FILES: paths.join('\n') },
  });
}

interface Helper {
  child: ChildProcessWithoutNullStreams,
  /** Each copy sent waits for its answer, in order. */
  waiting: ((ok: boolean) => void)[],
  output: string,
  idleTimer?: NodeJS.Timeout,
}

let helper: Helper | undefined;

function stopHelper(stopping: Helper) {
  clearTimeout(stopping.idleTimer);
  if (helper === stopping) helper = undefined;
  stopping.waiting.splice(0).forEach((answer) => answer(false));
  stopping.child.stdin.end();
  stopping.child.kill();
}

function startHelper() {
  const child = spawn('powershell.exe', [...powerShellArgs, '-Command', helperScript], {
    windowsHide: true,
    env: { ...process.env, CLIPPRESS_CLIPBOARD_HELPER: '1' },
  });
  const started: Helper = { child, waiting: [], output: '' };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    started.output += chunk;
    for (let end = started.output.indexOf('\n'); end !== -1; end = started.output.indexOf('\n')) {
      const line = started.output.slice(0, end).trim();
      started.output = started.output.slice(end + 1);
      started.waiting.shift()?.(line === 'ok');
    }
  });
  child.stderr.resume();
  // A helper that couldn't start or has gone: its copies fail over to a one-off copy.
  child.on('error', () => stopHelper(started));
  child.on('exit', () => stopHelper(started));
  child.stdin.on('error', () => stopHelper(started));
  return started;
}

/**
 * Starts the copy helper ahead of time (an export is under way), so a copy then takes no time: starting Windows
 * PowerShell for each copy made it wait (~0.25 s warm, a second or two cold).
 */
export function warmCopyHelper() {
  if (!canCopyFiles) return;
  helper ??= startHelper();
  const warm = helper;
  clearTimeout(warm.idleTimer);
  warm.idleTimer = setTimeout(() => {
    if (warm.waiting.length === 0) stopHelper(warm);
  }, helperIdleMs);
  warm.idleTimer.unref();
}

function copyWithHelper(paths: string[]) {
  warmCopyHelper();
  const current = helper;
  if (current == null) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      // An answer that never comes would put every later one out of step: this helper is done.
      stopHelper(current);
      resolve(false);
    }, copyTimeoutMs);
    current.waiting.push((ok) => {
      clearTimeout(timeout);
      resolve(ok);
    });
    current.child.stdin.write(`${Buffer.from(paths.join('\n'), 'utf8').toString('base64')}\n`);
  });
}

/** Puts files on the clipboard the way Explorer's Copy does, so they paste into a chat or a folder. */
export async function copyFilesToClipboard(paths: string[]) {
  if (!canCopyFiles) throw new Error('Copying files is only supported on Windows');
  if (paths.length === 0) return;
  // Electron's clipboard can't hold files, so Windows PowerShell's Set-Clipboard does it.
  if (await copyWithHelper(paths)) return;
  // Once more the plain way, which also says why it failed.
  await copyOnce(paths);
}

/** Drags files out of the window (into a chat, a folder…), under a small picture of them. */
export async function startFileDrag(webContents: WebContents, paths: string[], iconDataUrl?: string | undefined) {
  const [first] = paths;
  if (first == null) return;
  const fromThumbnail = iconDataUrl != null ? nativeImage.createFromDataURL(iconDataUrl) : undefined;
  const icon = fromThumbnail != null && !fromThumbnail.isEmpty() ? fromThumbnail : await app.getFileIcon(first, { size: 'normal' });
  webContents.startDrag({ file: first, files: paths, icon });
}
