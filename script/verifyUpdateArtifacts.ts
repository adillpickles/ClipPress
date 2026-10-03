import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

// Reject incomplete/mismatched release assets before uploading an update feed.
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
// GitHub selects prereleases by their tags, then uses latest.yml within that
// release (electron-updater falls back from beta.yml to latest.yml).
const channel = 'latest';
const installerName = `ClipPress-Setup-${version}.exe`;
const installer = new URL(`../dist/${installerName}`, import.meta.url);
const hash = createHash('sha512');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const digest = hash.digest('base64');
const metadata = await readFile(new URL(`../dist/${channel}.yml`, import.meta.url), 'utf8');
const reportedVersion = /^version: (.+)$/m.exec(metadata)?.[1];
if (reportedVersion !== version || !metadata.includes(`url: ${installerName}`) || !metadata.includes(`sha512: ${digest}`)) throw new Error('Update metadata does not match the versioned installer');
await stat(new URL('../dist/ClipPress-Windows-x64.exe', import.meta.url));
const tag = process.env['GITHUB_REF_TYPE'] === 'tag' ? process.env['GITHUB_REF_NAME'] : undefined;
if (tag != null && tag !== `v${version}`) throw new Error(`Release tag ${tag} does not match package version ${version}`);
console.log(`Verified ${installerName}, ${channel}.yml and the portable download`);
