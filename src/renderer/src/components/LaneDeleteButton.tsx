import type { CSSProperties } from 'react';
import { FaTimes } from 'react-icons/fa';

import styles from './LaneDeleteButton.module.css';

/**
 * The one delete control for timeline lane items (text clips, speed bars): a small round button
 * on the item's right edge that turns red on hover, so every lane deletes the same way.
 */
export default function LaneDeleteButton({ title, onDelete, style }: {
  title: string,
  onDelete: () => void,
  style?: CSSProperties | undefined,
}) {
  return (
    <button
      type="button"
      className={styles['deleteButton']}
      title={title}
      aria-label={title}
      style={style}
      // Keep the press from starting a drag or seek on the lane underneath.
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
    >
      <FaTimes size={8} />
    </button>
  );
}
