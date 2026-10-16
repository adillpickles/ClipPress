/* eslint-disable no-console */
// Installs ClipPress with its real installer and updates it twice through the app's own updater,
// in a disposable GitHub-hosted Windows VM (.github/workflows/installer-upgrade-test.yml):
//
//   A (installed) --Automatic--> B --Ask--> C, which then still finds a newer release.
//
// It checks what users rely on: settings and projects survive, an edit made right before closing
// is saved, a close cancelled after a failed save installs nothing, the installed version really
// changes, the app does not reopen by itself, each next launch works, and uninstalling keeps
// settings. Only the network location of the update feed differs from production: the installed
// app-update.yml points GitHub's provider at a local server with GitHub's URL layout.
//
// THIS INSTALLS AND UNINSTALLS SOFTWARE FOR THE CURRENT WINDOWS USER. It refuses to run anywhere
// but a disposable GitHub-hosted runner.
//
// Usage: node script/installerUpgradeTest.ts <folder with one electron-builder output per version> <results folder>
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, openSync, closeSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import timers from 'node:timers/promises';
import { promisify } from 'node:util';
import JSON5 from 'json5';
import semver from 'semver';

const [buildsArg, resultsArg] = process.argv.slice(2);
assert(buildsArg && resultsArg, 'Usage: node script/installerUpgradeTest.ts <builds folder> <results folder>');

if (process.platform !== 'win32' || process.env['GITHUB_ACTIONS'] !== 'true' || process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted' || process.env['CLIPPRESS_DISPOSABLE_VM'] !== '1') {
  throw new Error('Refusing to run: this test installs, updates and uninstalls ClipPress for the current Windows user. It only runs in a disposable GitHub-hosted runner (see .github/workflows/installer-upgrade-test.yml).');
}

const execFileAsync = promisify(execFile);
const buildsDir = resolve(buildsArg);
const resultsDir = resolve(resultsArg);
const localAppData = process.env['LOCALAPPDATA']!;
const appData = process.env['APPDATA']!;
// electron-builder derives the registry key from the appId (com.clippress.app).
const registryKey = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\341fb3cc-c236-5b3a-8f1c-823c4ffa4f5d`;
const installDir = join(localAppData, 'Programs', 'clippress');
const exePath = join(installDir, 'ClipPress.exe');
const settingsDir = join(appData, 'ClipPress');
const settingsPath = join(settingsDir, 'config.json');
const mediaDir = join(process.env['USERPROFILE']!, 'ClipPressUpgradeTest');
const mediaPath = join(mediaDir, 'clip.mp4');
const projectPath = join(mediaDir, 'clip-proj.llc');
const feedPort = 8934;
const owner = 'adillpickles';
const repo = 'ClipPress';
const sizeLimitMarker = 37;

const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));

interface StepResult { name: string, ok: boolean, details?: unknown, error?: string, ms: number }
const steps: StepResult[] = [];
const feedRequests: { time: string, path: string, range?: string | undefined }[] = [];

async function step<T>(name: string, fn: () => Promise<T>) {
  const started = Date.now();
  console.log(`\n=== ${name}`);
  try {
    const details = await fn();
    steps.push({ name, ok: true, details, ms: Date.now() - started });
    console.log(`PASS ${name}`, details ?? '');
    return details;
  } catch (err) {
    steps.push({ name, ok: false, error: err instanceof Error ? err.stack ?? err.message : String(err), ms: Date.now() - started });
    console.error(`FAIL ${name}`, err);
    throw err;
  }
}

async function waitFor<T>(what: string, check: () => Promise<T | undefined | false>, timeoutMs: number, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const value = await check();
      if (value !== undefined && value !== false) return value;
    } catch (err) {
      lastError = err;
    }
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`, { cause: lastError });
    // eslint-disable-next-line no-await-in-loop
    await timers.setTimeout(intervalMs);
  }
}

const sha256 = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');

async function powershell(command: string) {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
  return stdout.trim();
}

async function registryVersion() {
  try {
    const { stdout } = await execFileAsync('reg', ['query', registryKey, '/v', 'DisplayVersion'], { windowsHide: true });
    return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(stdout)?.[1];
  } catch {
    return undefined;
  }
}

/** Installer and uninstaller processes, including the copies NSIS runs from temporary folders. */
async function installerProcesses() {
  const out = await powershell(String.raw`Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(ClipPress-Setup|old-uninstaller|Au_|Un_)' -or $_.Name -eq 'Uninstall ClipPress.exe' } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`);
  return out === '' ? [] : out.split(/\r?\n/);
}

async function appProcesses() {
  const out = await powershell(String.raw`Get-CimInstance Win32_Process -Filter "Name = 'ClipPress.exe'" | ForEach-Object { "$($_.ProcessId) $($_.ExecutablePath)" }`);
  return out === '' ? [] : out.split(/\r?\n/);
}

async function readSettings() {
  return JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
}

async function projectSegments() {
  const project = JSON5.parse(await readFile(projectPath, 'utf8')) as { cutSegments: unknown[] };
  return project.cutSegments.length;
}

// --- Builds -------------------------------------------------------------------------------------

interface Build { version: string, dir: string, installer: string, installerName: string, appAsarSha256: string }

async function findBuilds(): Promise<Build[]> {
  const versions = (await readdir(buildsDir)).filter((name) => semver.valid(name) != null).sort(semver.compare);
  assert(versions.length >= 3, `Expected three builds in ${buildsDir}, found ${versions.join(', ')}`);
  return Promise.all(versions.map(async (version) => {
    const dir = join(buildsDir, version);
    const installerName = `ClipPress-Setup-${version}.exe`;
    const metadata = await readFile(join(dir, 'latest.yml'), 'utf8');
    assert.match(metadata, new RegExp(`^version: ${version.replaceAll('.', String.raw`\.`)}$`, 'm'));
    assert.ok(metadata.includes(`url: ${installerName}`));
    return { version, dir, installer: join(dir, installerName), installerName, appAsarSha256: await sha256(join(dir, 'win-unpacked', 'resources', 'app.asar')) };
  }));
}

// --- A local update feed with GitHub's URL layout ------------------------------------------------

/** Releases in the feed, newest first. A build listed under another version is served as that version. */
let feedReleases: { version: string, build: Build }[] = [];

function atomFeed() {
  const entries = feedReleases.map(({ version }) => `
  <entry>
    <id>tag:github.com,2008:Repository/1/v${version}</id>
    <updated>2026-10-16T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/${owner}/${repo}/releases/tag/v${version}"/>
    <title>ClipPress v${version}</title>
    <content type="html">&lt;p&gt;Installer upgrade test&lt;/p&gt;</content>
    <author><name>${owner}</name></author>
  </entry>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <id>tag:github.com,2008:https://github.com/${owner}/${repo}/releases</id>
  <title>Release notes from ${repo}</title>
  <updated>2026-10-16T00:00:00Z</updated>${entries}
</feed>`;
}

async function startFeed() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${feedPort}`);
    const path = decodeURIComponent(url.pathname);
    feedRequests.push({ time: new Date().toISOString(), path, range: request.headers.range });
    const send = (status: number, body = '') => { response.writeHead(status); response.end(body); };
    if (path === `/${owner}/${repo}/releases.atom`) {
      response.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
      response.end(atomFeed());
      return;
    }
    const match = new RegExp(`^/${owner}/${repo}/releases/download/v([^/]+)/([^/]+)$`).exec(path);
    const release = match != null ? feedReleases.find(({ version }) => version === match[1]) : undefined;
    // Like production releases: no beta.yml, so the provider falls back to latest.yml.
    if (match == null || release == null) { send(404); return; }
    const name = match[2]!;
    const { build, version } = release;
    if (name === 'latest.yml') {
      readFile(join(build.dir, 'latest.yml'), 'utf8').then((text) => {
        response.setHeader('Content-Type', 'text/yaml');
        response.end(version === build.version ? text : text.replaceAll(build.version, version));
      }, () => send(500));
      return;
    }
    const fileName = version === build.version ? name : name.replaceAll(version, build.version);
    if (![build.installerName, `${build.installerName}.blockmap`].includes(fileName)) { send(404); return; }
    const filePath = join(build.dir, fileName);
    stat(filePath).then(({ size }) => {
      response.setHeader('Accept-Ranges', 'bytes');
      // Single ranges, as GitHub serves them (used by differential downloads).
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
      if (range != null) {
        const start = Number(range[1]);
        const end = range[2] !== '' ? Math.min(Number(range[2]), size - 1) : size - 1;
        response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        createReadStream(filePath, { start, end }).pipe(response);
        return;
      }
      response.writeHead(200, { 'Content-Length': size });
      createReadStream(filePath).pipe(response);
    }, () => send(500));
  });
  await new Promise<void>((resolveListen) => { server.listen(feedPort, '127.0.0.1', resolveListen); });
  return server;
}

/** Points the installed app's GitHub provider at the local feed (an update replaces this file). */
async function useLocalFeed() {
  await writeFile(join(installDir, 'resources', 'app-update.yml'), [
    `owner: ${owner}`,
    `repo: ${repo}`,
    'provider: github',
    `host: 127.0.0.1:${feedPort}`,
    'protocol: http',
    'updaterCacheDirName: clippress-updater',
    '',
  ].join('\n'));
}

const downloadsOf = (version: string) => feedRequests.filter(({ path }) => path.includes(`/download/v${version}/`) && path.endsWith('.exe'));

// --- Driving the installed app -------------------------------------------------------------------

interface CdpMessage { id?: number, result?: Record<string, unknown>, error?: { message: string } }

let instanceCount = 0;

async function launchApp(exe: string, { settingsJson }: { settingsJson?: Record<string, unknown> } = {}) {
  instanceCount += 1;
  const apiPort = 8180 + instanceCount;
  const cdpPort = 9330 + instanceCount;
  const logPath = join(resultsDir, `app-${instanceCount}.log`);
  const logFd = openSync(logPath, 'a');
  const child: ChildProcess = spawn(exe, [
    '--http-api', String(apiPort),
    `--remote-debugging-port=${cdpPort}`,
    '--disable-features=CalculateNativeWinOcclusion',
    ...(settingsJson != null ? ['--settings-json', JSON.stringify(settingsJson)] : []),
  ], { stdio: ['ignore', logFd, logFd], env: childEnv });
  closeSync(logFd);
  let exit: { code: number | null, at: number } | undefined;
  const exited = new Promise<{ code: number | null, at: number }>((resolveExit) => {
    child.on('exit', (code) => { exit = { code, at: Date.now() }; resolveExit(exit); });
  });

  const target = await waitFor('the editor page', async () => {
    if (exit != null) throw new Error(`The app exited with ${exit.code} before its page appeared`);
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(2000) })).json() as { type: string, url: string, webSocketDebuggerUrl: string }[];
    return list.find(({ type, url }) => type === 'page' && url.includes('/renderer/index.html'));
  }, 90_000);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { ws.addEventListener('open', resolveOpen, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let lastId = 0;
  const pending = new Map<number, (message: CdpMessage) => void>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id != null) { pending.get(message.id)?.(message); pending.delete(message.id); }
  });
  ws.addEventListener('close', () => { for (const answer of pending.values()) answer({ error: { message: 'The page closed' } }); pending.clear(); });

  const send = async (method: string, params: Record<string, unknown> = {}) => {
    lastId += 1;
    const id = lastId;
    const response = await Promise.race([
      new Promise<CdpMessage>((resolveSend) => { pending.set(id, resolveSend); ws.send(JSON.stringify({ id, method, params })); }),
      timers.setTimeout(30_000, undefined, { ref: false }).then(() => { throw new Error(`${method} timed out`); }),
    ]);
    if (response.error) throw new Error(`${method}: ${response.error.message}`);
    return response.result ?? {};
  };
  const evaluate = async <T = unknown>(expression: string) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result['exceptionDetails'] != null) throw new Error(`${expression} threw: ${JSON.stringify(result['exceptionDetails'])}`);
    return (result['result'] as { value?: T }).value as T;
  };
  /** Runs without waiting: the page may be busy or gone by the time it would answer. */
  const fire = (expression: string) => { lastId += 1; ws.send(JSON.stringify({ id: lastId, method: 'Runtime.evaluate', params: { expression: `setTimeout(() => { ${expression} }, 0); 0` } })); };
  const action = async (name: string, args: unknown[] = []) => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/action/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `action ${name}: ${response.status}`);
  };
  const updateStatus = () => evaluate<{ supported: boolean, reason?: string, phase: string, version?: string, installOnQuit: boolean }>('window.electron.getUpdateStatus()');
  const dialogText = () => evaluate<string>(String.raw`[...document.querySelectorAll('.swal2-container, [role="dialog"]')].map((d) => d.innerText.trim()).join('\n---\n')`);
  const clickDialogButton = (text: string) => evaluate<boolean>(`(() => { const b = [...document.querySelectorAll('.swal2-container button')].find((x) => x.offsetParent != null && x.innerText.trim() === ${JSON.stringify(text)}); if (b == null) return false; b.click(); return true; })()`);
  /** Closes the window the way Alt+F4 or the taskbar does: WM_CLOSE from outside the app. */
  const closeWindow = async () => {
    const result = await powershell(String.raw`Add-Type -Namespace ClipPressTest -Name User32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);'
$h = (Get-Process -Id ${child.pid}).MainWindowHandle
if ($h -eq 0) { 'no-window' } else { [ClipPressTest.User32]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }`);
    assert.equal(result, 'True', `Could not post WM_CLOSE: ${result}`);
  };
  const waitExit = async (timeoutMs: number) => Promise.race([exited, timers.setTimeout(timeoutMs, undefined, { ref: false }).then(() => undefined)]);
  const screenshot = async (name: string) => {
    try {
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
      await writeFile(join(resultsDir, `${name}.jpeg`), Buffer.from(shot['data'] as string, 'base64'));
    } catch (err) {
      console.warn('Screenshot failed', err);
    }
  };
  const kill = () => { if (exit == null) child.kill(); };

  await send('Runtime.enable');
  await waitFor('the editor to render', () => evaluate<boolean>('document.getElementById(\'app-root\') != null && document.querySelector(\'[class*="dropzone"]\') != null && window.electron != null'), 60_000);
  // Release notes may open on the first launch of a version: close them like a user would.
  if ((await dialogText()) !== '') {
    for (const type of ['keyDown', 'keyUp']) {
      // eslint-disable-next-line no-await-in-loop
      await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    await timers.setTimeout(1000);
  }
  return { child, evaluate, fire, action, updateStatus, dialogText, clickDialogButton, closeWindow, waitExit, screenshot, kill, get exit() { return exit; } };
}

type App = Awaited<ReturnType<typeof launchApp>>;

async function openClip(app: App) {
  await app.action('openFiles', [mediaPath]);
  await waitFor('the clip to load', () => app.evaluate<boolean>('(() => { const v = document.querySelector(\'video\'); return v != null && v.duration > 7 && v.readyState >= 2; })()'), 60_000);
  // Let the opened project settle (it is not written when only opened).
  await timers.setTimeout(1500);
}

async function waitForInstalled(build: Build) {
  return waitFor(`version ${build.version} to be installed`, async () => {
    if ((await registryVersion()) !== build.version) return undefined;
    if ((await installerProcesses()).length > 0) return undefined;
    if (!existsSync(join(installDir, 'resources', 'app.asar'))) return undefined;
    return { appAsarMatches: (await sha256(join(installDir, 'resources', 'app.asar'))) === build.appAsarSha256 };
  }, 300_000, 2000);
}

async function assertNotRunning() {
  // The installer must not start the app after a silent update.
  await timers.setTimeout(5000);
  assert.deepEqual(await appProcesses(), [], 'ClipPress is running though nobody started it');
}

// --- The test ------------------------------------------------------------------------------------

async function main() {
  await mkdir(resultsDir, { recursive: true });
  let feed: Server | undefined;
  let app: App | undefined;
  try {
    const [a, b, c] = await step('Find three consecutive versioned builds', async () => {
      const builds = await findBuilds();
      return builds.slice(-3);
    }) as Build[];
    assert(a && b && c);
    const d = semver.inc(c.version, 'prerelease')!;
    console.log('Versions:', a.version, b.version, c.version, `(and ${d} as feed metadata only)`);

    await step('Start from a machine without ClipPress', async () => {
      assert.equal(await registryVersion(), undefined, 'ClipPress is already installed: not a fresh VM');
      assert.equal(existsSync(installDir), false);
      assert.equal(existsSync(settingsDir), false);
    });

    feed = await startFeed();

    await step(`Install ${a.version} with its installer`, async () => {
      const code = await new Promise<number | null>((resolveExit, reject) => {
        const child = spawn(a.installer, ['/S'], { stdio: 'ignore', env: childEnv });
        child.on('error', reject);
        child.on('exit', resolveExit);
      });
      assert.equal(code, 0);
      const installed = await waitForInstalled(a);
      assert.ok(installed.appAsarMatches, 'Installed files are not the built ones');
      assert.ok(existsSync(join(installDir, 'resources', 'clippress-installed')), 'Installer marker missing');
      await assertNotRunning();
      return installed;
    });

    await step('Prepare a clip, settings next to the executable, and the local feed', async () => {
      await mkdir(mediaDir, { recursive: true });
      await execFileAsync(resolve('ffmpeg/win32-x64/lib/ffmpeg.exe'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=8:size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mediaPath]);
      // A user who put settings next to the installed executable, as the portable build allows.
      await writeFile(join(installDir, 'config.json'), JSON.stringify({ sizeLimitMb: sizeLimitMarker, updateMode: 'automatic', enableUpdateCheck: true, storeProjectInWorkingDir: false, enableAskForFileOpenAction: false, askBeforeClose: false }));
      await useLocalFeed();
      feedReleases = [{ version: b.version, build: b }, { version: a.version, build: a }];
    });

    const segmentsBefore = await step(`Automatic: ${a.version} imports the settings, downloads ${b.version}, and saves an edit made right before closing`, async () => {
      app = await launchApp(exePath);
      assert.equal(await app.evaluate('window.require(\'@electron/remote\').app.getVersion()'), a.version);
      // Settings moved out of the installation folder before the first update could delete them.
      assert.equal((await readSettings())['sizeLimitMb'], sizeLimitMarker);
      assert.equal(existsSync(join(installDir, 'config.json')), false);
      assert.ok((await readdir(settingsDir)).some((name) => name.startsWith('config.json.imported-')));
      const initial = await app.updateStatus();
      assert.equal(initial.supported, true, `Updates unsupported: ${initial.reason}`);

      await openClip(app);
      await app.action('addSegment');
      await timers.setTimeout(2000);
      const saved = await projectSegments();

      const ready = await waitFor('the update to be downloaded', async () => {
        const status = await app!.updateStatus();
        assert.notEqual(status.phase, 'error', 'The update failed');
        return status.phase === 'ready' ? status : undefined;
      }, 180_000, 1000);
      assert.equal(ready.version, b.version);
      assert.equal(ready.installOnQuit, true);
      assert.ok(downloadsOf(b.version).length > 0);

      // An edit, then at once the window's close button (well within the autosave delay).
      await app.action('addSegment');
      app.fire('window.require(\'@electron/remote\').getCurrentWindow().close()');
      const exit = await app.waitExit(60_000);
      assert.ok(exit != null, 'The app did not close');
      assert.equal(exit.code, 0);
      return { savedSegments: saved, differentialRequests: feedRequests.filter(({ range }) => range != null).length };
    }) as { savedSegments: number };

    await step(`Automatic: closing installed ${b.version}, kept the edit and settings, and did not reopen the app`, async () => {
      const installed = await waitForInstalled(b);
      assert.ok(installed.appAsarMatches, 'Installed files are not the new version');
      assert.ok(existsSync(join(installDir, 'resources', 'clippress-installed')));
      await assertNotRunning();
      assert.equal(await projectSegments(), segmentsBefore.savedSegments + 1, 'The edit made right before closing was lost');
      assert.equal((await readSettings())['sizeLimitMb'], sizeLimitMarker);
      // The update replaced the installation folder; nothing of the settings was left in it.
      assert.deepEqual((await readdir(installDir)).filter((name) => name.startsWith('config.json')), []);
    });

    await step(`Ask: ${b.version} launches, finds ${c.version}, and downloads nothing before approval`, async () => {
      await useLocalFeed();
      feedReleases = [{ version: c.version, build: c }, { version: b.version, build: b }, { version: a.version, build: a }];
      app = await launchApp(exePath, { settingsJson: { updateMode: 'ask' } });
      assert.equal(await app.evaluate('window.require(\'@electron/remote\').app.getVersion()'), b.version);
      assert.equal((await app.updateStatus()).supported, true);
      const available = await waitFor('the update to be found', async () => {
        const status = await app!.updateStatus();
        return status.phase === 'available' ? status : undefined;
      }, 120_000, 1000);
      assert.equal(available.version, c.version);
      await timers.setTimeout(5000);
      assert.equal((await app.updateStatus()).phase, 'available');
      assert.deepEqual(downloadsOf(c.version), [], 'Ask mode downloaded before approval');
      assert.equal(existsSync(join(localAppData, 'clippress-updater', 'pending', c.installerName)), false);

      // The user approves (the notice's Download update button).
      await app.evaluate('void window.electron.downloadUpdate()');
      const ready = await waitFor('the approved update to be downloaded', async () => {
        const status = await app!.updateStatus();
        return status.phase === 'ready' ? status : undefined;
      }, 180_000, 1000);
      assert.equal(ready.version, c.version);
      assert.equal(ready.installOnQuit, true);
    });

    await step('Ask: a close cancelled after a failed save keeps the app open and installs nothing', async () => {
      assert(app);
      await openClip(app);
      // A project file that cannot be replaced, as on a full or read-only disk.
      await execFileAsync('attrib', ['+R', projectPath]);
      await app.action('addSegment');
      await app.closeWindow();
      const text = await waitFor('the failed-save dialog', async () => {
        const dialog = await app!.dialogText();
        return dialog.includes('could not be saved') ? dialog : undefined;
      }, 30_000);
      await app.screenshot('failed-save-dialog');
      assert.ok(await app.clickDialogButton('Cancel'));
      await timers.setTimeout(8000);
      assert.equal(app.exit, undefined, 'The app closed although the close was cancelled');
      assert.equal(await registryVersion(), b.version);
      assert.deepEqual(await installerProcesses(), []);
      assert.equal(await projectSegments(), segmentsBefore.savedSegments + 1);
      return { dialog: text };
    });

    await step(`Ask: once saving works again, closing saves the edit and installs ${c.version}`, async () => {
      assert(app);
      await execFileAsync('attrib', ['-R', projectPath]);
      await app.closeWindow();
      const exit = await app.waitExit(60_000);
      assert.ok(exit != null, 'The app did not close');
      assert.equal(exit.code, 0);
      const installed = await waitForInstalled(c);
      assert.ok(installed.appAsarMatches);
      await assertNotRunning();
      assert.equal(await projectSegments(), segmentsBefore.savedSegments + 2, 'The edit was not saved');
    });

    await step(`${c.version} launches with settings and project intact, and still finds a newer release (${d})`, async () => {
      await useLocalFeed();
      // Metadata for a further release; it is never downloaded in Ask mode.
      feedReleases = [{ version: d, build: c }, { version: c.version, build: c }, { version: b.version, build: b }];
      app = await launchApp(exePath);
      assert.equal(await app.evaluate('window.require(\'@electron/remote\').app.getVersion()'), c.version);
      const settings = await readSettings();
      assert.equal(settings['sizeLimitMb'], sizeLimitMarker);
      assert.equal(settings['updateMode'], 'ask');
      assert.equal(await projectSegments(), segmentsBefore.savedSegments + 2);
      const available = await waitFor('a newer release to be found', async () => {
        const status = await app!.updateStatus();
        return status.phase === 'available' ? status : undefined;
      }, 120_000, 1000);
      assert.equal(available.supported, true);
      assert.equal(available.version, d);
      assert.deepEqual(downloadsOf(d), []);
    });

    await step('A renderer that is busy when the window closes does not keep the app open', async () => {
      assert(app);
      // Busy for 9 s; closing waits, offers to quit without saving after 5 s, and withdraws
      // that offer once the renderer answers.
      app.fire('const end = Date.now() + 9000; while (Date.now() < end) { /* busy */ }');
      await timers.setTimeout(200);
      const closedAt = Date.now();
      await app.closeWindow();
      const exit = await app.waitExit(60_000);
      assert.ok(exit != null, 'The app did not close after its renderer recovered');
      assert.equal(exit.code, 0);
      await timers.setTimeout(10_000);
      assert.equal(await registryVersion(), c.version, 'An update was installed without approval');
      return { closeMs: exit.at - closedAt };
    });

    await step('An unpacked (portable-style) copy finds updates but never installs', async () => {
      app = await launchApp(join(a.dir, 'win-unpacked', 'ClipPress.exe'));
      const status = await app.updateStatus();
      assert.equal(status.supported, false);
      assert.equal(status.reason, 'portable');
      await app.closeWindow();
      assert.ok(await app.waitExit(60_000));
      assert.equal(await registryVersion(), c.version);
    });

    await step('Uninstalling removes the app and keeps settings and projects', async () => {
      const code = await new Promise<number | null>((resolveExit, reject) => {
        const child = spawn(join(installDir, 'Uninstall ClipPress.exe'), ['/S'], { stdio: 'ignore', env: childEnv });
        child.on('error', reject);
        child.on('exit', resolveExit);
      });
      assert.equal(code, 0);
      await waitFor('the uninstaller to finish', async () => (await registryVersion()) == null && (await installerProcesses()).length === 0, 120_000, 2000);
      assert.equal(existsSync(exePath), false);
      assert.equal((await readSettings())['sizeLimitMb'], sizeLimitMarker);
      assert.equal(await projectSegments(), segmentsBefore.savedSegments + 2);
    });
  } finally {
    if (app != null) {
      await app.screenshot('last-window');
      app.kill();
    }
    feed?.close();
    await copyFile(join(settingsDir, 'app.log'), join(resultsDir, 'clippress-app.log')).catch(() => undefined);
    await writeFile(join(resultsDir, 'feed-requests.json'), JSON.stringify(feedRequests, null, 2));
    await writeFile(join(resultsDir, 'results.json'), JSON.stringify({ passed: steps.every(({ ok }) => ok) && steps.length > 0, steps }, null, 2));
  }
}

try {
  await main();
  console.log('\nInstaller upgrade test passed');
} catch (err) {
  console.error('\nInstaller upgrade test failed', err);
  // Keep a failing run's project for inspection.
  await copyFile(projectPath, join(resultsDir, 'clip-proj.llc')).catch(() => undefined);
  process.exitCode = 1;
}
