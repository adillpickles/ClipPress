import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';

import { filterLicenseDisclaimer, findRuntimePackages } from './licenseDisclaimer.ts';

// Shown by Help > Licenses (shipped next to the app): ClipPress's own licence first, then FFmpeg's, then every package.
const header = `ClipPress is free software under the GNU General Public License, version 2 only (GPL-2.0-only):
https://github.com/adillpickles/ClipPress/blob/master/LICENSE
Its source code: https://github.com/adillpickles/ClipPress
ClipPress is based on LosslessCut, copyright Mikael Finstad: https://github.com/mifi/lossless-cut

FFmpeg, which ClipPress runs as a separate program for all video work, is licensed in the build ClipPress ships
under GPL v2 or later: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
That build, with the complete source code of FFmpeg and every library in it, and the scripts that built them:
https://github.com/adillpickles/clippress-ffmpeg/releases

-----

`;

// Only what ships: what Vite bundled into the app (`yarn build` lists it) and what's in the app's own node_modules.
const readJson = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8')) as T;
const bundled = await Promise.all(['main', 'preload', 'renderer'].map(async (target) => readJson<string[]>(`out/bundled-packages-${target}.json`)));
const { dependencies } = await readJson<{ dependencies: Record<string, string> }>('package.json');
const runtime = await findRuntimePackages(Object.keys(dependencies), async (name) => readJson<{ dependencies?: Record<string, string> }>(join('node_modules', name, 'package.json')).catch(() => undefined));
const shipped = new Set([...bundled.flat(), ...runtime]);

const { stdout } = await execa('yarn', ['licenses', 'generate-disclaimer', '-R'], { encoding: 'utf8' });
const { text, missing } = filterLicenseDisclaimer(stdout, shipped);
// A package that ships no licence file has nothing for yarn to list; not new, but worth seeing in the build log.
if (missing.length > 0) console.warn(`No licence text for: ${missing.join(', ')}`);
await mkdir('out', { recursive: true });
await writeFile('out/licenses.txt', `${header}${text}\n`, 'utf8');
