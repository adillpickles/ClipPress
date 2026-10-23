import { lazy, Suspense } from 'react';
import JSON5 from 'json5';

import * as Dialog from './Dialog';
import useUserSettings from '../hooks/useUserSettings';

const JsonHighlight = lazy(() => import('./JsonHighlight'));

export default function Json5Dialog({ title, json, children }: {
  title: string;
  json: unknown;
  children: React.ReactNode;
}) {
  const { darkMode } = useUserSettings();

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {children}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-describedby={undefined}>
          <Dialog.Title>
            {title}
          </Dialog.Title>

          <Suspense fallback={<pre style={{ textAlign: 'left', maxHeight: '50vh', overflowY: 'auto', fontSize: 14 }}>{JSON5.stringify(json, null, 2)}</pre>}>
            <JsonHighlight text={JSON5.stringify(json, null, 2)} darkMode={darkMode} />
          </Suspense>

          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
