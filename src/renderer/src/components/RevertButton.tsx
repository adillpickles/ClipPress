import { FiRotateCcw } from 'react-icons/fi';

import styles from './Settings.module.css';

/**
 * Back to a setting's default, for that row alone: shown beside its name once it differs. Its hint says in words what
 * it goes back to (key caps in a hint would read as the arrow's own shortcut; it has none).
 */
export default function RevertButton({ title, onClick }: { title: string, onClick: () => void }) {
  return (
    <button type="button" className={styles['revert']} title={title} aria-label={title} onClick={onClick}>
      <FiRotateCcw aria-hidden />
    </button>
  );
}
