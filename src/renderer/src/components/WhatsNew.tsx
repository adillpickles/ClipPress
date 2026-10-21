import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { FiCode, FiFileText } from 'react-icons/fi';
import Markdown from 'react-markdown';

import * as Dialog from './Dialog';
import useUserSettings from '../hooks/useUserSettings';
import { appVersion, isMasBuild } from '../util';
import versionsJson from '../versions.json';
import { getReleaseNotes } from '../releaseNotes';
import mainApi from '../mainApi';
import Button, { DialogButton } from './Button';

import styles from './WhatsNew.module.css';
import { compareReleasesUrl, getReleaseUrl } from '../../../common/constants';


// see also generateVersions.ts
const versions: { version: string, highlightsMd?: string | undefined }[] = versionsJson;

const remote = window.require('@electron/remote');
const { shell } = remote;

// "0.1.0-beta.5" reads as "Beta 5"; anything else keeps its version number.
function formatVersion(version: string) {
  const beta = /^\d+\.\d+\.\d+-beta\.(\d+)$/.exec(version);
  return beta != null ? i18n.t('Beta {{number}}', { number: beta[1] }) : `v${version}`;
}

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

  // Start on "Got it" rather than outlining the first link.
  const handleOpenAutoFocus = useCallback((e: Event) => {
    if (doneRef.current == null) return;
    e.preventDefault();
    doneRef.current.focus({ focusVisible: false } as FocusOptions);
  }, []);

  if (matchingVersions.length === 0) return null;

  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content style={{ width: 'min(36rem, 92vw)' }} aria-describedby={undefined} onOpenAutoFocus={handleOpenAutoFocus}>
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
                    <Markdown
                      components={{
                        // eslint-disable-next-line react/no-unstable-nested-components
                        code(props) {
                          // eslint-disable-next-line react/jsx-props-no-spreading
                          return <code className="highlighted" {...props} />;
                        },
                      }}
                    >
                      {highlightsMd}
                    </Markdown>
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
