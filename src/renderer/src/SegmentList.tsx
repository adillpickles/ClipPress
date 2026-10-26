import type { SetStateAction, Dispatch, MouseEventHandler, CSSProperties, KeyboardEventHandler, SyntheticEvent, PointerEvent as ReactPointerEvent } from 'react';
import { memo, useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { FaYinYang, FaSave, FaPlus, FaMinus, FaTag, FaSortNumericDown, FaRegCheckCircle, FaRegCircle } from 'react-icons/fa';
import { FiCheck, FiEdit2, FiMoreHorizontal } from 'react-icons/fi';
import { LuPanelRightClose } from 'react-icons/lu';
import { AiOutlineSplitCells } from 'react-icons/ai';
import { motion, useReducedMotionConfig } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import type { Range } from '@tanstack/react-virtual';
import { CSS } from '@dnd-kit/utilities';
import invariant from 'tiny-invariant';
import prettyBytes from 'pretty-bytes';

import useContextMenu from './hooks/useContextMenu';
import useUserSettings from './hooks/useUserSettings';
import { saveColor, primaryTextColor, darkModeTransition, getSegBadgeStyle, getSegColorVars } from './colors';
import { useSegColors } from './contexts';
import { getSegmentsTotalDuration, getSegmentTags } from './segments';
import formatClockTime, { formatClipLength } from './util/clockTime';
import TagEditor from './components/TagEditor';
import type { ContextMenuTemplate, DefiniteSegmentBase, FormatTimecode, GetFrameCount, InverseCutSegment, SegmentBase, SegmentColorIndex, SegmentTags, StateSegment } from './types';
import type { UseSegments } from './hooks/useSegments';
import * as Dialog from './components/Dialog';
import { DialogButton } from './components/Button';
import getSwal from './swal';
import { getSegmentOutputDuration, getSegmentSpeed } from './segmentSpeed';
import { hasSegmentCrop } from './segmentCrop';
import { openMenu } from './components/Menu';
import type { PickHow } from './clipPicking';
import styles from './SegmentList.module.css';


const buttonBaseStyle: CSSProperties = {
  margin: '0 3px', borderRadius: 3, color: 'white', cursor: 'pointer', userSelect: 'none',
};

/** Room (px) kept around the rows for the selected card's glow and the focus rings; see also .rows. */
const listEdgeRoom = 6;

const disabledButtonStyle = { color: 'var(--gray-10)', backgroundColor: 'var(--gray-6)' };
const neutralButtonColor = 'var(--gray-9)';

/** Edits a clip's name in place: Enter or leaving the field saves, Escape cancels. */
function ClipNameInput({ name, placeholder, maxLength, onDone }: {
  name: string,
  placeholder: string,
  maxLength: number,
  onDone: (newName: string | undefined) => void,
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const doneRef = useRef(false);

  const finish = useCallback((newName: string | undefined) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(newName);
  }, [onDone]);

  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLInputElement>>((e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(value.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(undefined);
    }
  }, [finish, value]);

  // Keep clicks and drags in the field from selecting or dragging the clip.
  const stop = useCallback((e: SyntheticEvent) => e.stopPropagation(), []);

  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      className={styles['clipNameInput']}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={t('Clip name')}
      title={t('Used in the file name when clips are exported as separate files')}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => finish(value.trim())}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    />
  );
}

/** How the panel slides out and in: eased, without a bounce, as the editor resizes with it. */
const panelSlideTransition = { duration: 0.28, ease: [0.3, 0.7, 0.2, 1] } as const;
const panelSlotVariants = {
  // `custom` (from AnimatePresence, when it goes): whether the user hid it; closing a recording just removes it.
  hidden: (animated: boolean) => ({ width: 0, marginLeft: '-0.75rem', transition: animated ? panelSlideTransition : { duration: 0 } }),
};

// eslint-disable-next-line react/display-name
const Segment = memo(({
  seg,
  index,
  isActive,
  picked = false,
  dragging,
  formatTimecode,
  getFrameCount,
  updateSegOrder,
  onClick,
  onRemovePress,
  onRemoveSelected,
  onLabelSelectedSegments,
  onReorderPress,
  onLabelPress,
  selected,
  onSelectSingleSegment,
  onToggleSegmentSelected,
  onDeselectAllSegments,
  onSelectSegmentsByLabel,
  onSelectSegmentsByExpr,
  onSelectAllMarkers,
  onSelectAllSegments,
  onMutateSegmentsByExpr,
  jumpSegStart,
  jumpSegEnd,
  addSegment,
  onEditSegmentTags,
  onExtractSegmentsFramesAsImages,
  onExtractSelectedSegmentsFramesAsImages,
  onInvertSelectedSegments,
  onDuplicateSegmentClick,
  getSegEstimatedSize,
  onEditSpeed, onEditCrop, noneTicked = false, renaming = false, onStartRename, onFinishRename, maxLabelLength,
}: {
  seg: StateSegment | InverseCutSegment,
  index: number,
  isActive?: boolean | undefined,
  /** One of the clips picked for Delete (Ctrl or Shift+click, a selection box). */
  picked?: boolean | undefined,
  dragging?: boolean | undefined,
  formatTimecode: FormatTimecode,
  getFrameCount: GetFrameCount,
  updateSegOrder: UseSegments['updateSegOrder'],
  onClick: (i: number, how?: PickHow) => void,
  onRemovePress: UseSegments['removeSegment'],
  onRemoveSelected: UseSegments['removeSelectedSegments'],
  onLabelSelectedSegments: UseSegments['labelSelectedSegments'],
  onReorderPress: (i: number) => Promise<void>,
  onLabelPress: UseSegments['labelSegment'],
  selected: boolean | undefined,
  onSelectSingleSegment: UseSegments['selectOnlySegment'],
  onToggleSegmentSelected: UseSegments['toggleSegmentSelected'],
  onDeselectAllSegments: UseSegments['deselectAllSegments'],
  onSelectSegmentsByLabel: UseSegments['selectSegmentsByLabel'],
  onSelectSegmentsByExpr: UseSegments['selectSegmentsByExpr'],
  onSelectAllMarkers: UseSegments['selectAllMarkers'],
  onSelectAllSegments: UseSegments['selectAllSegments'],
  onMutateSegmentsByExpr: UseSegments['mutateSegmentsByExpr'],
  jumpSegStart: (i: number) => void,
  jumpSegEnd: (i: number) => void,
  addSegment: UseSegments['addSegment'],
  onEditSegmentTags: (i: number) => void,
  onExtractSegmentsFramesAsImages: (segments: Pick<SegmentBase, 'start' | 'end'>[]) => Promise<void>,
  onExtractSelectedSegmentsFramesAsImages: () => void,
  onInvertSelectedSegments: UseSegments['invertSelectedSegments'],
  onDuplicateSegmentClick: UseSegments['duplicateSegment'],
  getSegEstimatedSize: UseSegments['getSegEstimatedSize'],
  onEditSpeed: (segmentIndex: number) => void,
  onEditCrop: (segmentIndex: number) => void,
  /** No clip is ticked, so the export takes all of them. */
  noneTicked?: boolean,
  /** The list keeps track of which clip is being renamed, so its row stays mounted while scrolled out of view. */
  renaming?: boolean,
  onStartRename: (segId: string) => void,
  /** `newName` is undefined when renaming was cancelled. */
  onFinishRename: (segId: string, newName: string | undefined) => void,
  maxLabelLength: number,
}) => {
  const { invertCutSegments, darkMode, simpleMode } = useUserSettings();
  const { t } = useTranslation();
  const { getSegColor } = useSegColors();

  const ref = useRef<HTMLDivElement | null>(null);

  // Simple mode renames clips in place (#23).
  const startRenaming = useCallback(() => onStartRename(seg.segId), [onStartRename, seg.segId]);

  const contextMenuTemplate = useMemo<ContextMenuTemplate>(() => {
    if (invertCutSegments) return [];

    const updateOrder = (dir: number) => updateSegOrder(index, index + dir);

    // Simple mode keeps what belongs to a card in the list: speed and crop are the timeline clip's, and the cards are
    // dragged to reorder.
    if (simpleMode) {
      return [
        { label: t('Rename clip'), click: startRenaming },
        { label: t('Duplicate clip'), click: () => onDuplicateSegmentClick(seg) },

        { type: 'separator' },

        { label: t('Include in export'), type: 'checkbox', checked: selected === true, click: () => onToggleSegmentSelected(seg) },
        { label: t('Export only this clip'), click: () => onSelectSingleSegment(seg) },

        { type: 'separator' },

        // The whole clip, as the title bar's Remove clip does; without `true` it only takes off the end and leaves a marker.
        { label: t('Remove clip'), click: () => onRemovePress(index, true) },
      ];
    }

    return [
      { label: t('Jump to start time'), click: () => jumpSegStart(index) },
      { label: t('Jump to end time'), click: () => jumpSegEnd(index) },

      { type: 'separator' },

      { label: t('Add segment'), click: addSegment },
      { label: t('Label segment'), click: () => onLabelPress(index) },
      { label: t('Remove segment'), click: () => onRemovePress(index) },
      { label: t('Duplicate segment'), click: () => onDuplicateSegmentClick(seg) },
      { label: t('Change speed…'), enabled: seg.end != null, click: () => onEditSpeed(index) },
      { label: t('Zoom / Crop…'), enabled: seg.end != null, click: () => onEditCrop(index) },

      { type: 'separator' },

      { label: t('Select only this segment'), click: () => onSelectSingleSegment(seg) },
      { label: t('Select all segments'), click: () => onSelectAllSegments() },
      { label: t('Deselect all segments'), click: () => onDeselectAllSegments() },
      { label: t('Select all markers'), click: () => onSelectAllMarkers() },
      { label: t('Select segments by label'), click: () => onSelectSegmentsByLabel() },
      { label: t('Select segments by expression'), click: () => onSelectSegmentsByExpr() },
      { label: t('Invert selected segments'), click: () => onInvertSelectedSegments() },

      { type: 'separator' },

      { label: t('Label selected segments'), click: onLabelSelectedSegments },
      { label: t('Remove selected segments'), click: onRemoveSelected },
      { label: t('Edit segments by expression'), click: () => onMutateSegmentsByExpr() },
      { label: t('Extract frames from selected segments as image files'), click: onExtractSelectedSegmentsFramesAsImages },

      { type: 'separator' },

      { label: t('Change segment order'), click: () => onReorderPress(index) },
      { label: t('Increase segment order'), click: () => updateOrder(1) },
      { label: t('Decrease segment order'), click: () => updateOrder(-1) },

      { type: 'separator' },

      { label: t('Segment tags'), click: () => onEditSegmentTags(index) },
      { label: t('Extract frames as image files'), click: () => onExtractSegmentsFramesAsImages([seg]) },
    ];
  }, [invertCutSegments, simpleMode, startRenaming, selected, onToggleSegmentSelected, t, addSegment, onLabelSelectedSegments, onRemoveSelected, onExtractSelectedSegmentsFramesAsImages, updateSegOrder, index, jumpSegStart, jumpSegEnd, onLabelPress, onRemovePress, onDuplicateSegmentClick, seg, onSelectSingleSegment, onSelectAllSegments, onDeselectAllSegments, onSelectAllMarkers, onSelectSegmentsByLabel, onSelectSegmentsByExpr, onInvertSelectedSegments, onMutateSegmentsByExpr, onReorderPress, onEditSegmentTags, onExtractSegmentsFramesAsImages, onEditSpeed, onEditCrop]);

  useContextMenu(ref, contextMenuTemplate);

  const duration = useMemo(() => (seg.end == null ? undefined : getSegmentOutputDuration(seg)), [seg]);
  const estimatedSize = useMemo(() => getSegEstimatedSize(seg), [getSegEstimatedSize, seg]);

  const timeStr = useMemo(() => (
    simpleMode
      ? (seg.end == null
        ? formatClockTime(seg.start)
        : `${formatClockTime(seg.start)}–${formatClockTime(seg.end)}`)
      : (seg.end == null
        ? formatTimecode({ seconds: seg.start })
        : `${formatTimecode({ seconds: seg.start })} - ${formatTimecode({ seconds: seg.end })}`)
  ), [formatTimecode, seg, simpleMode]);

  const simpleSegColor = useMemo(() => {
    if (!simpleMode || invertCutSegments || !('segColorIndex' in seg)) return undefined;
    return getSegColor(seg);
  }, [getSegColor, invertCutSegments, seg, simpleMode]);
  // Same tone and readable digits as the clip's number on the timeline (getSegBadgeStyle).
  const badgeStyle = useMemo(() => (simpleSegColor != null ? getSegBadgeStyle(simpleSegColor) : undefined), [simpleSegColor]);
  // The selected card is outlined and tinted in the clip's own colour (SegmentList.module.css).
  const colorVars = useMemo(() => (simpleSegColor != null ? getSegColorVars(simpleSegColor) : undefined), [simpleSegColor]);

  function renderNumber() {
    if (simpleMode) {
      return (
        <b style={{ color: simpleSegColor?.lightness(78).string() ?? 'var(--gray-12)', padding: '0 .42em', minWidth: '1.55rem', height: '1.55rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: '.5em', background: simpleSegColor?.alpha(0.2).string() ?? 'color-mix(in srgb, var(--gray-5) 82%, transparent)', border: `1px solid ${simpleSegColor?.alpha(0.45).string() ?? 'color-mix(in srgb, var(--gray-8) 26%, transparent)'}`, borderRadius: '999px', fontSize: '.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {index + 1}
        </b>
      );
    }

    if (invertCutSegments || !('segColorIndex' in seg)) {
      return <FaSave style={{ color: saveColor, marginRight: '.2em', verticalAlign: 'middle' }} size={14} />;
    }

    const segColor = getSegColor(seg);

    const color = segColor.desaturate(0.25).lightness(darkMode ? 35 : 55);
    const borderColor = darkMode ? color.lighten(0.5) : color.darken(0.3);

    return (
      <b style={{ color: 'white', padding: '0 .3em', marginRight: '.3em', marginLeft: '-.23em', background: color.string(), border: `.05em solid ${isActive ? borderColor.string() : 'transparent'}`, borderRadius: '.35em', fontSize: '.7em' }}>
        {index + 1}
      </b>
    );
  }

  const onDoubleClick = useCallback(() => {
    if (invertCutSegments) return;
    jumpSegStart(index);
  }, [index, invertCutSegments, jumpSegStart]);

  const CheckIcon = selected ? FaRegCheckCircle : FaRegCircle;

  const onToggleSegmentSelectedClick = useCallback<MouseEventHandler>((e) => {
    e.stopPropagation();
    onToggleSegmentSelected(seg);
  }, [onToggleSegmentSelected, seg]);

  const cursor = invertCutSegments ? undefined : (dragging ? 'grabbing' : 'grab');

  const tags = useMemo(() => getSegmentTags('tags' in seg ? seg : {}), [seg]);

  const handleSegmentClick = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.blur();
    let how: PickHow = 'one';
    if (e.ctrlKey || e.metaKey) how = 'toggle';
    else if (e.shiftKey) how = 'range';
    if (!invertCutSegments) onClick(index, how);
  }, [index, invertCutSegments, onClick]);

  const handleDraggableClick = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.blur();
  }, []);

  const sortable = useSortable({
    id: seg.segId,
    transition: {
      duration: 150,
      easing: 'ease-in-out',
    },
    disabled: invertCutSegments,
  });

  const style = useMemo<CSSProperties>(() => {
    const transitions = [
      ...(sortable.transition ? [sortable.transition] : []),
      'opacity 100ms ease-out',
    ];
    return {
      visibility: sortable.isDragging ? 'hidden' : undefined,
      padding: simpleMode ? '.74rem .8rem' : '3px 5px',
      margin: simpleMode ? '4px 0' : '1px 0',
      boxSizing: 'border-box',
      originY: 0,
      position: 'relative',
      transform: CSS.Transform.toString(sortable.transform),
      transition: transitions.length > 0 ? transitions.join(', ') : undefined,
      background: simpleMode
        ? (simpleSegColor != null
          ? `linear-gradient(90deg, ${simpleSegColor.alpha(0.12).string()}, transparent 28%), color-mix(in srgb, var(--gray-1) 88%, transparent)`
          : 'color-mix(in srgb, var(--gray-1) 88%, transparent)')
        : 'var(--gray-1)',
      border: `1px solid ${isActive ? 'var(--gray-10)' : (simpleMode ? 'color-mix(in srgb, var(--gray-8) 24%, transparent)' : 'transparent')}`,
      borderLeft: simpleMode && simpleSegColor != null
        ? `3px solid ${simpleSegColor.alpha(isActive ? 0.9 : 0.72).string()}`
        : undefined,
      borderRadius: simpleMode ? 14 : 5,
      opacity: !selected && !invertCutSegments ? (simpleMode ? 0.92 : 0.5) : undefined,
      boxShadow: simpleMode ? '0 8px 22px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03)' : undefined,
    };
  }, [invertCutSegments, isActive, selected, simpleMode, simpleSegColor, sortable.isDragging, sortable.transform, sortable.transition]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    sortable.setNodeRef(node);
    ref.current = node;
  }, [sortable]);

  if (simpleMode && !invertCutSegments) {
    const name = 'name' in seg ? seg.name : '';
    const speed = getSegmentSpeed(seg);
    // Crop applies to one clip only, so say which ones have it (as speed does).
    const cropped = hasSegmentCrop(seg);
    const details = [
      ...(name ? [timeStr] : []),
      ...(duration != null ? [formatClipLength(duration)] : []),
      ...(speed !== 1 ? [`${Math.round(speed * 100)}%`] : []),
      ...(cropped ? [t('Cropped')] : []),
    ];
    const sizeStr = estimatedSize != null ? prettyBytes(estimatedSize, { space: true, maximumFractionDigits: 1, minimumFractionDigits: 0 }) : undefined;
    const tooltip = [
      ...(name ? [name] : []),
      timeStr,
      ...(duration != null ? [`${t('Length')}: ${formatClipLength(duration)}${speed !== 1 ? ` (${Math.round(speed * 100)}%)` : ''}`] : []),
      ...(sizeStr != null ? [`${t('Size at source quality')}: ~${sizeStr}`] : []),
    ].join('\n');
    const ticked = selected !== false;
    const included = ticked || noneTicked;
    return (
      <div
        ref={setRef}
        role="button"
        onClick={handleSegmentClick}
        onDoubleClick={onDoubleClick}
        style={{ ...colorVars, transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition ?? undefined, visibility: sortable.isDragging ? 'hidden' : undefined }}
        className={[styles['clip'], ...(picked && !isActive ? [styles['clipPicked']] : []), ...(isActive ? [styles['clipActive']] : []), ...(!included ? [styles['clipExcluded']] : []), ...(dragging ? [styles['clipDragging']] : [])].join(' ')}
        aria-pressed={picked || isActive}
      >
        <div
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...sortable.attributes}
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...sortable.listeners}
          role="button"
          tabIndex={-1}
          className={styles['clipBody']}
          style={{ cursor }}
          title={tooltip}
          onClick={handleDraggableClick}
        >
          <span className={styles['clipBadge']} style={badgeStyle}>{index + 1}</span>
          <span className={styles['clipText']}>
            {renaming ? (
              <ClipNameInput
                name={name ?? ''}
                placeholder={timeStr}
                maxLength={maxLabelLength}
                onDone={(newName) => onFinishRename(seg.segId, newName)}
              />
            ) : (
              <span className={styles['clipTitleRow']}>
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <span className={styles['clipTitle']} onDoubleClick={(e) => { e.stopPropagation(); startRenaming(); }}>{name || timeStr}</span>
                {/* Renames the title, so it sits right after it. Always in the tab order; shown on hover, focus and for the selected clip. */}
                <button
                  type="button"
                  className={styles['renameButton']}
                  title={t('Rename clip')}
                  aria-label={t('Rename clip')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); startRenaming(); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <FiEdit2 aria-hidden />
                </button>
              </span>
            )}
            {details.length > 0 && <span className={styles['clipDetails']}>{details.join(' · ')}</span>}
          </span>
        </div>

        {selected != null && (
          <button
            type="button"
            role="checkbox"
            aria-checked={ticked}
            className={[styles['includeToggle'], ...(ticked ? [styles['includeToggleOn']] : [])].join(' ')}
            title={noneTicked
              ? t('All clips are exported while none is ticked')
              : (ticked ? t('Included in the export') : t('Left out of the export'))}
            aria-label={t('Include in export')}
            onClick={onToggleSegmentSelectedClick}
          >
            {ticked && <FiCheck aria-hidden />}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setRef}
      role="button"
      onClick={handleSegmentClick}
      onDoubleClick={onDoubleClick}
      style={style}
      className="segment-list-entry"
    >
      <div
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...sortable.attributes}
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...sortable.listeners}
        role="button"
        tabIndex={-1}
        style={{ cursor, color: 'var(--gray-12)', marginBottom: duration != null ? '.15em' : undefined, display: 'flex', alignItems: 'center', minHeight: simpleMode ? '1.55rem' : '1em' }}
        onClick={handleDraggableClick}
      >
        {renderNumber()}
        <span style={{ cursor, fontSize: simpleMode ? '.92rem' : `${Math.min(1, 26 / timeStr.length) * 0.75}em`, whiteSpace: 'nowrap', fontWeight: simpleMode ? 700 : undefined, fontVariantNumeric: 'tabular-nums', letterSpacing: simpleMode ? '-.01em' : undefined }}>{timeStr}</span>
      </div>

      {'name' in seg && seg.name && <span style={{ fontSize: simpleMode ? '.82em' : '.75em', color: simpleMode ? 'var(--gray-11)' : primaryTextColor, marginRight: '.3em', display: 'block', marginTop: duration != null ? '.26rem' : 0, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seg.name}</span>}
      {!simpleMode && Object.entries(tags).map(([name, value]) => (
        <span style={{ fontSize: '.7em', backgroundColor: 'var(--gray-5)', color: 'var(--gray-12)', borderRadius: '.4em', padding: '0 .2em', marginRight: '.1em' }} key={name}>{name}:<b>{value}</b></span>
      ))}

      {duration != null && (
        <>
          <div style={{ fontSize: simpleMode ? '.82em' : '.75em', marginTop: simpleMode ? '.32rem' : 0, color: simpleMode ? 'var(--gray-10)' : undefined, lineHeight: 1.35 }}>
            {simpleMode ? formatClipLength(duration) : `${t('Duration')} ${formatTimecode({ seconds: duration, shorten: true })}`}
            {getSegmentSpeed(seg) !== 1 && <span> · {Math.round(getSegmentSpeed(seg) * 100)}%</span>}
            {/* Advanced mode shows the size on the ms/frames line below, so only once. */}
            {simpleMode && estimatedSize != null && (
              <span> · ~{prettyBytes(estimatedSize, { space: true, maximumFractionDigits: 1, minimumFractionDigits: 0 })}</span>
            )}
          </div>
          {!simpleMode && (
            <div style={{ fontSize: '.75em' }}>
              <Trans>{{ durationMsFormatted: Math.floor(duration * 1000) }} ms</Trans>
              <span>, <Trans>{{ frameCount: (duration && getFrameCount(duration)) ?? '?' }} frames</Trans></span>
              {estimatedSize != null && (
                <span style={{ fontSize: '.9em' }}>
                  , ~{prettyBytes(estimatedSize, { space: false, maximumFractionDigits: 1, minimumFractionDigits: 0 })}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {!invertCutSegments && selected != null && (
        <div style={{ position: 'absolute', right: 3, bottom: 3 }}>
          <CheckIcon className="selected" size={20} color="var(--gray-12)" onClick={onToggleSegmentSelectedClick} />
        </div>
      )}
    </div>
  );
});

function SegmentList({
  width,
  fileDuration,
  formatTimecode,
  cutSegments,
  inverseCutSegments,
  getFrameCount,
  onSegClick,
  currentSegIndex,
  updateSegOrder,
  updateSegOrders,
  addSegment,
  removeSegment,
  onRemoveSelected,
  onLabelSegment,
  currentCutSeg,
  firstSegmentAtCursor,
  toggleSegmentsList,
  splitCurrentSegment,
  selectedSegments,
  onSelectSingleSegment,
  onToggleSegmentSelected,
  onDeselectAllSegments,
  onSelectAllSegments,
  onSelectSegmentsByLabel,
  onSelectSegmentsByExpr,
  onMutateSegmentsByExpr,
  onSelectAllMarkers,
  onExtractSegmentsFramesAsImages,
  onExtractSelectedSegmentsFramesAsImages,
  onLabelSelectedSegments,
  onInvertSelectedSegments,
  onDuplicateSegmentClick,
  jumpSegStart,
  jumpSegEnd,
  updateSegAtIndex,
  editingSegmentTags,
  editingSegmentTagsSegmentIndex,
  setEditingSegmentTags,
  setEditingSegmentTagsSegmentIndex,
  onEditSegmentTags,
  getSegEstimatedSize,
  onEditSpeed, onEditCrop, maxLabelLength,
  renamingSegId, setRenamingSegId,
  pickedClipIds, onPickClipsInBox, onStartOver, animated,
}: {
  width: number,
  /** Shown or hidden by the user (not by opening a recording): it slides, and the editor widens or narrows with it. */
  animated: boolean,
  fileDuration: number | undefined,
  formatTimecode: FormatTimecode,
  cutSegments: StateSegment[],
  inverseCutSegments: InverseCutSegment[],
  getFrameCount: GetFrameCount,
  onSegClick: (index: number, how?: PickHow) => void,
  currentSegIndex: number,
  updateSegOrder: UseSegments['updateSegOrder'],
  updateSegOrders: UseSegments['updateSegOrders'],
  addSegment: UseSegments['addSegment'],
  removeSegment: UseSegments['removeSegment'],
  onRemoveSelected: UseSegments['removeSelectedSegments'],
  onLabelSegment: UseSegments['labelSegment'],
  currentCutSeg: UseSegments['currentCutSeg'],
  firstSegmentAtCursor: StateSegment | undefined,
  toggleSegmentsList: () => void,
  splitCurrentSegment: UseSegments['splitCurrentSegment'],
  selectedSegments: DefiniteSegmentBase[],
  onSelectSingleSegment: UseSegments['selectOnlySegment'],
  onToggleSegmentSelected: UseSegments['toggleSegmentSelected'],
  onDeselectAllSegments: UseSegments['deselectAllSegments'],
  onSelectAllSegments: UseSegments['selectAllSegments'],
  onSelectSegmentsByLabel: UseSegments['selectSegmentsByLabel'],
  onSelectSegmentsByExpr: UseSegments['selectSegmentsByExpr'],
  onSelectAllMarkers: UseSegments['selectAllMarkers'],
  onMutateSegmentsByExpr: UseSegments['mutateSegmentsByExpr'],
  onExtractSegmentsFramesAsImages: (segments: Pick<SegmentBase, 'start' | 'end'>[]) => Promise<void>,
  onExtractSelectedSegmentsFramesAsImages: () => void,
  onLabelSelectedSegments: UseSegments['labelSelectedSegments'],
  onInvertSelectedSegments: UseSegments['invertSelectedSegments'],
  onDuplicateSegmentClick: UseSegments['duplicateSegment'],
  jumpSegStart: (index: number) => void,
  jumpSegEnd: (index: number) => void,
  updateSegAtIndex: UseSegments['updateSegAtIndex'],
  editingSegmentTags: SegmentTags | undefined,
  editingSegmentTagsSegmentIndex: number | undefined,
  setEditingSegmentTags: Dispatch<SetStateAction<SegmentTags | undefined>>,
  setEditingSegmentTagsSegmentIndex: Dispatch<SetStateAction<number | undefined>>,
  onEditSegmentTags: (index: number) => void,
  getSegEstimatedSize: UseSegments['getSegEstimatedSize'],
  onEditSpeed: (segmentIndex: number) => void,
  onEditCrop: (segmentIndex: number) => void,
  maxLabelLength: number,
  /** The clip whose name is being edited in place. Held by the app, so "Rename clip…" in the menu can start it too. */
  renamingSegId: string | undefined,
  setRenamingSegId: Dispatch<SetStateAction<string | undefined>>,
  /** The clips picked for Delete, beside the selected one. */
  pickedClipIds: readonly string[],
  /** A selection box touched these clips (added to `before`, what was picked when it started, with Ctrl). */
  onPickClipsInBox: (touched: readonly string[], additive: boolean, before: readonly string[]) => void,
  onStartOver: () => void,
}) {
  const { t } = useTranslation();
  const { getSegColor, nextSegColorIndex } = useSegColors();

  // Looked up by id, since a clip's position can change while its name is being edited.
  const onFinishRename = useCallback((segId: string, newName: string | undefined) => {
    setRenamingSegId((current) => (current === segId ? undefined : current));
    if (newName == null) return;
    const index = cutSegments.findIndex((seg) => seg.segId === segId);
    const existing = cutSegments[index];
    if (existing != null && newName !== (existing.name ?? '')) updateSegAtIndex(index, { name: newName });
  }, [cutSegments, setRenamingSegId, updateSegAtIndex]);
  const [draggingId, setDraggingId] = useState<UniqueIdentifier | undefined>();

  const { invertCutSegments, simpleMode, darkMode } = useUserSettings();
  const reducedMotion = useReducedMotionConfig();

  const getButtonColor = useCallback((seg: SegmentColorIndex | undefined, next?: boolean) => getSegColor(seg ? { segColorIndex: next ? seg.segColorIndex + 1 : seg.segColorIndex } : undefined).desaturate(0.3).lightness(darkMode ? 45 : 55).string(), [darkMode, getSegColor]);
  const currentSegColor = useMemo(() => getButtonColor(currentCutSeg), [currentCutSeg, getButtonColor]);
  const segAtCursorColor = useMemo(() => getButtonColor(firstSegmentAtCursor), [getButtonColor, firstSegmentAtCursor]);
  const nextSegmentColor = useMemo(() => getButtonColor({ segColorIndex: nextSegColorIndex }, false), [getButtonColor, nextSegColorIndex]);

  const segmentsTotal = useMemo(() => getSegmentsTotalDuration(
    selectedSegments.length > 0 ? selectedSegments : cutSegments.filter((segment) => segment.initial),
    fileDuration,
  ), [selectedSegments, cutSegments, fileDuration]);

  const segmentsOrInverse: (InverseCutSegment | StateSegment)[] = invertCutSegments ? inverseCutSegments : cutSegments;
  // With no clip ticked, the export falls back to all of them (useSegments).
  const noneTicked = !invertCutSegments && cutSegments.some((seg) => seg.end != null) && cutSegments.every((seg) => seg.end == null || !seg.selected);
  // Counted from the clips themselves: `selectedSegments` leaves out the whole-file clip a new file starts with,
  // which would read "0 of 1" while that clip is ticked. Markers aren't clips, so they don't count either.
  const { clipCount, tickedCount } = useMemo(() => {
    const clips = cutSegments.filter((seg) => seg.end != null);
    return { clipCount: clips.length, tickedCount: clips.filter((seg) => seg.selected).length };
  }, [cutSegments]);

  const sortableList = useMemo(() => segmentsOrInverse.map((seg) => ({ id: seg.segId, seg })), [segmentsOrInverse]);

  const renamingIndex = renamingSegId != null ? sortableList.findIndex((item) => item.id === renamingSegId) : -1;

  // The clip went away (removed, file closed), so don't bring it back mid-rename if an undo restores it.
  useEffect(() => {
    if (renamingSegId != null && renamingIndex === -1) setRenamingSegId(undefined);
  }, [renamingIndex, renamingSegId, setRenamingSegId]);

  // Keep the row being renamed rendered when it scrolls out of view, so what was typed isn't lost.
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range);
    if (renamingIndex === -1 || indexes.includes(renamingIndex)) return indexes;
    return [...indexes, renamingIndex].sort((a, b) => a - b);
  }, [renamingIndex]);

  function getHeader() {
    if (segmentsOrInverse.length === 0) {
      if (invertCutSegments) {
        return (
          <Trans>You have enabled the &quot;invert segments&quot; mode <FaYinYang style={{ verticalAlign: 'middle' }} /> which will cut away selected segments instead of keeping them. But there is no space between any segments, or at least two segments are overlapping. This would not produce any output. Either make room between segments or click the Yinyang <FaYinYang style={{ verticalAlign: 'middle' }} /> symbol below to disable this mode. Alternatively you may combine overlapping segments from the menu.</Trans>
        );
      }
      return simpleMode ? t('Press I to start a clip and O to end it, or right-click the timeline.') : t('Set a start and end point to create your first clip.');
    }

    if (segmentsOrInverse.every((s) => s.end == null)) {
      return t('{{count}} markers', { count: segmentsOrInverse.length });
    }
    if (noneTicked) {
      return t('None ticked, so all clips are exported');
    }
    if (!invertCutSegments && tickedCount < clipCount) {
      return t('{{selected}} of {{count}} in the export', { selected: tickedCount, count: clipCount });
    }
    return t('{{count}} clips', { count: invertCutSegments ? segmentsOrInverse.length : clipCount });
  }

  const onReorderSegs = useCallback(async (index: number) => {
    if (cutSegments.length < 2) return;
    const { value } = await getSwal().Swal.fire({
      title: `${t('Change order of segment')} ${index + 1}`,
      text: t('Please enter a number from 1 to {{n}} to be the new order for the current segment', { n: cutSegments.length }),
      input: 'text',
      inputValue: index + 1,
      showCancelButton: true,
      inputValidator: (v) => {
        const parsed = parseInt(v, 10);
        return Number.isNaN(parsed) || parsed > cutSegments.length || parsed < 1 ? t('Invalid number entered') : undefined;
      },
    });

    if (value) {
      const newOrder = parseInt(value, 10);
      updateSegOrder(index, newOrder - 1);
    }
  }, [cutSegments.length, t, updateSegOrder]);

  function renderFooter() {
    return (
      <>
        {!simpleMode && (
          <div style={{ display: 'flex', padding: '5px 0', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--gray-6)' }}>
            <FaPlus
              size={24}
              style={{ ...buttonBaseStyle, background: nextSegmentColor }}
              role="button"
              title={t('Add segment')}
              onClick={addSegment}
            />

            <FaMinus
              size={24}
              style={{ ...buttonBaseStyle, ...(cutSegments.length > 0 ? { backgroundColor: currentSegColor } : disabledButtonStyle) }}
              role="button"
              title={t('Remove cutpoint from segment {{segmentNumber}}', { segmentNumber: currentSegIndex + 1 })}
              onClick={() => removeSegment(currentSegIndex)}
            />

            {!invertCutSegments && (
              <>
                <FaSortNumericDown
                  size={16}
                  title={t('Change segment order')}
                  role="button"
                  style={{ ...buttonBaseStyle, padding: 4, ...(cutSegments.length >= 2 ? { backgroundColor: currentSegColor } : disabledButtonStyle) }}
                  onClick={() => onReorderSegs(currentSegIndex)}
                />

                <FaTag
                  size={16}
                  title={t('Label segment')}
                  role="button"
                  style={{ ...buttonBaseStyle, padding: 4, ...(cutSegments.length > 0 ? { backgroundColor: currentSegColor } : disabledButtonStyle) }}
                  onClick={() => onLabelSegment(currentSegIndex)}
                />
              </>
            )}

            <AiOutlineSplitCells
              size={22}
              title={t('Split segment at cursor')}
              role="button"
              style={{ ...buttonBaseStyle, padding: 1, ...(firstSegmentAtCursor ? { backgroundColor: segAtCursorColor } : disabledButtonStyle) }}
              onClick={splitCurrentSegment}
            />

            {!invertCutSegments && (
              <FaRegCheckCircle
                size={22}
                title={t('Invert segment selection')}
                role="button"
                style={{ ...buttonBaseStyle, padding: 1, ...(cutSegments.length > 0 ? { backgroundColor: neutralButtonColor } : disabledButtonStyle) }}
                onClick={onInvertSelectedSegments}
              />
            )}
          </div>
        )}

        <div className={styles['footer']}>
          <div className={styles['footerLabel']}>{simpleMode ? t('Export length') : t('Segments total')}</div>
          <div className={styles['footerValue']}>{simpleMode ? formatClipLength(segmentsTotal) : formatTimecode({ seconds: segmentsTotal })}</div>
        </div>
      </>
    );
  }

  const [editingTag, setEditingTag] = useState<string>();

  const onTagsChange = useCallback((keyValues: Record<string, string>) => setEditingSegmentTags((existingTags) => ({
    ...existingTags,
    ...keyValues,
  })), [setEditingSegmentTags]);

  const onTagReset = useCallback((tag: string) => setEditingSegmentTags((tags) => {
    invariant(tags != null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [tag]: _deleted, ...rest } = tags;
    return rest;
  }), [setEditingSegmentTags]);

  const onSegmentTagsCloseComplete = useCallback(() => {
    setEditingSegmentTagsSegmentIndex(undefined);
    setEditingSegmentTags(undefined);
  }, [setEditingSegmentTags, setEditingSegmentTagsSegmentIndex]);

  const onSegmentTagsConfirm = useCallback(() => {
    invariant(editingSegmentTagsSegmentIndex != null);
    updateSegAtIndex(editingSegmentTagsSegmentIndex, { tags: editingSegmentTags });
    onSegmentTagsCloseComplete();
  }, [editingSegmentTags, editingSegmentTagsSegmentIndex, onSegmentTagsCloseComplete, updateSegAtIndex]);

  const scrollerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 10,
    },
  }));

  const rowVirtualizer = useVirtualizer({
    count: sortableList.length,
    gap: simpleMode ? 4 : 7,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => (simpleMode ? 52 : 66), // measured afterwards; only the first layout uses this
    overscan: 5,
    getItemKey: (index) => sortableList[index]!.id,
    rangeExtractor,
    // Room above the first row and below the last for the selected card's glow and focus rings, also when
    // scrolling to a clip.
    paddingStart: listEdgeRoom,
    paddingEnd: listEdgeRoom,
    scrollPaddingStart: listEdgeRoom,
    scrollPaddingEnd: listEdgeRoom,
  });

  // A selection box, dragged from empty room in the list (a card drags to reorder): it picks the clips it touches, live,
  // added to those already picked with Ctrl. In the list's own coordinates, so it scrolls with it.
  const rowsRef = useRef<HTMLDivElement>(null);
  const boxStartRef = useRef<{ x: number, y: number, additive: boolean, before: readonly string[], moved: boolean }>();
  const [selectionBox, setSelectionBox] = useState<{ left: number, top: number, width: number, height: number }>();
  const canPick = simpleMode && !invertCutSegments;
  const toListPoint = (scroller: HTMLElement, e: { clientX: number, clientY: number }) => {
    const rect = scroller.getBoundingClientRect();
    return { x: e.clientX - rect.left + scroller.scrollLeft, y: e.clientY - rect.top + scroller.scrollTop };
  };
  const onListPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!canPick || e.button !== 0 || scroller == null || (e.target !== scroller && e.target !== rowsRef.current)) return;
    // Not on the scroll bar.
    if (e.clientX >= scroller.getBoundingClientRect().left + scroller.clientWidth) return;
    // A click here ends a rename like a click anywhere else (keeping the text from being selected also keeps focus).
    const { activeElement } = document;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) activeElement.blur();
    e.preventDefault();
    scroller.setPointerCapture(e.pointerId);
    boxStartRef.current = { ...toListPoint(scroller, e), additive: e.ctrlKey || e.metaKey, before: pickedClipIds, moved: false };
  };
  const onListPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = boxStartRef.current;
    const scroller = scrollerRef.current;
    if (start == null || scroller == null) return;
    // Near the top or bottom: the list scrolls on.
    const rect = scroller.getBoundingClientRect();
    if (e.clientY < rect.top + 20) scroller.scrollTop -= 12;
    else if (e.clientY > rect.bottom - 20) scroller.scrollTop += 12;
    const point = toListPoint(scroller, e);
    if (!start.moved && Math.hypot(point.x - start.x, point.y - start.y) < 4) return;
    start.moved = true;
    const top = Math.min(start.y, point.y);
    const bottom = Math.max(start.y, point.y);
    setSelectionBox({ left: Math.min(start.x, point.x), top, width: Math.abs(point.x - start.x), height: bottom - top });
    // Rows sit in the list at their measured places (below the rows' own offset), shown or not.
    const rowsTop = rowsRef.current?.offsetTop ?? 0;
    const touched = rowVirtualizer.measurementsCache
      .filter((row) => rowsTop + row.end > top && rowsTop + row.start < bottom)
      .flatMap((row) => (sortableList[row.index] != null ? [sortableList[row.index]!.id] : []));
    onPickClipsInBox(touched, start.additive, start.before);
  };
  const onListPointerUp = () => {
    const start = boxStartRef.current;
    if (start == null) return;
    boxStartRef.current = undefined;
    setSelectionBox(undefined);
    // A click on empty room, as on a desktop: nothing picked any more (with Ctrl, as it was).
    if (!start.moved && !start.additive) onPickClipsInBox([], false, []);
  };

  useEffect(() => {
    if (invertCutSegments) return;
    rowVirtualizer.scrollToIndex(currentSegIndex, { behavior: 'smooth', align: 'auto' });
  }, [currentSegIndex, invertCutSegments, rowVirtualizer]);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(undefined);
    const { active, over } = event;
    if (over != null && active.id !== over?.id) {
      const ids = sortableList.map((s) => s.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newList = arrayMove(sortableList, oldIndex, newIndex);
      updateSegOrders(newList.map((item) => item.id));
    }
  };

  const draggingSeg = useMemo(() => sortableList.find((s) => s.id === draggingId), [sortableList, draggingId]);

  function renderSegment({ seg, index, selected, isActive, dragging }: {
    seg: StateSegment | InverseCutSegment,
    index: number,
    selected?: boolean,
    isActive?: boolean,
    dragging?: boolean,
  }) {
    return (
      <Segment
        seg={seg}
        index={index}
        isActive={isActive}
        picked={pickedClipIds.includes(seg.segId)}
        dragging={dragging}
        selected={selected}
        onClick={onSegClick}
        addSegment={addSegment}
        onRemoveSelected={onRemoveSelected}
        onRemovePress={removeSegment}
        onReorderPress={onReorderSegs}
        onLabelPress={onLabelSegment}
        jumpSegStart={jumpSegStart}
        jumpSegEnd={jumpSegEnd}
        updateSegOrder={updateSegOrder}
        getFrameCount={getFrameCount}
        formatTimecode={formatTimecode}
        onSelectSingleSegment={onSelectSingleSegment}
        onToggleSegmentSelected={onToggleSegmentSelected}
        onDeselectAllSegments={onDeselectAllSegments}
        onSelectAllSegments={onSelectAllSegments}
        onEditSegmentTags={onEditSegmentTags}
        onSelectSegmentsByLabel={onSelectSegmentsByLabel}
        onSelectSegmentsByExpr={onSelectSegmentsByExpr}
        onMutateSegmentsByExpr={onMutateSegmentsByExpr}
        onExtractSegmentsFramesAsImages={onExtractSegmentsFramesAsImages}
        onExtractSelectedSegmentsFramesAsImages={onExtractSelectedSegmentsFramesAsImages}
        onLabelSelectedSegments={onLabelSelectedSegments}
        onSelectAllMarkers={onSelectAllMarkers}
        onInvertSelectedSegments={onInvertSelectedSegments}
        onDuplicateSegmentClick={onDuplicateSegmentClick}
        getSegEstimatedSize={getSegEstimatedSize}
        onEditSpeed={onEditSpeed}
        onEditCrop={onEditCrop}
        noneTicked={noneTicked}
        renaming={!dragging && seg.segId === renamingSegId}
        onStartRename={setRenamingSegId}
        onFinishRename={onFinishRename}
        maxLabelLength={maxLabelLength}
      />
    );
  }

  return (
    <>
      <Dialog.Root open={editingSegmentTagsSegmentIndex != null} onOpenChange={(open) => !open && onSegmentTagsCloseComplete()}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content style={{ width: '40em' }} aria-describedby={undefined}>
            <Dialog.Title>{t('Edit segment tags')}</Dialog.Title>

            <TagEditor customTags={editingSegmentTags} editingTag={editingTag} setEditingTag={setEditingTag} onTagsChange={onTagsChange} onTagReset={onTagReset} addTagTitle={t('Add segment tag')} />

            <Dialog.ButtonRow>
              <DialogButton onClick={onSegmentTagsConfirm} disabled={editingTag != null} primary>
                <FaSave style={{ verticalAlign: 'baseline', fontSize: '.8em', marginRight: '.3em' }} />
                {t('Save')}
              </DialogButton>
            </Dialog.ButtonRow>

            <Dialog.CloseButton />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* The slot's width goes to nothing (and the gap before it with it), so the preview and the timeline widen as
          the panel slides off to the right, in step; the panel inside keeps its width and is cut off at the edge. */}
      <motion.div
        className={styles['panelSlot']}
        custom={animated}
        variants={panelSlotVariants}
        initial={animated ? 'hidden' : false}
        animate={{ width, marginLeft: '0rem', transition: reducedMotion ? { duration: 0 } : panelSlideTransition }}
        exit="hidden"
      >
        <div className={styles['panel']} style={{ width, transition: darkModeTransition }}>
          <div className={`no-user-select ${styles['header']}`}>
            <div style={{ minWidth: 0 }}>
              <div className={styles['headerTitle']}>{simpleMode ? t('Clips') : t('Segments')}</div>
              <div className={styles['headerSubtitle']}>{getHeader()}</div>
            </div>

            <div className={styles['headerActions']}>
              {simpleMode && (
              <button
                type="button"
                className={styles['headerClose']}
                title={t('More')}
                aria-haspopup="menu"
                onClick={(e) => openMenu({
                  at: e.currentTarget,
                  keyboard: e.detail === 0,
                  items: [
                    { label: t('Include all clips'), click: () => onSelectAllSegments() },
                    { type: 'separator' },
                    // No asking: Ctrl+Z, and a backup copy of the saved edits, bring it all back.
                    { label: t('Start over'), danger: true, click: onStartOver },
                  ],
                })}
              >
                <FiMoreHorizontal aria-hidden />
              </button>
              )}
              {/* It moves off to the right: the tab at the window's edge brings it back. */}
              <button type="button" className={styles['headerClose']} title={t('Hide the clips panel')} onClick={toggleSegmentsList}>
                <LuPanelRightClose aria-hidden />
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={sortableList} strategy={verticalListSortingStrategy}>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                ref={scrollerRef}
                className={`consistent-scrollbar ${styles['scroller']}`}
                onPointerDown={onListPointerDown}
                onPointerMove={onListPointerMove}
                onPointerUp={onListPointerUp}
                onPointerCancel={onListPointerUp}
              >
                {selectionBox != null && <div className={styles['selectionBox']} style={selectionBox} aria-hidden />}
                <div ref={rowsRef} className={styles['rows']} style={{ height: rowVirtualizer.getTotalSize() }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const { id, seg } = sortableList[virtualRow.index]!;
                    const selected = 'selected' in seg ? seg.selected : true;
                    const isActive = !invertCutSegments && currentSegIndex === virtualRow.index;

                    return (
                      <div
                        key={id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {renderSegment({ seg, index: virtualRow.index, selected, isActive })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </SortableContext>

            <DragOverlay>
              {draggingSeg ? renderSegment({ seg: draggingSeg.seg, index: sortableList.indexOf(draggingSeg), dragging: true }) : null}
            </DragOverlay>
          </DndContext>

          {renderFooter()}
        </div>
      </motion.div>
    </>
  );
}

export default memo(SegmentList);
