import { mkdirSync, writeFileSync } from 'node:fs';

import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** Lists the npm packages bundled into a build: script/generateLicenses.ts credits exactly what ships. */
function listBundledPackages(target: 'main' | 'preload' | 'renderer'): Plugin {
  return {
    name: 'clippress-list-bundled-packages',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const id of Object.keys(output.modules)) {
            const match = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replaceAll('\\', '/'));
            if (match != null) packages.add(match[1]!);
          }
        }
      }
      mkdirSync('out', { recursive: true });
      writeFileSync(`out/bundled-packages-${target}.json`, JSON.stringify([...packages].sort(), null, 1));
    },
  };
}


export default defineConfig({
  main: {
    plugins: [listBundledPackages('main')],
    build: {
      // Everything in package.json's devDependencies is bundled in; `dependencies` stay in node_modules, for what the
      // renderer loads with window.require. One file instead of hundreds is a smaller package and a quicker start.
      target: 'node24.22',
      sourcemap: true,
      rollupOptions: {
        external: ['electron-devtools-installer'],
      },
    },
  },
  preload: {
    plugins: [listBundledPackages('preload')],
    build: {
      target: 'node24.22',
      sourcemap: true,
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), listBundledPackages('renderer')],
    build: {
      target: 'chrome156',
      sourcemap: true,
      chunkSizeWarningLimit: 3e6,
    },
    server: {
      port: 3001,
      host: '127.0.0.1',
    },
  },
});
