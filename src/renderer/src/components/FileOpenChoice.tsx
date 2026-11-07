import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiFilm, FiLayers, FiMusic, FiPlus } from 'react-icons/fi';

import styles from './FileOpenChoice.module.css';

export interface FileOpenExtra {
  key: string,
  label: string,
  /** One of the "add to this recording" choices, shown together. */
  add?: 'audio' | 'video' | 'both' | undefined,
}

const addIcons = { audio: FiMusic, video: FiFilm, both: FiLayers };

/**
 * What to do with a file dropped while a recording is open (simple mode): open it, add its sound, picture or both to
 * this recording, or cancel. It's a small question, so it has a quiet Cancel and no close button, like the others.
 * Any other choices are under "More options", which swaps in place: the dialog keeps its size.
 */
export default function FileOpenChoice({ fileName, openLabel, extras, onChoose }: {
  fileName: string,
  openLabel?: string | undefined,
  extras: readonly FileOpenExtra[],
  /** The choice's key, or undefined to cancel. */
  onChoose: (key: string | undefined) => void,
}) {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  const adds = extras.filter((extra) => extra.add != null);
  const others = extras.filter((extra) => extra.add == null);
  const firstPageTab = more ? -1 : undefined;

  return (
    <div className={styles['choice']}>
      {/* The question is about this file, so its name is the title. */}
      <h2 className={styles['title']} id="clippress-open-choice-title" title={fileName} data-tip-if-cut="">
        <span className={styles['fileName']} data-cuttable="">{fileName}</span>
      </h2>

      {/* Both pages share one spot, so swapping doesn't resize the dialog. */}
      <div className={styles['pages']}>
        <div className={[styles['page'], ...(more ? [styles['pageHidden']] : [])].join(' ')} aria-hidden={more}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className={styles['primary']} onClick={() => onChoose('open')} autoFocus tabIndex={firstPageTab}>
            {openLabel ?? t('Open new file')}
          </button>
          {adds.length > 0 && (
            <div className={styles['adds']}>
              {adds.map(({ key, label, add }) => {
                const Icon = addIcons[add!];
                return (
                  <button key={key} type="button" className={styles['add']} onClick={() => onChoose(key)} tabIndex={firstPageTab}>
                    <Icon aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {/* Under the add buttons, a bordered Cancel would read as a fourth choice: there it's a quiet one. */}
          <button type="button" className={adds.length > 0 ? styles['quietCancel'] : styles['secondary']} onClick={() => onChoose(undefined)} tabIndex={firstPageTab}>
            {t('Cancel')}
          </button>
          {others.length > 0 && (
            <button type="button" className={styles['moreLink']} onClick={() => setMore(true)} tabIndex={firstPageTab}>
              {t('More options')}
              <FiChevronRight aria-hidden />
            </button>
          )}
        </div>

        {others.length > 0 && (
          <div className={[styles['page'], ...(!more ? [styles['pageHidden']] : [])].join(' ')} aria-hidden={!more}>
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
        )}
      </div>
    </div>
  );
}
