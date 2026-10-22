import type { ComponentProps } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiFolder } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import AnchoredPopover from './AnchoredPopover';
import Shelf from './Shelf';
import shelfStyles from './Shelf.module.css';
import styles from './ShelfButton.module.css';

/** Long enough that passing over the button on the way elsewhere doesn't open it. */
const openDelayMs = 400;
const closeDelayMs = 300;

/**
 * The Open button, with the shelf of clips from the same folder: it opens after a short hover over the button,
 * or at once from the arrow next to it. Clicking Open itself still shows the file dialog.
 */
function ShelfButton({ onOpenFiles, onShelfShown, shelf }: {
  onOpenFiles: () => void,
  /** The shelf is about to show: a chance to look at the folder again. */
  onShelfShown: () => void,
  shelf: Omit<ComponentProps<typeof Shelf>, 'onOpen'> & { onOpen: (path: string) => void },
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement>();
  // Opened with a click: stays until a click elsewhere, rather than closing when the pointer leaves.
  const pinnedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimer = () => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  useEffect(() => clearTimer, []);

  const show = useCallback((pinned: boolean) => {
    if (anchorRef.current == null) return;
    pinnedRef.current = pinned;
    onShelfShown();
    setAnchor(anchorRef.current);
  }, [onShelfShown]);

  const close = useCallback(() => {
    clearTimer();
    pinnedRef.current = false;
    setAnchor(undefined);
  }, []);

  const onPointerEnter = () => {
    clearTimer();
    if (anchor == null) timerRef.current = setTimeout(() => show(false), openDelayMs);
  };
  const onPointerLeave = () => {
    clearTimer();
    if (anchor != null && !pinnedRef.current) timerRef.current = setTimeout(close, closeDelayMs);
  };

  const { onOpen } = shelf;
  const openClip = useCallback((path: string) => {
    close();
    onOpen(path);
  }, [close, onOpen]);

  return (
    <div ref={anchorRef} className={styles['split']} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <button type="button" className={styles['main']} onClick={() => { close(); onOpenFiles(); }} title={t('Open another clip')}>
        <FiFolder aria-hidden />
        {t('Open')}
      </button>
      <button
        type="button"
        className={styles['arrow']}
        onClick={() => (anchor != null ? close() : show(true))}
        aria-expanded={anchor != null}
        aria-label={t('Clips in this folder')}
        title={t('Clips in this folder')}
      >
        <FiChevronDown aria-hidden />
      </button>

      {anchor != null && (
        <AnchoredPopover
          anchor={anchor}
          align="start"
          onClose={close}
          label={t('Clips in this folder')}
          className={shelfStyles['popover']}
          onPointerEnter={clearTimer}
          onPointerLeave={onPointerLeave}
        >
          <Shelf
            folder={shelf.folder}
            queue={shelf.queue}
            currentPath={shelf.currentPath}
            nextPath={shelf.nextPath}
            caseInsensitive={shelf.caseInsensitive}
            order={shelf.order}
            onOrderChange={shelf.onOrderChange}
            onOpen={openClip}
            onChooseFolder={shelf.onChooseFolder}
            thumbnails={shelf.thumbnails}
            requestThumbnail={shelf.requestThumbnail}
          />
        </AnchoredPopover>
      )}
    </div>
  );
}

export default memo(ShelfButton);
