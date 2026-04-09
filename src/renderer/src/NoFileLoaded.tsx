import { Fragment, memo, useState } from 'react';
import type { MotionStyle } from 'motion/react';
import { motion } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';

import type { StateSegment } from './types';
import type { KeyBinding } from '../../common/types';
import { splitKeyboardKeys } from './util';
import Kbd from './components/Kbd';

function Keys({ keys }: { keys: string | undefined }) {
  if (keys == null || keys === '') {
    return <kbd>UNBOUND</kbd>;
  }
  const split = splitKeyboardKeys(keys);
  return split.map((key, i) => (
    <Fragment key={key}><Kbd code={key} />{i < split.length - 1 && <span style={{ fontSize: '.7em', marginLeft: '-.2em', marginRight: '-.2em' }}>{' + '}</span>}</Fragment>
  ));
}

const dropzoneStyle: MotionStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  color: 'var(--gray-12)',
  margin: '1.5em',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  borderWidth: '.35em',
  borderStyle: 'dashed',
  borderColor: 'var(--gray-4)',
  borderRadius: '1.8em',
  background: 'color-mix(in srgb, var(--gray-2) 72%, transparent)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
};

function NoFileLoaded({ mifiLink: _mifiLink, currentCutSeg: _currentCutSeg, onClick, darkMode: _darkMode, keyBindingByAction }: {
  mifiLink: unknown,
  currentCutSeg: StateSegment | undefined,
  onClick: () => void,
  darkMode?: boolean,
  keyBindingByAction: Record<string, KeyBinding>,
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      className="no-user-select"
      style={dropzoneStyle}
      animate={{ borderColor: dragging ? 'var(--gray-9)' : 'var(--gray-3)' }}
      onDragOver={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      role="button"
      onClick={onClick}
    >
      <div style={{ fontSize: '2em', color: 'var(--gray-12)', fontWeight: 800, marginBottom: '.15em', letterSpacing: '-.03em' }}>{t('Drop a clip to get started')}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5em', fontSize: '1.02em', color: 'var(--gray-11)', marginTop: '.65rem', maxWidth: '32rem', whiteSpace: 'normal', lineHeight: 1.45 }}>
        <div><Trans>Drop in a clip or click anywhere here to browse.</Trans></div>
        <div><Trans>Press <Keys keys={keyBindingByAction['setCutStart']?.keys} /> for the start and <Keys keys={keyBindingByAction['setCutEnd']?.keys} /> for the end.</Trans></div>
        <div><Trans>Optionally add text or adjust gain, then export.</Trans></div>
      </div>
    </motion.div>
  );
}

export default memo(NoFileLoaded);
