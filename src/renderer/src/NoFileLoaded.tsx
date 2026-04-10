import { Fragment, memo, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';

import type { KeyBinding } from '../../common/types';
import { splitKeyboardKeys } from './util';
import Kbd from './components/Kbd';
import styles from './NoFileLoaded.module.css';

function Keys({ keys }: { keys: string | undefined }) {
  if (keys == null || keys === '') {
    return <kbd>UNBOUND</kbd>;
  }
  const split = splitKeyboardKeys(keys);
  return split.map((key, i) => (
    <Fragment key={key}><Kbd code={key} />{i < split.length - 1 && <span style={{ fontSize: '.7em', marginLeft: '-.2em', marginRight: '-.2em' }}>{' + '}</span>}</Fragment>
  ));
}

function NoFileLoaded({ onClick, keyBindingByAction }: {
  onClick: () => void,
  keyBindingByAction: Record<string, KeyBinding>,
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
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
      role="button"
      onClick={onClick}
      className={[
        'no-user-select',
        styles['dropzone'],
        ...(dragging ? [styles['dropzoneDragging']] : []),
      ].join(' ')}
    >
      <div className={styles['content']}>
        <div className={styles['title']}>{t('Drop a clip to get started')}</div>

        <div className={styles['instructions']}>
          <p className={styles['instruction']}><Trans>Drop in a clip or click anywhere here to browse.</Trans></p>
          <p className={styles['instruction']}><Trans>Press <Keys keys={keyBindingByAction['setCutStart']?.keys} /> for the start and <Keys keys={keyBindingByAction['setCutEnd']?.keys} /> for the end.</Trans></p>
          <p className={styles['instruction']}><Trans>Optionally add text or adjust gain, then export.</Trans></p>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(NoFileLoaded);
