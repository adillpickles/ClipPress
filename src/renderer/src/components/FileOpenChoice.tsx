import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiFilm, FiFilePlus, FiLayers, FiMusic, FiPlus } from 'react-icons/fi';

import HelpTip from './HelpTip';
import styles from './FileOpenChoice.module.css';

export interface FileOpenExtra {
  key: string,
  label: string,
  /** One of the "add to this recording" choices, shown together. */
  add?: 'audio' | 'video' | 'both' | undefined,
}

const addIcons = { audio: FiMusic, video: FiFilm, both: FiLayers };

/**
 * What to do with a file dropped while a recording is open (simple mode): open it, or cancel. The rarer choices (add
 * its audio or video to this recording, join it after this one) are under "More options", which swaps in place: the
 * dialog keeps its size.
 */
export default function FileOpenChoice({ fileName, extras, onChoose }: {
  fileName: string,
  extras: readonly FileOpenExtra[],
  /** The choice's key, or undefined to cancel. */
  onChoose: (key: string | undefined) => void,
}) {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  const adds = extras.filter((extra) => extra.add != null);
  const others = extras.filter((extra) => extra.add == null);

  return (
    <div className={styles['choice']}>
      <div className={styles['file']} title={fileName}>
        <FiFilePlus aria-hidden className={styles['fileIcon']} />
        <span className={styles['fileName']}>{fileName}</span>
      </div>

      {/* Both pages share one spot, so swapping doesn't resize the dialog. */}
      <div className={styles['pages']}>
        <div className={[styles['page'], ...(more ? [styles['pageHidden']] : [])].join(' ')} aria-hidden={more}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className={styles['primary']} onClick={() => onChoose('open')} autoFocus tabIndex={more ? -1 : undefined}>
            {t('Open new file')}
          </button>
          <button type="button" className={styles['secondary']} onClick={() => onChoose(undefined)} tabIndex={more ? -1 : undefined}>
            {t('Cancel')}
          </button>
          {extras.length > 0 && (
            <button type="button" className={styles['moreLink']} onClick={() => setMore(true)} tabIndex={more ? -1 : undefined}>
              {t('More options')}
              <FiChevronRight aria-hidden />
            </button>
          )}
        </div>

        <div className={[styles['page'], ...(!more ? [styles['pageHidden']] : [])].join(' ')} aria-hidden={!more}>
          {adds.length > 0 && (
            <>
              {/* As found by trying it: added tracks are extra tracks, not mixed in. */}
              <div className={styles['heading']}>
                {t('Add as extra tracks')}
                <HelpTip label={t('About extra tracks')}>
                  <p>{t('Original quality exports keep them as extra tracks: most players play only the first sound track.')}</p>
                  <p>{t('Exports that fit a file size keep one sound track, and the preview plays only this recording.')}</p>
                </HelpTip>
              </div>
              <div className={styles['adds']}>
                {adds.map(({ key, label, add }) => {
                  const Icon = addIcons[add!];
                  return (
                    <button key={key} type="button" className={styles['add']} onClick={() => onChoose(key)} tabIndex={!more ? -1 : undefined}>
                      <Icon aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {others.map(({ key, label }) => (
            <button key={key} type="button" className={styles['other']} onClick={() => onChoose(key)} tabIndex={!more ? -1 : undefined}>
              <FiPlus aria-hidden />
              {label}
            </button>
          ))}
          <button type="button" className={styles['moreLink']} onClick={() => setMore(false)} tabIndex={!more ? -1 : undefined}>
            <FiChevronLeft aria-hidden />
            {t('Back')}
          </button>
        </div>
      </div>
    </div>
  );
}
