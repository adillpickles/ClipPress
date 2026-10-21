import type { ReactNode } from 'react';
import { Fragment, memo, useState } from 'react';
import { motion } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';
import { FiFolder, FiShare, FiType } from 'react-icons/fi';

import type { KeyBinding } from '../../common/types';
import { isMac, splitKeyboardKeys } from './util';
import Kbd from './components/Kbd';
import Button from './components/Button';
import ClipPressMark from './components/ClipPressMark';
import styles from './NoFileLoaded.module.css';

function Keys({ keys }: { keys: string | undefined }) {
  if (keys == null || keys === '') return null;
  const split = splitKeyboardKeys(keys);
  return split.map((key, i) => (
    <Fragment key={key}><Kbd code={key} />{i < split.length - 1 && <span className={styles['plus']}>+</span>}</Fragment>
  ));
}

function Step({ icon, title, children }: { icon: ReactNode, title: string, children: ReactNode }) {
  return (
    <div className={styles['step']}>
      <div className={styles['stepIcon']}>{icon}</div>
      <div className={styles['stepTitle']}>{title}</div>
      <div className={styles['stepText']}>{children}</div>
    </div>
  );
}

function NoFileLoaded({ onClick, onOpenFolderClick, keyBindingByAction, showSteps, children }: {
  onClick: () => void,
  onOpenFolderClick: () => void,
  keyBindingByAction: Record<string, KeyBinding>,
  /** The three steps of making a clip, for people who haven't opened anything yet. */
  showSteps: boolean,
  /** Shown under the buttons (recent recordings). */
  children?: ReactNode,
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      className={[
        'no-user-select',
        styles['dropzone'],
        ...(dragging ? [styles['dropzoneDragging']] : []),
      ].join(' ')}
    >
      <div className={styles['content']}>
        <div className={styles['mark']}>
          <ClipPressMark size="100%" />
        </div>

        <h1 className={styles['title']}>{dragging ? t('Drop to open') : t('Open a recording to start clipping')}</h1>
        <p className={styles['subtitle']}>{t('Drag a video anywhere into this window, or choose one.')}</p>

        <div className={styles['actions']}>
          <Button variant="primary" size="lg" onClick={onClick}>
            {t('Open recording…')}
            <span className={styles['buttonKeys']}><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd><span className={styles['plus']}>+</span><kbd>O</kbd></span>
          </Button>
          <Button variant="ghost" size="lg" onClick={onOpenFolderClick}>
            <FiFolder aria-hidden />
            {t('Open folder')}
          </Button>
        </div>

        {showSteps && (
        <div className={styles['steps']}>
          <Step icon={<span className={styles['bracketIcon']}>[ ]</span>} title={t('Mark the moment')}>
            {keyBindingByAction['setCutStart'] != null && keyBindingByAction['setCutEnd'] != null ? (
              <Trans>Press <Keys keys={keyBindingByAction['setCutStart'].keys} /> for the start and <Keys keys={keyBindingByAction['setCutEnd'].keys} /> for the end. Add as many clips as you like.</Trans>
            ) : t('Set a start and an end for each clip.')}
          </Step>
          <Step icon={<FiType aria-hidden />} title={t('Polish it')}>
            {t('Add text, slow down or speed up a clip, zoom in, or adjust the volume.')}
          </Step>
          <Step icon={<FiShare aria-hidden />} title={t('Export to size')}>
            {t('Keep the original quality, or pick a file size like 10 MB for Discord.')}
          </Step>
        </div>
        )}

        {children}
      </div>
    </motion.div>
  );
}

export default memo(NoFileLoaded);
