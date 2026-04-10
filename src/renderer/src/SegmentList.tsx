import type { SetStateAction, Dispatch, MouseEventHandler, CSSProperties } from 'react';
import { memo, useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { FaYinYang, FaSave, FaPlus, FaMinus, FaTag, FaSortNumericDown, FaRegCheckCircle, FaRegCircle, FaTimes } from 'react-icons/fa';
import { AiOutlineSplitCells } from 'react-icons/ai';
import { motion } from 'motion/react';
import { useTranslation, Trans } from 'react-i18next';
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CSS } from '@dnd-kit/utilities';
import invariant from 'tiny-invariant';
import prettyBytes from 'pretty-bytes';

import useContextMenu from './hooks/useContextMenu';
import useUserSettings from './hooks/useUserSettings';
import { saveColor, controlsBackground, primaryTextColor, darkModeTransition } from './colors';
import { useSegColors } from './contexts';
import { getSegmentTags } from './segments';
import TagEditor from './components/TagEditor';
import type { ContextMenuTemplate, DefiniteSegmentBase, FormatTimecode, GetFrameCount, InverseCutSegment, SegmentBase, SegmentColorIndex, SegmentTags, StateSegment } from './types';
import type { UseSegments } from './hooks/useSegments';
import * as Dialog from './components/Dialog';
import { DialogButton } from './components/Button';
import getSwal from './swal';


const buttonBaseStyle: CSSProperties = {
  margin: '0 3px', borderRadius: 3, color: 'white', cursor: 'pointer', userSelect: 'none',
};

const disabledButtonStyle = { color: 'var(--gray-10)', backgroundColor: 'var(--gray-6)' };
const neutralButtonColor = 'var(--gray-9)';

function padSimpleTime(value: number) {
  return String(value).padStart(2, '0');
}

function formatSimpleTimestamp(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}:${padSimpleTime(minutes)}:${padSimpleTime(secs)}`;
  return `${padSimpleTime(minutes)}:${padSimpleTime(secs)}`;
}

function formatSimpleDuration(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)} sec`;

  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const secs = roundedSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (secs === 0) return `${minutes} min`;
  return `${minutes}m ${secs}s`;
}

// eslint-disable-next-line react/display-name
const Segment = memo(({
  seg,
  index,
  isActive,
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
}: {
  seg: StateSegment | InverseCutSegment,
  index: number,
  isActive?: boolean | undefined,
  dragging?: boolean | undefined,
  formatTimecode: FormatTimecode,
  getFrameCount: GetFrameCount,
  updateSegOrder: UseSegments['updateSegOrder'],
  onClick: (i: number) => void,
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
}) => {
  const { invertCutSegments, darkMode, simpleMode } = useUserSettings();
  const { t } = useTranslation();
  const { getSegColor } = useSegColors();

  const ref = useRef<HTMLDivElement | null>(null);

  const contextMenuTemplate = useMemo<ContextMenuTemplate>(() => {
    if (invertCutSegments) return [];

    const updateOrder = (dir: number) => updateSegOrder(index, index + dir);

    return [
      { label: t('Jump to start time'), click: () => jumpSegStart(index) },
      { label: t('Jump to end time'), click: () => jumpSegEnd(index) },

      { type: 'separator' },

      { label: t('Add segment'), click: addSegment },
      { label: t('Label segment'), click: () => onLabelPress(index) },
      { label: t('Remove segment'), click: () => onRemovePress(index) },
      { label: t('Duplicate segment'), click: () => onDuplicateSegmentClick(seg) },

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
  }, [invertCutSegments, t, addSegment, onLabelSelectedSegments, onRemoveSelected, onExtractSelectedSegmentsFramesAsImages, updateSegOrder, index, jumpSegStart, jumpSegEnd, onLabelPress, onRemovePress, onDuplicateSegmentClick, seg, onSelectSingleSegment, onSelectAllSegments, onDeselectAllSegments, onSelectAllMarkers, onSelectSegmentsByLabel, onSelectSegmentsByExpr, onInvertSelectedSegments, onMutateSegmentsByExpr, onReorderPress, onEditSegmentTags, onExtractSegmentsFramesAsImages]);

  useContextMenu(ref, contextMenuTemplate);

  const duration = useMemo(() => (seg.end == null ? undefined : seg.end - seg.start), [seg]);
  const estimatedSize = useMemo(() => getSegEstimatedSize(seg), [getSegEstimatedSize, seg]);

  const timeStr = useMemo(() => (
    simpleMode
      ? (seg.end == null
        ? formatSimpleTimestamp(seg.start)
        : `${formatSimpleTimestamp(seg.start)} - ${formatSimpleTimestamp(seg.end)}`)
      : (seg.end == null
        ? formatTimecode({ seconds: seg.start })
        : `${formatTimecode({ seconds: seg.start })} - ${formatTimecode({ seconds: seg.end })}`)
  ), [formatTimecode, seg, simpleMode]);

  function renderNumber() {
    if (simpleMode) {
      return (
        <b style={{ color: 'var(--gray-12)', padding: '0 .42em', minWidth: '1.55rem', height: '1.55rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: '.5em', background: 'color-mix(in srgb, var(--gray-5) 82%, transparent)', border: '1px solid color-mix(in srgb, var(--gray-8) 26%, transparent)', borderRadius: '999px', fontSize: '.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
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
    if (!invertCutSegments) onClick(index);
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
      padding: simpleMode ? '.68rem .75rem' : '3px 5px',
      margin: simpleMode ? '3px 0' : '1px 0',
      boxSizing: 'border-box',
      originY: 0,
      position: 'relative',
      transform: CSS.Transform.toString(sortable.transform),
      transition: transitions.length > 0 ? transitions.join(', ') : undefined,
      background: simpleMode ? 'color-mix(in srgb, var(--gray-1) 88%, transparent)' : 'var(--gray-1)',
      border: `1px solid ${isActive ? 'var(--gray-10)' : (simpleMode ? 'color-mix(in srgb, var(--gray-8) 24%, transparent)' : 'transparent')}`,
      borderRadius: simpleMode ? 12 : 5,
      opacity: !selected && !invertCutSegments ? (simpleMode ? 0.92 : 0.5) : undefined,
      boxShadow: simpleMode ? '0 1px 0 rgba(255, 255, 255, 0.03)' : undefined,
    };
  }, [invertCutSegments, isActive, selected, simpleMode, sortable.isDragging, sortable.transform, sortable.transition]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    sortable.setNodeRef(node);
    ref.current = node;
  }, [sortable]);

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

      {'name' in seg && seg.name && <span style={{ fontSize: simpleMode ? '.8em' : '.75em', color: primaryTextColor, marginRight: '.3em', display: 'block', marginTop: duration != null ? '.22rem' : 0, lineHeight: 1.35 }}>{seg.name}</span>}
      {!simpleMode && Object.entries(tags).map(([name, value]) => (
        <span style={{ fontSize: '.7em', backgroundColor: 'var(--gray-5)', color: 'var(--gray-12)', borderRadius: '.4em', padding: '0 .2em', marginRight: '.1em' }} key={name}>{name}:<b>{value}</b></span>
      ))}

      {duration != null && (
        <>
          <div style={{ fontSize: simpleMode ? '.82em' : '.75em', marginTop: simpleMode ? '.32rem' : 0, color: simpleMode ? 'var(--gray-10)' : undefined, lineHeight: 1.35 }}>
            {simpleMode ? formatSimpleDuration(duration) : `${t('Duration')} ${formatTimecode({ seconds: duration, shorten: true })}`}
            {estimatedSize != null && (
              <span style={{ fontSize: simpleMode ? '1em' : '.9em' }}>
                {simpleMode ? ' | ~' : ', ~'}
                {prettyBytes(estimatedSize, { space: false, maximumFractionDigits: 1, minimumFractionDigits: 0 })}
              </span>
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
}: {
  width: number,
  formatTimecode: FormatTimecode,
  cutSegments: StateSegment[],
  inverseCutSegments: InverseCutSegment[],
  getFrameCount: GetFrameCount,
  onSegClick: (index: number) => void,
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
}) {
  const { t } = useTranslation();
  const { getSegColor, nextSegColorIndex } = useSegColors();
  const [draggingId, setDraggingId] = useState<UniqueIdentifier | undefined>();

  const { invertCutSegments, simpleMode, darkMode, springAnimation } = useUserSettings();

  const getButtonColor = useCallback((seg: SegmentColorIndex | undefined, next?: boolean) => getSegColor(seg ? { segColorIndex: next ? seg.segColorIndex + 1 : seg.segColorIndex } : undefined).desaturate(0.3).lightness(darkMode ? 45 : 55).string(), [darkMode, getSegColor]);
  const currentSegColor = useMemo(() => getButtonColor(currentCutSeg), [currentCutSeg, getButtonColor]);
  const segAtCursorColor = useMemo(() => getButtonColor(firstSegmentAtCursor), [getButtonColor, firstSegmentAtCursor]);
  const nextSegmentColor = useMemo(() => getButtonColor({ segColorIndex: nextSegColorIndex }, false), [getButtonColor, nextSegColorIndex]);

  const segmentsTotal = useMemo(() => selectedSegments.reduce((acc, seg) => (seg.end == null ? 0 : seg.end - seg.start) + acc, 0), [selectedSegments]);

  const segmentsOrInverse: (InverseCutSegment | StateSegment)[] = invertCutSegments ? inverseCutSegments : cutSegments;

  const sortableList = useMemo(() => segmentsOrInverse.map((seg) => ({ id: seg.segId, seg })), [segmentsOrInverse]);

  function getHeader() {
    if (segmentsOrInverse.length === 0) {
      if (invertCutSegments) {
        return (
          <Trans>You have enabled the &quot;invert segments&quot; mode <FaYinYang style={{ verticalAlign: 'middle' }} /> which will cut away selected segments instead of keeping them. But there is no space between any segments, or at least two segments are overlapping. This would not produce any output. Either make room between segments or click the Yinyang <FaYinYang style={{ verticalAlign: 'middle' }} /> symbol below to disable this mode. Alternatively you may combine overlapping segments from the menu.</Trans>
        );
      }
      return t('Set a start and end point to create your first clip.');
    }

    if (segmentsOrInverse.every((s) => s.end == null)) {
      return t('{{count}} markers ready', { count: segmentsOrInverse.length });
    }
    return t('{{count}} clips ready', { count: segmentsOrInverse.length });
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

        <div style={{ padding: '.8rem 1rem .85rem', boxSizing: 'border-box', borderBottom: '1px solid var(--gray-6)', borderTop: '1px solid var(--gray-6)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', fontSize: '.8em', background: 'color-mix(in srgb, var(--gray-2) 76%, transparent)' }}>
          <div style={{ color: 'var(--gray-10)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('Segments total')}</div>
          <div style={{ color: 'var(--gray-12)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: '.98rem', lineHeight: 1 }}>{formatTimecode({ seconds: segmentsTotal })}</div>
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
    gap: 7,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 66, // todo this probably needs to be changed if the segment height changes
    overscan: 5,
    getItemKey: (index) => sortableList[index]!.id,
  });

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

      <motion.div
        style={{ width, background: controlsBackground, borderLeft: '1px solid var(--gray-7)', color: 'var(--gray-11)', transition: darkModeTransition, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '1.6rem', border: '1px solid color-mix(in srgb, var(--gray-8) 36%, transparent)', boxShadow: '0 18px 42px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        initial={{ x: width }}
        animate={{ x: 0 }}
        exit={{ x: width }}
        transition={springAnimation}
      >
        <div style={{ padding: '.9rem 1rem .7rem', color: 'var(--gray-12)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.8rem' }} className="no-user-select">
          <div>
            <div style={{ color: 'var(--gray-12)', fontSize: '1rem', fontWeight: 800, lineHeight: 1.15 }}>{t('Clips')}</div>
            <div style={{ color: 'var(--gray-10)', fontSize: '.8rem', lineHeight: 1.35, marginTop: '.18rem' }}>{getHeader()}</div>
          </div>

          <FaTimes
            title={t('Close clips panel')}
            style={{ fontSize: '1.1em', verticalAlign: 'middle', color: 'var(--gray-11)', cursor: 'pointer', padding: '.4em', borderRadius: '999px', background: 'color-mix(in srgb, var(--gray-3) 70%, transparent)' }}
            role="button"
            onClick={toggleSegmentsList}
          />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={sortableList} strategy={verticalListSortingStrategy}>
            <div ref={scrollerRef} style={{ padding: '0 .6rem .4rem .7rem', overflowX: 'hidden', overflowY: 'scroll', flexGrow: 1 }} className="consistent-scrollbar">
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', overflow: 'hidden' }}>
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
      </motion.div>
    </>
  );
}

export default memo(SegmentList);
