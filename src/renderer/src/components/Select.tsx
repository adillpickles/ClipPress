import type { SelectHTMLAttributes, WheelEvent } from 'react';
import { memo } from 'react';

import styles from './Select.module.css';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

function Select({ onWheel, ...props }: SelectProps) {
  // An open list scrolls with the wheel. A dialog's scroll lock cancels wheel events that land on nothing scrollable,
  // and the open list doesn't count as scrollable to it, so the event goes no further than this list.
  const handleWheel = (e: WheelEvent<HTMLSelectElement>) => {
    if (e.currentTarget.matches(':open')) e.stopPropagation();
    onWheel?.(e);
  };
  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <select className={styles['select']} onWheel={handleWheel} {...props} />
  );
}

export default memo(Select);
