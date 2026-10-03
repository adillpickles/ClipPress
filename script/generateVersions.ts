import { readdir, readFile, writeFile } from 'node:fs/promises';
import semver from 'semver';


const versionsDir = new URL('../versions/', import.meta.url);

const versions: { version: string, highlightsMd?: string | undefined }[] = [];

for (const file of await readdir(versionsDir, { withFileTypes: true })) {
  if (file.isFile() && file.name.endsWith('.md')) {
    const version = file.name.replace(/.md$/, '');
    const content = await readFile(new URL(file.name, versionsDir), { encoding: 'utf8' });
    versions.push({ version, highlightsMd: content.trim() !== '' ? content : undefined });
  }
}

versions.sort(({ version: a }, { version: b }) => semver.compare(a, b));
await writeFile(new URL('../src/renderer/src/versions.json', import.meta.url), JSON.stringify(versions, null, 2));
