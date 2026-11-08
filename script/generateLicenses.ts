import { mkdir, writeFile } from 'node:fs/promises';
import { execa } from 'execa';

// Shown by Help > Licenses (shipped next to the app): ClipPress's own licence first, then FFmpeg's, then every package.
const header = `ClipPress is free software under the GNU General Public License, version 2 only (GPL-2.0-only):
https://github.com/adillpickles/ClipPress/blob/master/LICENSE
Its source code: https://github.com/adillpickles/ClipPress
ClipPress is based on LosslessCut, copyright Mikael Finstad: https://github.com/mifi/lossless-cut

FFmpeg, which ClipPress runs as a separate program for all video work, is licensed in the builds ClipPress ships
under GPL v3 or later (they include libraries that need version 3, as "ffmpeg -L" shows):
https://www.gnu.org/licenses/gpl-3.0.html
The FFmpeg builds ClipPress ships, with their build scripts: https://github.com/mifi/ffmpeg-builds/releases
FFmpeg's source code: https://ffmpeg.org/download.html

-----

`;

const { stdout } = await execa('yarn', ['licenses', 'generate-disclaimer', '-R'], { encoding: 'utf8' });
await mkdir('out', { recursive: true });
await writeFile('out/licenses.txt', `${header}${stdout}\n`, 'utf8');
