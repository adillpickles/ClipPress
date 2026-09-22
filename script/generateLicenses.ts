import { mkdir, writeFile } from 'node:fs/promises';
import { execa } from 'execa';

const { stdout } = await execa('yarn', ['licenses', 'generate-disclaimer', '-R'], { encoding: 'utf8' });
await mkdir('out', { recursive: true });
await writeFile('out/licenses.txt', `${stdout}\n\nFFmpeg is licensed under GPL v2+:\nhttps://www.gnu.org/licenses/old-licenses/gpl-2.0.html\n`, 'utf8');
