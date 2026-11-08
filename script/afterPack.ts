import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { AfterPackContext } from 'electron-builder';

import { unusedChromiumFiles } from './packagedAppAudit.ts';

/**
 * Runs after electron-builder has copied Electron and the app into the output folder, before signing and before the
 * installers are made, so both installers lose these files. `yarn check-package` fails if they come back.
 */
export default async function afterPack({ appOutDir, electronPlatformName }: AfterPackContext) {
  if (electronPlatformName !== 'win32') return;
  await Promise.all(unusedChromiumFiles.map(async (name) => rm(path.join(appOutDir, name), { force: true })));
}
