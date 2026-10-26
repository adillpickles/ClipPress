import { motion } from 'motion/react';
import { LuPanelRightOpen } from 'react-icons/lu';

import styles from './ClipsPanelTab.module.css';

/** The way back to a hidden Clips panel: a small tab on the window's right edge, where the panel slides back in. */
export default function ClipsPanelTab({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <motion.button
      type="button"
      className={styles['tab']}
      title={label}
      onClick={onClick}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.16 }}
    >
      <LuPanelRightOpen aria-hidden />
    </motion.button>
  );
}
