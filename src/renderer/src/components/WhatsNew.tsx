import type { KeyboardEvent } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCode, FiFileText } from 'react-icons/fi';

import * as Dialog from './Dialog';
import useUserSettings from '../hooks/useUserSettings';
import { appVersion, isMasBuild } from '../util';
import versionsJson from '../versions.json';
import { getReleaseNotes } from '../releaseNotes';
import mainApi from '../mainApi';
import Button, { DialogButton } from './Button';

import styles from './WhatsNew.module.css';
import { compareReleasesUrl, getReleaseUrl } from '../../../common/constants';
import formatVersion from '../../../common/formatVersion';


// Loaded only when there are notes to show: the Markdown parser isn't needed at every start.
const WhatsNewMarkdown = lazy(() => import('./WhatsNewMarkdown'));

// see also generateVersions.ts
const versions: { version: string, highlightsMd?: string | undefined }[] = versionsJson;

const remote = window.require('@electron/remote');
const { shell } = remote;

export default function WhatsNew() {
  const { t } = useTranslation();
  const { lastAppVersion, setLastAppVersion } = useUserSettings();

  const [initialLastAppVersion] = useState(lastAppVersion);

  useEffect(() => {
    mainApi.acknowledgeAppVersion()
      .then(() => setLastAppVersion(appVersion))
      .catch((error: unknown) => console.error('Failed to remember the app version', error));
  }, [setLastAppVersion]);

  const matchingVersions = useMemo(() => getReleaseNotes(versions, initialLastAppVersion, appVersion), [initialLastAppVersion]);

  const doneRef = useRef<HTMLButtonElement>(null);

  // Focus the dialog, not a button, so it opens without a focus ring (Chromium ignores focusVisible: false);
  // Enter still means "Got it".
  const handleOpenAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
    e.preventDefault();
    doneRef.current?.click();
  }, []);

  if (matchingVersions.length === 0) return null;

  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content style={{ width: 'min(36rem, 92vw)' }} aria-describedby={undefined} onOpenAutoFocus={handleOpenAutoFocus} onKeyDown={handleKeyDown}>
          <Dialog.Title>
            {t('What\'s new in ClipPress')}
          </Dialog.Title>

          <div className={styles['versions']}>
            {matchingVersions.map(({ version, highlightsMd }, i) => {
              // +1 because reverse order
              const prevVersion = matchingVersions[i + 1]?.version ?? initialLastAppVersion;

              return (
                <div key={version} className={styles['version']}>
                  {!(isMasBuild && matchingVersions.length === 1) && <h2>{formatVersion(version)}</h2>}

                  {highlightsMd != null && (
                    <Suspense fallback={<div style={{ minHeight: '3em' }} />}>
                      <WhatsNewMarkdown>{highlightsMd}</WhatsNewMarkdown>
                    </Suspense>
                  )}

                  {/* The highlights stay short; everything else is one click away. */}
                  <div className={styles['links']}>
                    <Button variant="ghost" size="sm" onClick={() => shell.openExternal(getReleaseUrl(version))}><FiFileText aria-hidden /> {t('All release notes')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => shell.openExternal(compareReleasesUrl(prevVersion, version))}><FiCode aria-hidden /> {t('All code changes')}</Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Dialog.ButtonRow>
            <Dialog.Close asChild>
              <DialogButton ref={doneRef} primary>{t('Got it')}</DialogButton>
            </Dialog.Close>
          </Dialog.ButtonRow>

          <Dialog.CloseButton />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
