/* eslint-disable no-console */
// Smoke test for a built app. It fails unless the app starts, the editor renders its empty
// state without uncaught renderer errors or startup dialogs, the renderer answers an API
// action, and the app then quits cleanly. The screenshot is taken from the app's own page,
// not the desktop, so a window covering the app (such as a CI runner's console) can't hide it.
//
// Usage: node script/e2e.ts <app executable> <screenshot.jpeg> [arguments to put before the app's own]
import assert from 'node:assert';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import timers from 'node:timers/promises';
import { execa } from 'execa';
import ky from 'ky';


const [appPath, screenshotOutPath, ...launchArgs] = process.argv.slice(2);
assert(appPath && screenshotOutPath, 'Usage: node script/e2e.ts <app executable> <screenshot.jpeg> [launch arguments]');

const apiPort = 8081;
const debuggingPort = 9333;
const startupTimeoutMs = 60_000;

const ps = execa(appPath, [
  ...launchArgs,
  ...(os.platform() === 'linux' ? ['--no-sandbox'] : []),
  '--http-api', String(apiPort),
  `--remote-debugging-port=${debuggingPort}`,
  // Keep painting while another window covers the app, or the screenshot can stall.
  '--disable-features=CalculateNativeWinOcclusion',
], { all: true, reject: false, forceKillAfterDelay: 10_000 });

console.log('Started', appPath);

let exited = false;
// Not awaited here: the app keeps running while the checks below talk to it.
// eslint-disable-next-line unicorn/prefer-top-level-await
const exitPromise = ps.then((result) => {
  exited = true;
  return result;
});

async function waitFor<T>(what: string, check: () => Promise<T | undefined>) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError: unknown;
  for (;;) {
    if (exited) throw new Error(`The app exited while waiting for ${what}`);
    try {
      // eslint-disable-next-line no-await-in-loop
      const value = await check();
      if (value !== undefined) return value;
    } catch (err) {
      lastError = err;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`, { cause: lastError });
    // eslint-disable-next-line no-await-in-loop
    await timers.setTimeout(500);
  }
}

interface CdpMessage {
  id?: number,
  method?: string,
  params?: Record<string, unknown>,
  result?: Record<string, unknown>,
  error?: { message: string },
}

async function connectToEditorPage() {
  const target = await waitFor('the editor page', async () => {
    const targets = await ky(`http://127.0.0.1:${debuggingPort}/json/list`, { timeout: 5000, retry: 0 })
      .json<{ type: string, url: string, webSocketDebuggerUrl: string }[]>();
    return targets.find(({ type, url }) => type === 'page' && url.includes('/renderer/index.html'));
  });

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let lastId = 0;
  const pending = new Map<number, (message: CdpMessage) => void>();
  const exceptions: string[] = [];
  const consoleErrors: string[] = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id != null) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.['exceptionDetails'] as { text: string, exception?: { description?: string } };
      exceptions.push(details.exception?.description ?? details.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.['type'] === 'error') {
      const args = message.params['args'] as { value?: unknown, description?: string }[];
      consoleErrors.push(args.map(({ value, description }) => description ?? String(value)).join(' '));
    }
  });

  async function send(method: string, params: Record<string, unknown> = {}) {
    lastId += 1;
    const id = lastId;
    const response = await Promise.race([
      new Promise<CdpMessage>((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      }),
      timers.setTimeout(15_000, undefined, { ref: false }).then(() => { throw new Error(`${method} timed out`); }),
    ]);
    if (response.error) throw new Error(`${method}: ${response.error.message}`);
    return response.result ?? {};
  }

  async function evaluate(expression: string) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result['exceptionDetails'] != null) throw new Error(`Evaluating ${expression} threw`);
    return (result['result'] as { value?: unknown }).value;
  }

  return { ws, send, evaluate, exceptions, consoleErrors };
}

async function run() {
  // The main process serves the API before it opens the window, so this only proves it started.
  await waitFor('the HTTP API', async () => {
    const text = await ky(`http://127.0.0.1:${apiPort}`, { timeout: 5000, retry: 0 }).text();
    return text.length > 0 ? text : undefined;
  });
  console.log('HTTP API is up');

  const page = await connectToEditorPage();
  async function saveScreenshot() {
    const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    await writeFile(screenshotOutPath!, Buffer.from(screenshot['data'] as string, 'base64'));
    console.log('Saved screenshot of the app window to', screenshotOutPath);
  }

  try {
    // Reports exceptions from now on; one that stops the renderer earlier fails the render check.
    await page.send('Runtime.enable');

    // The editor shell with the "Drop a clip" area, which only renders once the app has mounted
    // (a render error replaces it with the error screen).
    try {
      await waitFor('the editor to render', async () => (await page.evaluate(`(() => {
        const root = document.getElementById('app-root');
        if (root == null) return false;
        const { width, height } = root.getBoundingClientRect();
        return width > 0 && height > 0 && root.querySelector('[class*="dropzone"]') != null;
      })()`) === true ? true : undefined));
    } catch (err) {
      // Show what the window displays instead.
      await saveScreenshot().catch((screenshotError: unknown) => console.warn('Screenshot failed', screenshotError));
      throw err;
    }
    console.log('Editor rendered');

    // Let the empty state finish fading in.
    await timers.setTimeout(2000);
    await saveScreenshot();

    if (page.exceptions.length > 0) {
      throw new Error(`The renderer threw ${page.exceptions.length} uncaught exception(s):\n${page.exceptions.join('\n')}`);
    }

    // A fresh start shows no dialogs. Handled startup errors (for example FFmpeg failing to run)
    // open a problem report instead of throwing, so anything covering the editor is a failure.
    const dialogText = await page.evaluate(`(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .swal2-container')];
      return dialogs.filter((dialog) => !dialogs.some((other) => other !== dialog && other.contains(dialog)))
        .map((dialog) => dialog.textContent.trim().slice(0, 500)).join('\\n---\\n');
    })()`);
    if (dialogText !== '') throw new Error(`A dialog is open after startup:\n${String(dialogText)}`);
  } finally {
    page.ws.close();
    if (page.consoleErrors.length > 0) console.log('Renderer console errors:', page.consoleErrors);
  }

  // The renderer runs API actions, so a response also shows that it is listening.
  console.log('Sending quit command');
  await ky.post(`http://127.0.0.1:${apiPort}/api/action/quit`, { timeout: 15_000, retry: 0 });

  const result = await Promise.race([exitPromise, timers.setTimeout(30_000, undefined, { ref: false })]);
  if (result == null) throw new Error('The app did not quit within 30 seconds');
  if (result.exitCode !== 0) throw new Error(`The app quit with exit code ${result.exitCode}`);
  console.log('App quit cleanly');
}

let failure: unknown;
try {
  await run();
} catch (err) {
  failure = err;
} finally {
  if (!exited) ps.kill();
  const { all } = await exitPromise;
  console.log('App output:');
  console.log(all);
}

if (failure != null) {
  console.error('Smoke test failed:', failure);
  process.exitCode = 1;
} else {
  console.log('Smoke test passed');
}
