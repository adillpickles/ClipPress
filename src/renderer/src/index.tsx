import { Suspense, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import type * as Electron from 'electron';
import type Remote from '@electron/remote';
import type path from 'node:path';
import type fs from 'node:fs';
import type fsPromises from 'node:fs/promises';
import type os from 'node:os';
import type mimeTypes from 'mime-types';
import type i18nextFsBackend from 'i18next-fs-backend';
import type cueParser from 'cue-parser';

import '@fontsource-variable/open-sans';
import '@fontsource-variable/open-sans/wght-italic.css';

import type { KeyboardLayoutMap } from './types';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { listenForCloseRequests } from './closeRequests';
import { installSelectEscapeGuard } from './selectEscapeGuard';
import './i18n';

import type { RemoteApiLegacy, RemoteRpcApi } from '../../main';

import './main.css';
import './swal2.scss';


type TypedRemote = Omit<typeof Remote, 'require'> & {
  require: <T extends string>(module: T) => (
    T extends './index.js' ? RemoteApiLegacy :
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  );
}

declare global {
  interface Window {
    require: <T extends string>(module: T) => (
      T extends '@electron/remote' ? TypedRemote :
      T extends 'electron' ? typeof Electron :
      T extends 'path' ? typeof path :
      T extends 'node:path' ? typeof path :
      T extends 'fs' ? typeof fs :
      T extends 'fs/promises' ? typeof fsPromises :
      T extends 'os' ? typeof os :
      T extends 'node:fs/promises' ? typeof fsPromises :
      T extends 'mime-types' ? typeof mimeTypes :
      T extends 'i18next-fs-backend' ? typeof i18nextFsBackend :
      T extends 'cue-parser' ? typeof cueParser :
      never
    );
    electron: RemoteRpcApi;
  }
  interface Navigator {
    keyboard: {
      getLayoutMap: () => Promise<KeyboardLayoutMap>;
    }
  }
}


enableMapSet();

const { app } = window.require('@electron/remote');

console.log('Version', app.getVersion());

// Before rendering, so that closing works even if the editor fails to render.
listenForCloseRequests();

// Escape on an open dropdown list closes the list only, not the dialog or sheet around it.
installSelectEscapeGuard();


const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);

// Later, once the app is idle: leftovers of exports that were killed, in ClipPress's temporary folder.
setTimeout(() => {
  import('./util/tempFiles').then(({ purgeOldTempFiles }) => purgeOldTempFiles()).catch((err) => console.warn('Could not tidy the temporary folder', err));
}, 15_000);
