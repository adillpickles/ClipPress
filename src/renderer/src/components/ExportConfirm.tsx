import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  ReactNode,
  SetStateAction,
} from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaExclamationTriangle,
  FaInfoCircle,
  FaRegCheckCircle,
} from 'react-icons/fa';
import i18n from 'i18next';
import { useTranslation, Trans } from 'react-i18next';
import { IoIosHelpCircle, IoIosSettings } from 'react-icons/io';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import type { SweetAlertIcon } from 'sweetalert2';
import { getSegmentOutputDuration, getSegmentSpeed } from '../segmentSpeed';
import { hasSegmentCrop } from '../segmentCrop';

import ExportButton from './ExportButton';
import ExportModeButton from './ExportModeButton';
import FileNameTemplateEditor from './FileNameTemplateEditor';
import HighlightedText from './HighlightedText';
import Select from './Select';
import Switch from './Switch';
import Button from './Button';
import SegmentedControl from './SegmentedControl';

import { primaryTextColor, warningColor } from '../colors';
import { withBlur } from '../util';
import getSwal from '../swal';
import { isMov as ffmpegIsMov } from '../util/streams';
import useUserSettings from '../hooks/useUserSettings';
import styles from './ExportConfirm.module.css';
import type { SegmentToExport, SizeLimitedEncoderCapabilities } from '../types';
import type {
  GenerateOutFileNames,
  GeneratedOutFileNames,
} from '../util/outputNameTemplate';
import {
  defaultCutFileTemplate,
  defaultCutMergedFileTemplate,
  defaultSizeLimitedCutFileTemplate,
  defaultSizeLimitedCutMergedFileTemplate,
} from '../util/outputNameTemplate';
import type { FFprobeStream } from '../../../common/ffprobe';
import type {
  AvoidNegativeTs,
  ExportEncodeMode,
  PreserveMetadata,
  SizeLimitAdvancedEncoder,
  SizeLimitAdvancedH264CpuPreset,
  SizeLimitAdvancedNvencPreset,
  SizeLimitControlMode,
  SizeLimitPreset,
  SizeLimitSimpleFps,
  SizeLimitSimpleResolution,
} from '../../../common/types';
import TextInput from './TextInput';
import type { UseSegments } from '../hooks/useSegments';
import ExportSheet from './ExportSheet';
import type { LossyMode } from '../../../main';
import AnimatedTr from './AnimatedTr';
import type { Frame } from '../ffmpeg';
import type { FindNearestKeyframeTime } from '../hooks/useKeyframes';
import { troubleshootingUrl } from '../../../common/constants';
import OutDirSelector from './OutDirSelector';
import { shouldWarnAboutTightAdvancedH264Target } from '../sizeLimitedExecutionPolicy';
import { planSizeLimitedEncode } from '../sizeLimitedPlanner';
import { getSizeLimitedEncoderCapabilities } from '../sizeLimitedExport';
import { resolveSizeLimitedStrategy } from '../sizeLimitedStrategy';
import { gpuVendorLabels, pickGpuEncoder } from '../gpuEncoders';
import formatClockTime from '../util/clockTime';
import {
  getSizeLimitedSimpleFpsOptions,
  getSizeLimitedSimpleResolutionOptions,
  resolveEffectiveSizeLimitedTransformSettings,
} from '../sizeLimitedResolution';

const remote = window.require('@electron/remote');
const { shell } = remote;

const sizeLimitQuickPicksMb = [10, 20, 25, 50, 100];

const rightIconStyle: CSSProperties = {
  fontSize: '1.2em',
  verticalAlign: 'middle',
};

const adjustCutFromValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const adjustCutToValues = [
  -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];
const av1CpuPresetOptions = Array.from({ length: 14 }, (_, index) => index);
const nvencPresetOptions = [
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  'p7',
] as const satisfies readonly SizeLimitAdvancedNvencPreset[];
const h264CpuPresetOptions = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
] as const satisfies readonly SizeLimitAdvancedH264CpuPreset[];

const HelpIcon = ({
  onClick,
  style,
}: {
  onClick: () => void;
  style?: CSSProperties;
}) => (
  <IoIosHelpCircle
    role="button"
    onClick={withBlur(onClick)}
    style={{
      cursor: 'pointer',
      color: primaryTextColor,
      verticalAlign: 'middle',
      fontSize: '1.5em',
      ...style,
    }}
  />
);

function ShiftTimes({
  values,
  num,
  setNum,
}: {
  values: number[];
  num: number;
  setNum: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={num}
      onChange={(e) => setNum(Number(e.target.value))}
      style={{ height: 20, marginLeft: 5 }}
    >
      {values.map((v) => (
        <option key={v} value={v}>
          {t('{{numFrames}} frames', {
            numFrames: v >= 0 ? `+${v}` : v,
            count: v,
          })}
        </option>
      ))}
    </Select>
  );
}

function renderNoticeIcon(
  notice: { warning?: boolean | undefined } | undefined,
  style?: CSSProperties,
) {
  if (!notice) return undefined;
  return notice.warning ? (
    <FaExclamationTriangle
      style={{
        flexShrink: '0',
        fontSize: '.8em',
        verticalAlign: 'baseline',
        color: warningColor,
        ...style,
      }}
    />
  ) : (
    <FaInfoCircle
      style={{
        flexShrink: '0',
        fontSize: '.8em',
        verticalAlign: 'baseline',
        color: 'var(--accent-10)',
        ...style,
      }}
    />
  );
}

interface Notice {
  warning?: true;
  text: ReactNode;
}

interface GenericNotice {
  warning?: true;
  text: string;
  url?: string;
}

function renderNotice(
  notice: Notice | GenericNotice | undefined,
  { style }: { style?: CSSProperties },
) {
  if (notice == null) return null;
  const { warning, text } = notice;
  const url = 'url' in notice ? notice.url : undefined;
  return (
    <div
      key={typeof notice.text === 'string' ? notice.text : undefined}
      className={[styles['notice'], warning ? styles['noticeWarning'] : styles['noticeInfo']].join(' ')}
      style={style}
    >
      {renderNoticeIcon({ warning }, { fontSize: '1em', flexShrink: 0, marginTop: '.15em' })}
      <span style={{ flexGrow: 1 }}>{text}</span>
      {url != null && (
        <IoIosHelpCircle
          style={{
            cursor: 'pointer',
            fontSize: '1.5em',
            flexShrink: 0,
            color: primaryTextColor,
          }}
          title={i18n.t('Learn more')}
          role="button"
          tabIndex={0}
          onClick={() => shell.openExternal(url)}
        />
      )}
    </div>
  );
}

function AutoNamePreview({
  title,
  generateFileNames,
  onCustomize,
  currentSegIndexSafe,
}: {
  title: string;
  generateFileNames: () => Promise<GeneratedOutFileNames>;
  onCustomize: () => void;
  currentSegIndexSafe?: number | undefined;
}) {
  const { t } = useTranslation();
  const { simpleMode } = useUserSettings();
  const [generated, setGenerated] = useState<GeneratedOutFileNames>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const nextGenerated = await generateFileNames();
        if (!cancelled) setGenerated(nextGenerated);
      } catch (error) {
        console.error('Failed to generate auto file names preview', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generateFileNames]);

  const previewName = useMemo(() => {
    if (generated == null) return undefined;
    if (currentSegIndexSafe != null) return generated.fileNames[currentSegIndexSafe] ?? generated.fileNames[0];
    return generated.fileNames[0];
  }, [currentSegIndexSafe, generated]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '.4rem' }}>
        <div className={styles['summaryLabel']}>{title}</div>
        {simpleMode ? (
          <Button size="sm" variant="ghost" onClick={onCustomize}>
            {t('Use custom filename')}
          </Button>
        ) : (
          <Button size="sm" onClick={onCustomize}>
            {t('Edit filename')}
          </Button>
        )}
      </div>
      <div>
        {/*
          Deliberately not clickable. This reads as a label showing the name that will be
          used, and making it a customise trigger meant a click to inspect the name
          silently switched naming off automatic for good. Customising is the explicit
          button below.
        */}
        <div className={styles['fileNamePreview']} title={previewName}>
          {previewName ?? t('Generating preview...')}
        </div>
      </div>
    </div>
  );
}

function ExportConfirm({
  areWeCutting,
  segmentsToExport,
  willMerge,
  visible,
  onClosePress,
  onExportConfirm,
  outFormat,
  renderOutFmt,
  outputDir,
  numStreamsTotal,
  numStreamsToCopy,
  onShowStreamsSelectorClick,
  cutFileTemplate,
  cutMergedFileTemplate,
  generateCutFileNames,
  generateCutMergedFileNames,
  generateAutoCutFileNames,
  generateAutoCutMergedFileNames,
  currentSegIndexSafe,
  segmentsOrInverse,
  mainCopiedThumbnailStreams,
  needSmartCut,
  isEncoding,
  encBitrate,
  setEncBitrate,
  toggleSettings,
  outputPlaybackRate,
  lossyMode,
  neighbouringKeyFrames,
  findNearestKeyFrameTime,
  sizeLimitedSourceVideoStream,
  sizeLimitedSourceFps,
  sizeLimitedSourceRotation,
  sizeLimitedHasAudio,
  hasOverlayClips,
}: {
  areWeCutting: boolean;
  segmentsToExport: SegmentToExport[];
  willMerge: boolean;
  visible: boolean;
  onClosePress: () => void;
  onExportConfirm: () => void;
  outFormat: string | undefined;
  renderOutFmt: (style: CSSProperties) => JSX.Element;
  outputDir: string | undefined;
  numStreamsTotal: number;
  numStreamsToCopy: number;
  onShowStreamsSelectorClick: () => void;
  cutFileTemplate: string | undefined;
  cutMergedFileTemplate: string | undefined;
  generateCutFileNames: GenerateOutFileNames;
  generateCutMergedFileNames: GenerateOutFileNames;
  generateAutoCutFileNames?: (() => Promise<GeneratedOutFileNames>) | undefined;
  generateAutoCutMergedFileNames?:
    | (() => Promise<GeneratedOutFileNames>)
    | undefined;
  currentSegIndexSafe: number;
  segmentsOrInverse: UseSegments['segmentsOrInverse'];
  mainCopiedThumbnailStreams: FFprobeStream[];
  needSmartCut: boolean;
  isEncoding: boolean;
  encBitrate: number | undefined;
  setEncBitrate: Dispatch<SetStateAction<number | undefined>>;
  toggleSettings: () => void;
  outputPlaybackRate: number;
  lossyMode: LossyMode | undefined;
  neighbouringKeyFrames: Frame[];
  findNearestKeyFrameTime: FindNearestKeyframeTime;
  sizeLimitedSourceVideoStream:
    | Pick<FFprobeStream, 'width' | 'height'>
    | undefined;
  sizeLimitedSourceFps: number | undefined;
  sizeLimitedSourceRotation: number | undefined;
  sizeLimitedHasAudio: boolean;
  hasOverlayClips: boolean;
}) {
  const { t } = useTranslation();

  const {
    keyframeCut,
    toggleKeyframeCut,
    preserveMovData,
    setPreserveMovData,
    preserveMetadata,
    setPreserveMetadata,
    preserveChapters,
    setPreserveChapters,
    movFastStart,
    setMovFastStart,
    avoidNegativeTs,
    setAvoidNegativeTs,
    autoDeleteMergedSegments,
    setAutoMerge,
    setAutoDeleteMergedSegments,
    segmentsToChapters,
    setSegmentsToChapters,
    setSegmentsToChaptersOnly,
    preserveMetadataOnMerge,
    setPreserveMetadataOnMerge,
    enableSmartCut,
    setEnableSmartCut,
    effectiveExportMode,
    enableOverwriteOutput,
    setEnableOverwriteOutput,
    ffmpegExperimental,
    setFfmpegExperimental,
    cutFromAdjustmentFrames,
    setCutFromAdjustmentFrames,
    cutToAdjustmentFrames,
    setCutToAdjustmentFrames,
    setCutFileTemplate,
    setCutMergedFileTemplate,
    simpleMode,
    keyframesEnabled,
    exportEncodeMode,
    setExportEncodeMode,
    sizeLimitMb,
    setSizeLimitMb,
    sizeLimitControlMode,
    setSizeLimitControlMode,
    sizeLimitPreset,
    setSizeLimitPreset,
    sizeLimitSimpleResolution,
    setSizeLimitSimpleResolution,
    sizeLimitSimpleResolutionTouched,
    setSizeLimitSimpleResolutionTouched,
    sizeLimitSimpleFps,
    setSizeLimitSimpleFps,
    sizeLimitSimpleFpsTouched,
    setSizeLimitSimpleFpsTouched,
    sizeLimitAdvancedResolution,
    setSizeLimitAdvancedResolution,
    sizeLimitAdvancedFps,
    setSizeLimitAdvancedFps,
    sizeLimitAdvancedEncoder,
    setSizeLimitAdvancedEncoder,
    sizeLimitAdvancedTwoPass,
    setSizeLimitAdvancedTwoPass,
    sizeLimitAdvancedAv1CpuPreset,
    setSizeLimitAdvancedAv1CpuPreset,
    sizeLimitAdvancedAv1NvencPreset,
    setSizeLimitAdvancedAv1NvencPreset,
    sizeLimitAdvancedH264CpuPreset,
    setSizeLimitAdvancedH264CpuPreset,
    sizeLimitAdvancedH264NvencPreset,
    setSizeLimitAdvancedH264NvencPreset,
    sizeLimitSeparateNamingMode,
    setSizeLimitSeparateNamingMode,
    sizeLimitMergedNamingMode,
    setSizeLimitMergedNamingMode,
    sizeLimitCutFileTemplate,
    setSizeLimitCutFileTemplate,
    sizeLimitCutMergedFileTemplate,
    setSizeLimitCutMergedFileTemplate,
    customFfPath,
  } = useUserSettings();

  const [showAdvancedOverride, setShowAdvancedOverride] = useState<
    boolean | undefined
  >();
  const [showSeparateNameEditor, setShowSeparateNameEditor] = useState(false);
  const [showMergedNameEditor, setShowMergedNameEditor] = useState(false);
  const showAdvanced = showAdvancedOverride ?? !simpleMode;
  const togglePreserveChapters = useCallback(
    () => setPreserveChapters((val) => !val),
    [setPreserveChapters],
  );
  const togglePreserveMovData = useCallback(
    () => setPreserveMovData((val) => !val),
    [setPreserveMovData],
  );
  const toggleMovFastStart = useCallback(
    () => setMovFastStart((val) => !val),
    [setMovFastStart],
  );
  const toggleSegmentsToChapters = useCallback(
    () => setSegmentsToChapters((v) => !v),
    [setSegmentsToChapters],
  );
  const togglePreserveMetadataOnMerge = useCallback(
    () => setPreserveMetadataOnMerge((v) => !v),
    [setPreserveMetadataOnMerge],
  );
  const handleClosePress = useCallback(() => {
    setShowAdvancedOverride(undefined);
    setShowSeparateNameEditor(false);
    setShowMergedNameEditor(false);
    onClosePress();
  }, [onClosePress]);
  const toggleAdvanced = useCallback(() => {
    setShowAdvancedOverride((value) => !(value ?? !simpleMode));
  }, [simpleMode]);

  const isSizeLimited = exportEncodeMode === 'size_limited';
  const effectiveOutFormat = isSizeLimited ? 'mp4' : outFormat;
  const isMov = ffmpegIsMov(effectiveOutFormat);
  const isIpod = effectiveOutFormat === 'ipod';
  const [encoderCapabilities, setEncoderCapabilities] = useState<SizeLimitedEncoderCapabilities>();

  useEffect(() => {
    if (!isSizeLimited) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const capabilities = await getSizeLimitedEncoderCapabilities();
        if (!cancelled) setEncoderCapabilities(capabilities);
      } catch (error) {
        console.warn('Failed to load size-limited encoder capabilities', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customFfPath, isSizeLimited]);

  useEffect(() => {
    if (!isSizeLimited) return;
    if (effectiveExportMode === 'segments_to_chapters') {
      setSegmentsToChaptersOnly(false);
    }
  }, [effectiveExportMode, isSizeLimited, setSegmentsToChaptersOnly]);

  const sizeLimitedPreviewDuration = useMemo(() => {
    if (
      !isSizeLimited
      || outputPlaybackRate <= 0
      || segmentsToExport.length === 0
    ) return undefined;

    const plannedDuration = willMerge
      ? segmentsToExport.reduce((sum, segment) => sum + getSegmentOutputDuration(segment, outputPlaybackRate), 0)
      : segmentsToExport.reduce(
        (maxDuration, segment) => Math.max(maxDuration, getSegmentOutputDuration(segment, outputPlaybackRate)),
        0,
      );

    return plannedDuration > 0
      ? plannedDuration
      : undefined;
  }, [isSizeLimited, outputPlaybackRate, segmentsToExport, willMerge]);

  // some thumbnail streams (png,jpg etc) cannot always be cut correctly, so we warn if they try to.
  const areWeCuttingProblematicStreams = areWeCutting && mainCopiedThumbnailStreams.length > 0;

  const haveSegmentWithProblematicKeyframe = useMemo(() => {
    if (neighbouringKeyFrames.length === 0) return false;
    return segmentsToExport.some(({ start, end }) => {
      const previousKeyframeTime = findNearestKeyFrameTime({ time: start, direction: -1 }) ?? 0;
      const segmentDuration = end - start;
      const estimatedExportedSegmentDuration = end - previousKeyframeTime;
      // if estimated actual output length of segment is more than 1.5 times the intended segment duration, then we consider it problematic and warn the user about it.
      return estimatedExportedSegmentDuration > segmentDuration * 1.5;
    });
  }, [neighbouringKeyFrames.length, segmentsToExport, findNearestKeyFrameTime]);

  const notices = useMemo(() => {
    const specific: Record<
      | 'exportMode'
      | 'problematicStreams'
      | 'movFastStart'
      | 'preserveMovData'
      | 'smartCut'
      | 'cutMode'
      | 'avoidNegativeTs'
      | 'overwriteOutput',
      Notice | undefined
    > = {
      exportMode:
        effectiveExportMode === 'segments_to_chapters'
          ? {
            text: i18n.t(
              'Segments to chapters mode is active, this means that the file will not be cut. Instead chapters will be created from the segments.',
            ),
          }
          : undefined,
      problematicStreams:
        !isSizeLimited && areWeCuttingProblematicStreams
          ? {
            warning: true,
            text: (
              <Trans>
                Warning: Cutting thumbnail tracks is known to cause problems.
                Consider disabling track{' '}
                {{
                  trackNumber: mainCopiedThumbnailStreams[0]
                    ? mainCopiedThumbnailStreams[0].index + 1
                    : 0,
                }}
                .
              </Trans>
            ),
          }
          : undefined,
      movFastStart:
        isMov && isIpod && !movFastStart
          ? {
            warning: true,
            text: t(
              'For the ipod format, it is recommended to activate this option',
            ),
          }
          : undefined,
      preserveMovData:
        isMov && isIpod && preserveMovData
          ? {
            warning: true,
            text: t(
              'For the ipod format, it is recommended to deactivate this option',
            ),
          }
          : undefined,
      smartCut:
        areWeCutting && needSmartCut
          ? {
            warning: true,
            text: t(
              'Smart cut is experimental and will not work on all files.',
            ),
          }
          : undefined,
      cutMode:
        areWeCutting && !isEncoding && !keyframeCut
          ? {
            text: t(
              'Note: Keyframe cut is recommended for most common files',
            ),
          }
          : undefined,
      avoidNegativeTs: !isEncoding
        ? (() => {
          if (willMerge) {
            if (avoidNegativeTs !== 'make_non_negative') {
              return {
                text: t(
                  'When merging, it\'s generally recommended to set this to "make_non_negative"',
                ),
              };
            }
            return undefined;
          }
          if (!['make_zero', 'auto'].includes(avoidNegativeTs)) {
            return {
              text: t(
                "It's generally recommended to set this to one of: {{values}}",
                { values: '"auto", "make_zero"' },
              ),
            };
          }
          return undefined;
        })()
        : undefined,
      overwriteOutput: enableOverwriteOutput
        ? { text: t('Existing files will be overwritten without warning!') }
        : undefined,
    };

    const generic: GenericNotice[] = [];

    if (
      (effectiveExportMode === 'separate'
        || effectiveExportMode === 'merge'
        || effectiveExportMode === 'merge+separate')
      && !areWeCutting
    ) {
      generic.push({
        text: t(
          'Exporting whole file without cutting, because there are no segments to export.',
        ),
      });
    }

    // Text, speed and crop are drawn into the picture, so the video is re-encoded. Target-size
    // exports always re-encode and already budget for overlays, so they need no notice at all.
    const hasSegmentTransforms = segmentsToExport.some((segment) => getSegmentSpeed(segment) !== 1 || hasSegmentCrop(segment));
    const reencodesVideo = isSizeLimited || hasOverlayClips || hasSegmentTransforms || isEncoding;
    if (!isSizeLimited && (hasOverlayClips || hasSegmentTransforms)) {
      generic.push({
        text: t('Text, speed and crop changes are drawn into the picture, so the video is re-encoded instead of copied.'),
      });
    }

    if (areWeCutting) {
      // https://github.com/mifi/lossless-cut/issues/1809
      if (effectiveOutFormat === 'flac') {
        generic.push({
          text: t(
            'There is a known issue in FFmpeg with cutting FLAC files. The file will be re-encoded, which is still lossless, but the export may be slower.',
          ),
        });
      }
      if (outputPlaybackRate !== 1) {
        generic.push({
          warning: true,
          text: t(
            'Adjusting the output FPS and cutting at the same time will cause incorrect cuts. Consider instead doing it in two separate steps.',
          ),
        });
      }
      // Only a lossless copy has to start at a keyframe; a re-encode cuts exactly.
      if (keyframesEnabled && haveSegmentWithProblematicKeyframe && !reencodesVideo) {
        generic.push({
          warning: true,
          text: t(
            "A segment may result in an unexpectedly long output file length after exporting, because your video file doesn't have any keyframes near the start time of the segment you're trying to cut.",
          ),
          url: troubleshootingUrl,
        });
      }
    }

    return {
      generic,
      specific,
      totalNum:
        generic.filter((n) => n.warning).length
        + Object.values(specific).filter((n) => n != null && n.warning).length,
    };
  }, [
    segmentsToExport,
    areWeCutting,
    areWeCuttingProblematicStreams,
    avoidNegativeTs,
    effectiveExportMode,
    effectiveOutFormat,
    enableOverwriteOutput,
    hasOverlayClips,
    haveSegmentWithProblematicKeyframe,
    isEncoding,
    isIpod,
    isMov,
    isSizeLimited,
    keyframeCut,
    keyframesEnabled,
    mainCopiedThumbnailStreams,
    movFastStart,
    needSmartCut,
    outputPlaybackRate,
    preserveMovData,
    t,
    willMerge,
  ]);

  const exportModeDescription = useMemo(
    () => ({
      segments_to_chapters: t(
        "Don't cut the file, but instead export an unmodified original which has chapters generated from segments",
      ),
      merge: t('Auto merge segments to one file after export'),
      'merge+separate': t(
        'Auto merge segments into one file after export, but keep exported per-segment files too',
      ),
      separate: t('Export each segment to a separate file'),
    })[effectiveExportMode],
    [effectiveExportMode, t],
  );

  const showHelpText = useCallback(
    ({
      icon = 'info',
      timer = 10000,
      text,
    }: {
      icon?: SweetAlertIcon;
      timer?: number;
      text: string;
    }) => getSwal().toast.fire({ icon, timer, text }),
    [],
  );

  const onPreserveChaptersPress = useCallback(() => {
    showHelpText({
      text: i18n.t('Whether to preserve chapters from source file.'),
    });
  }, [showHelpText]);

  const onPreserveMovDataHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'Preserve all MOV/MP4 metadata tags (e.g. EXIF, GPS position etc.) from source file? Note that some players have trouble playing back files where all metadata is preserved, like iTunes and other Apple software',
      ),
    });
  }, [showHelpText]);

  const onPreserveMetadataHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'Whether to preserve metadata from source file. Default: Global (file metadata), per-track and per-chapter metadata will be copied. Non-global: Only per-track and per-chapter metadata will be copied. None: No metadata will be copied',
      ),
    });
  }, [showHelpText]);

  const onMovFastStartHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'Enabling this will allow faster playback of the exported file. This makes processing use 3 times as much export I/O, which is negligible for small files but might slow down exporting of large files.',
      ),
    });
  }, [showHelpText]);

  const onOutFmtHelpPress = useCallback(() => {
    showHelpText({
      text: isSizeLimited
        ? t(
          'Size-limited export is forced to MP4 in MVP so the result is immediately shareable.',
        )
        : i18n.t(
          "Defaults to same format as input file. You can losslessly change the file format (container) of the file with this option. Not all formats support all codecs. Matroska/MP4/MOV support the most common codecs. Sometimes it's even impossible to export to the same output format as input.",
        ),
    });
  }, [isSizeLimited, showHelpText, t]);

  const onExportEncodeModeHelpPress = useCallback(() => {
    showHelpText({
      text: isSizeLimited
        ? t(
          'Size-limited export makes a shareable MP4 and retries internally until the file lands under your requested size.',
        )
        : t(
          'Lossless export keeps the original ClipPress workflow and exports without built-in re-encoding.',
        ),
    });
  }, [isSizeLimited, showHelpText, t]);

  const onTargetSizeHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'ClipPress will try to keep every produced file slightly under this size, so it is ready to share.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedControlModeHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Simple mode chooses a goal-focused preset for you. Advanced mode exposes the exact encoder path, resolution, FPS, preset, and 2-pass option directly.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedPresetHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Max Quality chases the best-looking result under the cap. Quality is the recommended everyday balance. Fast prioritizes speed while keeping the result shareable.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedResolutionHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'ClipPress never upscales. Auto follows a gaming-first ladder: it lowers resolution before it lowers FPS, and it never uses 1440p30 in Auto.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedFpsHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Auto keeps the source FPS when it can. For clips above 30 fps, ClipPress only falls to 30 fps after it has already tried lower-resolution options. ClipPress will never increase FPS.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedEncoderHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Choose the exact encoder path directly in Advanced mode. AV1 CPU prioritizes premium quality, AV1 GPU prioritizes faster AV1, H.264 CPU is the compatibility CPU path, and H.264 GPU is the fastest H.264 path. GPU options use NVIDIA, AMD, or Intel hardware, whichever is present; the preset (p1 fastest to p7 best) is mapped to each vendor.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedTwoPassHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Turn this on for 2-pass encoding. CPU encoders run FFmpeg 2-pass and show Pass 1/2 and Pass 2/2 during export. NVIDIA GPUs run their built-in full multipass in a single encode, which is as good and takes about half the time; AMD and Intel GPUs encode once.',
      ),
    });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedPresetHelpPress = useCallback(() => {
    showHelpText({
      text: t(
        'Advanced mode exposes the encoder’s real preset ladder. Lower SVT-AV1 numbers and higher NVENC or x264 preset levels usually trade more time for more compression efficiency.',
      ),
    });
  }, [showHelpText, t]);

  const handleExportEncodeModeChange = useCallback(
    (value: ExportEncodeMode) => {
      setExportEncodeMode(value);
      if (
        value === 'size_limited'
        && effectiveExportMode === 'segments_to_chapters'
      ) {
        setSegmentsToChaptersOnly(false);
      }
    },
    [effectiveExportMode, setExportEncodeMode, setSegmentsToChaptersOnly],
  );

  const handleQuickExportModeChange = useCallback(
    (value: 'separate' | 'merge' | 'merge+separate') => {
      switch (value) {
        case 'merge': {
          setAutoMerge(true);
          setAutoDeleteMergedSegments(true);
          setSegmentsToChaptersOnly(false);
          break;
        }
        case 'merge+separate': {
          setAutoMerge(true);
          setAutoDeleteMergedSegments(false);
          setSegmentsToChaptersOnly(false);
          break;
        }
        default: {
          setAutoMerge(false);
          setAutoDeleteMergedSegments(false);
          setSegmentsToChaptersOnly(false);
        }
      }
    },
    [setAutoDeleteMergedSegments, setAutoMerge, setSegmentsToChaptersOnly],
  );

  const handleSizeLimitMbChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(e.target.value);
      if (Number.isNaN(nextValue) || nextValue <= 0) return;
      setSizeLimitMb(nextValue);
    },
    [setSizeLimitMb],
  );

  const handleSizeLimitedResolutionChange = useCallback(
    (value: SizeLimitSimpleResolution) => {
      if (sizeLimitControlMode === 'advanced') {
        setSizeLimitAdvancedResolution(value);
        return;
      }

      setSizeLimitSimpleResolution(value);
      setSizeLimitSimpleResolutionTouched(true);
    },
    [
      setSizeLimitAdvancedResolution,
      setSizeLimitSimpleResolution,
      setSizeLimitSimpleResolutionTouched,
      sizeLimitControlMode,
    ],
  );

  const handleSizeLimitedFpsChange = useCallback(
    (value: SizeLimitSimpleFps) => {
      if (sizeLimitControlMode === 'advanced') {
        setSizeLimitAdvancedFps(value);
        return;
      }

      setSizeLimitSimpleFps(value);
      setSizeLimitSimpleFpsTouched(true);
    },
    [
      setSizeLimitAdvancedFps,
      setSizeLimitSimpleFps,
      setSizeLimitSimpleFpsTouched,
      sizeLimitControlMode,
    ],
  );

  const presetDescription = useMemo(
    () => ({
      max_quality: t(
        'Best-looking result under the limit. Slower is acceptable.',
      ),
      quality: t('Recommended everyday balance for most shareable clips.'),
      fast: t('Good everyday shareable quality with quicker export.'),
    })[sizeLimitPreset],
    [sizeLimitPreset, t],
  );

  const effectiveSizeLimitedTransformSettings = useMemo(
    () => resolveEffectiveSizeLimitedTransformSettings({
      controlMode: sizeLimitControlMode,
      preset: sizeLimitPreset,
      simpleResolution: sizeLimitSimpleResolution,
      simpleResolutionTouched: sizeLimitSimpleResolutionTouched,
      simpleFps: sizeLimitSimpleFps,
      simpleFpsTouched: sizeLimitSimpleFpsTouched,
      advancedResolution: sizeLimitAdvancedResolution,
      advancedFps: sizeLimitAdvancedFps,
    }),
    [
      sizeLimitAdvancedFps,
      sizeLimitAdvancedResolution,
      sizeLimitControlMode,
      sizeLimitPreset,
      sizeLimitSimpleFps,
      sizeLimitSimpleFpsTouched,
      sizeLimitSimpleResolution,
      sizeLimitSimpleResolutionTouched,
    ],
  );

  const sizeLimitedResolutionOptions = useMemo(
    () => getSizeLimitedSimpleResolutionOptions({
      sourceWidth: sizeLimitedSourceVideoStream?.width,
      sourceHeight: sizeLimitedSourceVideoStream?.height,
      rotation: sizeLimitedSourceRotation,
    }),
    [
      sizeLimitedSourceRotation,
      sizeLimitedSourceVideoStream?.height,
      sizeLimitedSourceVideoStream?.width,
    ],
  );

  const selectedSizeLimitedResolution = useMemo(
    () => (sizeLimitedResolutionOptions.includes(
      effectiveSizeLimitedTransformSettings.resolution,
    )
      ? effectiveSizeLimitedTransformSettings.resolution
      : 'auto'),
    [
      effectiveSizeLimitedTransformSettings.resolution,
      sizeLimitedResolutionOptions,
    ],
  );

  const sizeLimitedResolutionDescription = useMemo(() => {
    if (selectedSizeLimitedResolution === 'auto') {
      return t(
        'Recommended. Auto lowers resolution before it lowers FPS for gaming clips.',
      );
    }
    if (selectedSizeLimitedResolution === 'source') return t('Keep the source resolution. ClipPress will never upscale.');
    return t(
      'Downscale to {{resolution}} while preserving aspect ratio. ClipPress will never upscale.',
      { resolution: selectedSizeLimitedResolution },
    );
  }, [selectedSizeLimitedResolution, t]);

  const sizeLimitedFpsOptions = useMemo(
    () => getSizeLimitedSimpleFpsOptions({
      sourceFps: sizeLimitedSourceFps,
    }),
    [sizeLimitedSourceFps],
  );

  const selectedSizeLimitedFps = useMemo(
    () => (sizeLimitedFpsOptions.includes(effectiveSizeLimitedTransformSettings.fps)
      ? effectiveSizeLimitedTransformSettings.fps
      : 'auto'),
    [effectiveSizeLimitedTransformSettings.fps, sizeLimitedFpsOptions],
  );

  const sizeLimitedFpsDescription = useMemo(() => {
    if (selectedSizeLimitedFps === 'auto') {
      if (sizeLimitedSourceFps != null && sizeLimitedSourceFps > 30) {
        return t(
          'Recommended. Auto keeps the source FPS when it can and only drops to 30 fps as a last resort.',
        );
      }
      return t(
        'Recommended. This source is already 30 fps or lower, so Auto keeps the source FPS.',
      );
    }
    if (selectedSizeLimitedFps === 'source') return t('Keep the source FPS. ClipPress will never increase FPS.');
    return t(
      'Force 30 fps. Useful when bitrate is too constrained even after lowering resolution.',
    );
  }, [selectedSizeLimitedFps, sizeLimitedSourceFps, t]);

  // The "NVIDIA" Advanced choices use whichever GPU vendor is present.
  const gpuAv1Encoder = encoderCapabilities != null ? pickGpuEncoder(encoderCapabilities, 'av1') : undefined;
  const gpuH264Encoder = encoderCapabilities != null ? pickGpuEncoder(encoderCapabilities, 'h264') : undefined;

  const advancedEncoderUnavailableMessage = useMemo(() => {
    if (encoderCapabilities == null) return undefined;

    if (
      sizeLimitAdvancedEncoder === 'av1_cpu'
      && !encoderCapabilities.libsvtav1
    ) {
      return t(
        'AV1 CPU (SVT-AV1) is unavailable in this bundled ffmpeg build.',
      );
    }
    if (sizeLimitAdvancedEncoder === 'av1_nvenc' && gpuAv1Encoder == null) return t('No GPU AV1 encoder is available on this system. AV1 needs an NVIDIA RTX 40-series, AMD RX 7000-series, Intel Arc, or newer GPU.');
    if (sizeLimitAdvancedEncoder === 'h264_cpu' && !encoderCapabilities.libx264) return t('H.264 CPU (x264) is unavailable in this bundled ffmpeg build.');
    if (sizeLimitAdvancedEncoder === 'h264_nvenc' && gpuH264Encoder == null) return t('No GPU H.264 encoder is available on this system.');
    return undefined;
  }, [encoderCapabilities, gpuAv1Encoder, gpuH264Encoder, sizeLimitAdvancedEncoder, t]);

  const advancedH264TargetWarningMessage = useMemo(() => {
    if (!isSizeLimited || sizeLimitControlMode !== 'advanced') return undefined;
    if (advancedEncoderUnavailableMessage != null) return undefined;
    if (sizeLimitedPreviewDuration == null) return undefined;

    const strategy = resolveSizeLimitedStrategy({
      controlMode: 'advanced',
      preset: sizeLimitPreset,
      advancedEncoder: sizeLimitAdvancedEncoder,
      advancedTwoPass: sizeLimitAdvancedTwoPass,
      advancedAv1CpuPreset: sizeLimitAdvancedAv1CpuPreset,
      advancedAv1NvencPreset: sizeLimitAdvancedAv1NvencPreset,
      advancedH264CpuPreset: sizeLimitAdvancedH264CpuPreset,
      advancedH264NvencPreset: sizeLimitAdvancedH264NvencPreset,
      capabilities: encoderCapabilities ?? {
        h264Nvenc: false,
        av1Nvenc: false,
        libx264: false,
        libsvtav1: false,
      },
    });
    const plan = planSizeLimitedEncode({
      targetSizeMb: sizeLimitMb,
      duration: sizeLimitedPreviewDuration,
      hasAudio: sizeLimitedHasAudio,
      strategy,
    });

    if (
      !shouldWarnAboutTightAdvancedH264Target({
        strategy,
        videoBitrate: plan.initialAttempt.videoBitrate,
      })
    ) return undefined;

    return t(
      'This target is likely too tight for H.264. ClipPress will try bounded retries, but H.264 may still fail to reach the requested size limit. For safer under-cap results, use AV1 or lower resolution/FPS.',
    );
  }, [
    advancedEncoderUnavailableMessage,
    encoderCapabilities,
    isSizeLimited,
    sizeLimitAdvancedAv1CpuPreset,
    sizeLimitAdvancedAv1NvencPreset,
    sizeLimitAdvancedEncoder,
    sizeLimitAdvancedH264CpuPreset,
    sizeLimitAdvancedH264NvencPreset,
    sizeLimitAdvancedTwoPass,
    sizeLimitControlMode,
    sizeLimitMb,
    sizeLimitPreset,
    sizeLimitedHasAudio,
    sizeLimitedPreviewDuration,
    t,
  ]);

  const advancedPresetValue = useMemo(() => {
    switch (sizeLimitAdvancedEncoder) {
      case 'av1_cpu': {
        return String(sizeLimitAdvancedAv1CpuPreset);
      }
      case 'av1_nvenc': {
        return sizeLimitAdvancedAv1NvencPreset;
      }
      case 'h264_cpu': {
        return sizeLimitAdvancedH264CpuPreset;
      }
      case 'h264_nvenc': {
        return sizeLimitAdvancedH264NvencPreset;
      }
      default: {
        return '';
      }
    }
  }, [
    sizeLimitAdvancedAv1CpuPreset,
    sizeLimitAdvancedAv1NvencPreset,
    sizeLimitAdvancedEncoder,
    sizeLimitAdvancedH264CpuPreset,
    sizeLimitAdvancedH264NvencPreset,
  ]);

  const handleAdvancedPresetChange = useCallback(
    (value: string) => {
      switch (sizeLimitAdvancedEncoder) {
        case 'av1_cpu': {
          setSizeLimitAdvancedAv1CpuPreset(Number(value));
          break;
        }
        case 'av1_nvenc': {
          setSizeLimitAdvancedAv1NvencPreset(
            value as SizeLimitAdvancedNvencPreset,
          );
          break;
        }
        case 'h264_cpu': {
          setSizeLimitAdvancedH264CpuPreset(
            value as SizeLimitAdvancedH264CpuPreset,
          );
          break;
        }
        case 'h264_nvenc': {
          setSizeLimitAdvancedH264NvencPreset(
            value as SizeLimitAdvancedNvencPreset,
          );
          break;
        }
        default: {
          break;
        }
      }
    },
    [
      setSizeLimitAdvancedAv1CpuPreset,
      setSizeLimitAdvancedAv1NvencPreset,
      setSizeLimitAdvancedH264CpuPreset,
      setSizeLimitAdvancedH264NvencPreset,
      sizeLimitAdvancedEncoder,
    ],
  );

  const advancedPresetOptions = useMemo(() => {
    switch (sizeLimitAdvancedEncoder) {
      case 'av1_cpu': {
        return av1CpuPresetOptions.map((value) => ({
          value: String(value),
          label: String(value),
        }));
      }
      case 'av1_nvenc':
      case 'h264_nvenc': {
        return nvencPresetOptions.map((value) => ({ value, label: value }));
      }
      case 'h264_cpu': {
        return h264CpuPresetOptions.map((value) => ({ value, label: value }));
      }
      default: {
        return [];
      }
    }
  }, [sizeLimitAdvancedEncoder]);

  const onKeyframeCutHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'With "keyframe cut", we will cut at the nearest keyframe before the desired start cutpoint. This is recommended for most files. With "Normal cut" you may have to manually set the cutpoint a few frames before the next keyframe to achieve a precise cut',
      ),
    });
  }, [showHelpText]);

  const onSmartCutHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'This experimental feature will re-encode the part of the video from the cutpoint until the next keyframe in order to attempt to make a 100% accurate cut. It only works on some files. Reports so far suggest better luck with some h264 files and only a few h265 files. See more here: {{url}}',
        { url: 'https://github.com/mifi/lossless-cut/issues/126' },
      ),
    });
  }, [showHelpText]);

  const onTracksHelpPress = useCallback(() => {
    showHelpText({
      text: isSizeLimited
        ? t(
          'Size-limited export keeps only the main video plus one audio track in MVP to keep the output shareable and predictable.',
        )
        : i18n.t(
          'Not all formats support all track types, and ClipPress is unable to properly cut some track types, so you may have to sacrifice some tracks by disabling them in order to get correct result.',
        ),
    });
  }, [isSizeLimited, showHelpText, t]);

  const onSegmentsToChaptersHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'When merging, do you want to create chapters in the merged file, according to the cut segments? NOTE: This may dramatically increase processing time',
      ),
    });
  }, [showHelpText]);

  const onPreserveMetadataOnMergeHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'When merging, do you want to preserve metadata from your original file? NOTE: This may dramatically increase processing time',
      ),
    });
  }, [showHelpText]);

  const onCutFileTemplateHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'You can customize the file name of the output segment(s) using special variables.',
        { count: segmentsToExport.length },
      ),
    });
  }, [segmentsToExport.length, showHelpText]);

  const onCutMergedFileTemplateHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'You can customize the file name of the merged file using special variables.',
      ),
    });
  }, [showHelpText]);

  const onExportModeHelpPress = useCallback(() => {
    showHelpText({ text: exportModeDescription });
  }, [exportModeDescription, showHelpText]);

  const onAvoidNegativeTsHelpPress = useCallback(() => {
    // https://ffmpeg.org/ffmpeg-all.html#Format-Options
    // https://github.com/mifi/lossless-cut/issues/1206
    const texts = {
      make_non_negative: i18n.t(
        'Shift timestamps to make them non-negative. Also note that this affects only leading negative timestamps, and not non-monotonic negative timestamps.',
      ),
      make_zero: i18n.t(
        'Shift timestamps so that the first timestamp is 0. (ClipPress default)',
      ),
      auto: i18n.t('Enables shifting when required by the target format.'),
      disabled: i18n.t('Disables shifting of timestamp.'),
    };
    showHelpText({ text: `${avoidNegativeTs}: ${texts[avoidNegativeTs]}` });
  }, [avoidNegativeTs, showHelpText]);

  const onCutFromAdjustmentFramesHelpPress = useCallback(() => {
    showHelpText({
      text: i18n.t(
        'This option allows you to shift all segment start times forward by one or more frames before cutting. This can be useful if the output video starts from the wrong (preceding) keyframe.',
      ),
    });
  }, [showHelpText]);

  const onFfmpegExperimentalHelpPress = useCallback(() => {
    showHelpText({ text: t('Enable experimental ffmpeg features flag?') });
  }, [showHelpText, t]);

  const canEditSegTemplate = !willMerge || !autoDeleteMergedSegments;

  const handleEncBitrateToggle = useCallback(
    (checked: boolean) => {
      setEncBitrate(() => (checked ? undefined : 10000));
    },
    [setEncBitrate],
  );

  const handleEncBitrateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10);
      if (Number.isNaN(v) || v <= 0) return;
      setEncBitrate(v);
    },
    [setEncBitrate],
  );

  const enableSizeLimitedSeparateCustomNaming = useCallback(() => {
    if (sizeLimitCutFileTemplate == null) setSizeLimitCutFileTemplate(defaultSizeLimitedCutFileTemplate);
    setSizeLimitSeparateNamingMode('custom_template');
  }, [sizeLimitCutFileTemplate, setSizeLimitCutFileTemplate, setSizeLimitSeparateNamingMode]);

  const enableSizeLimitedMergedCustomNaming = useCallback(() => {
    if (sizeLimitCutMergedFileTemplate == null) setSizeLimitCutMergedFileTemplate(defaultSizeLimitedCutMergedFileTemplate);
    setSizeLimitMergedNamingMode('custom_template');
  }, [
    sizeLimitCutMergedFileTemplate,
    setSizeLimitCutMergedFileTemplate,
    setSizeLimitMergedNamingMode,
  ]);

  // Only reached from the explicit "Use custom filename" button, so switching the naming
  // mode here matches what the user asked for. The preview text above is not a trigger.
  const openSeparateNameEditor = useCallback(() => {
    if (isSizeLimited && sizeLimitSeparateNamingMode === 'auto') {
      enableSizeLimitedSeparateCustomNaming();
    }
    setShowSeparateNameEditor(true);
  }, [
    enableSizeLimitedSeparateCustomNaming,
    isSizeLimited,
    sizeLimitSeparateNamingMode,
  ]);

  const openMergedNameEditor = useCallback(() => {
    if (isSizeLimited && sizeLimitMergedNamingMode === 'auto') {
      enableSizeLimitedMergedCustomNaming();
    }
    setShowMergedNameEditor(true);
  }, [
    enableSizeLimitedMergedCustomNaming,
    isSizeLimited,
    sizeLimitMergedNamingMode,
  ]);

  const exportActionLabel = useMemo(() => {
    if (effectiveExportMode === 'merge') return t('Export merged clip');
    if (effectiveExportMode === 'merge+separate') return t('Export all');
    if (effectiveExportMode === 'separate' && areWeCutting) return t('Export {{count}} clips', { count: segmentsToExport.length });
    return t('Export');
  }, [areWeCutting, effectiveExportMode, segmentsToExport.length, t]);

  const exportSummary = useMemo(() => {
    const parts: string[] = [];
    if (areWeCutting) {
      parts.push(segmentsOrInverse.selected.length !== segmentsOrInverse.all.length
        ? t('{{selected}} of {{count}} clips', { selected: segmentsToExport.length, count: segmentsOrInverse.all.length })
        : t('{{count}} clips', { count: segmentsToExport.length }));
    } else {
      parts.push(t('The whole recording'));
    }
    const totalDuration = segmentsToExport.reduce((sum, segment) => sum + getSegmentOutputDuration(segment, outputPlaybackRate), 0);
    if (totalDuration > 0) parts.push(formatClockTime(totalDuration, { decimals: 1 }));
    if (isSizeLimited) {
      parts.push(willMerge || segmentsToExport.length <= 1
        ? t('under {{size}} MB', { size: sizeLimitMb })
        : t('each under {{size}} MB', { size: sizeLimitMb }));
    } else {
      parts.push(t('original quality'));
    }
    return parts.join(' · ');
  }, [areWeCutting, isSizeLimited, outputPlaybackRate, segmentsOrInverse.all.length, segmentsOrInverse.selected.length, segmentsToExport, sizeLimitMb, t, willMerge]);

  const advancedEncoderLabel = useMemo(() => ({
    av1_cpu: t('AV1 CPU (SVT-AV1)'),
    av1_nvenc: gpuAv1Encoder != null ? t('AV1 GPU ({{vendor}})', { vendor: gpuVendorLabels[gpuAv1Encoder.vendor] }) : t('AV1 GPU'),
    h264_cpu: t('H.264 CPU (x264)'),
    h264_nvenc: gpuH264Encoder != null ? t('H.264 GPU ({{vendor}})', { vendor: gpuVendorLabels[gpuH264Encoder.vendor] }) : t('H.264 GPU'),
  })[sizeLimitAdvancedEncoder], [gpuAv1Encoder, gpuH264Encoder, sizeLimitAdvancedEncoder, t]);

  const isCustomSizeLimit = sizeLimitControlMode === 'advanced';
  const presetChoice = isCustomSizeLimit ? 'custom' : sizeLimitPreset;

  const handlePresetChoice = useCallback((value: SizeLimitPreset | 'custom') => {
    if (value === 'custom') {
      setSizeLimitControlMode('advanced');
      setShowAdvancedOverride(true);
      return;
    }
    setSizeLimitControlMode('simple');
    setSizeLimitPreset(value);
  }, [setSizeLimitControlMode, setSizeLimitPreset]);
  const shouldRenderAdvancedTable = !simpleMode || showAdvanced;

  const separateFileName = (
    isSizeLimited
      && sizeLimitSeparateNamingMode === 'auto'
      && generateAutoCutFileNames != null
      && !showSeparateNameEditor ? (
        <AutoNamePreview
          title={willMerge && canEditSegTemplate ? t('Clip file names') : t('File name')}
          generateFileNames={generateAutoCutFileNames}
          currentSegIndexSafe={currentSegIndexSafe}
          onCustomize={openSeparateNameEditor}
        />
      ) : (
        <FileNameTemplateEditor
          mode="separate"
          template={
            isSizeLimited
              ? (sizeLimitCutFileTemplate ?? defaultSizeLimitedCutFileTemplate)
              : (cutFileTemplate ?? defaultCutFileTemplate)
          }
          setTemplate={isSizeLimited ? setSizeLimitCutFileTemplate : setCutFileTemplate}
          defaultTemplate={
            isSizeLimited
              ? defaultSizeLimitedCutFileTemplate
              : defaultCutFileTemplate
          }
          generateFileNames={generateCutFileNames}
          currentSegIndexSafe={currentSegIndexSafe}
          onReset={
            isSizeLimited
              ? () => {
                setSizeLimitSeparateNamingMode('auto');
                setShowSeparateNameEditor(false);
              }
              : undefined
          }
          resetLabel={isSizeLimited ? t('Use auto naming') : undefined}
        />
      )
  );

  const mergedFileName = willMerge ? (
    isSizeLimited
      && sizeLimitMergedNamingMode === 'auto'
      && generateAutoCutMergedFileNames != null
      && !showMergedNameEditor ? (
        <AutoNamePreview
          title={t('Merged file name')}
          generateFileNames={generateAutoCutMergedFileNames}
          onCustomize={openMergedNameEditor}
        />
      ) : (
        <FileNameTemplateEditor
          mode="merge-segments"
          template={
            isSizeLimited
              ? (sizeLimitCutMergedFileTemplate
                ?? defaultSizeLimitedCutMergedFileTemplate)
              : (cutMergedFileTemplate
                ?? defaultCutMergedFileTemplate)
          }
          setTemplate={isSizeLimited ? setSizeLimitCutMergedFileTemplate : setCutMergedFileTemplate}
          defaultTemplate={
            isSizeLimited
              ? defaultSizeLimitedCutMergedFileTemplate
              : defaultCutMergedFileTemplate
          }
          generateFileNames={generateCutMergedFileNames}
          onReset={
            isSizeLimited
              ? () => {
                setSizeLimitMergedNamingMode('auto');
                setShowMergedNameEditor(false);
              }
              : undefined
          }
          resetLabel={isSizeLimited ? t('Use auto naming') : undefined}
        />
      )
  ) : null;

  return (
    <ExportSheet
      width={simpleMode ? '40rem' : '58em'}
      visible={visible}
      title={t('Export')}
      subtitle={exportSummary}
      onClosePress={handleClosePress}
      renderButton={() => (
        <ExportButton
          segmentsToExport={segmentsToExport}
          label={exportActionLabel}
          titleOverride={exportActionLabel}
          onClick={withBlur(() => onExportConfirm())}
          style={{ minHeight: '2.5rem' }}
        />
      )}
      renderBottom={() => (notices.totalNum > 0 ? (
        <div className={styles['noticeBadge']}>
          {renderNoticeIcon({ warning: true }, { fontSize: '1em' })}
          {t('{{count}} warnings', { count: notices.totalNum })}
        </div>
      ) : null)}
    >
      <div className={styles['sheetContent']}>
        {notices.generic.length > 0 && (
          <div className={styles['noticeStack']}>
            {notices.generic.map((notice) => renderNotice(notice, {}))}
          </div>
        )}

        {simpleMode ? (
          <>
            <section className={styles['section']}>
              <div className={styles['sectionHeading']}>{t('Quality')}</div>

              <div className={styles['qualityChoices']} role="radiogroup" aria-label={t('Quality')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isSizeLimited}
                  className={[styles['choiceCard'], ...(!isSizeLimited ? [styles['choiceCardActive']] : [])].join(' ')}
                  onClick={() => handleExportEncodeModeChange('lossless')}
                >
                  <span className={styles['choiceTitle']}>{t('Original quality')}</span>
                  <span className={styles['choiceBody']}>{t('Keeps the picture as it is when it can. Files can be large.')}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSizeLimited}
                  className={[styles['choiceCard'], ...(isSizeLimited ? [styles['choiceCardActive']] : [])].join(' ')}
                  onClick={() => handleExportEncodeModeChange('size_limited')}
                >
                  <span className={styles['choiceTitle']}>{t('Fit a file size')}</span>
                  <span className={styles['choiceBody']}>{t('Makes an MP4 that stays under the size you pick, e.g. for Discord.')}</span>
                </button>
              </div>

              {isSizeLimited && (
                <div className={styles['fields']}>
                  <div className={styles['field']}>
                    <label className={styles['fieldName']} htmlFor="size-limit-mb">{t('Size limit')}</label>
                    <div className={styles['fieldControl']}>
                      <div className={styles['sizeInput']}>
                        <TextInput
                          id="size-limit-mb"
                          type="number"
                          min={1}
                          step={0.1}
                          value={sizeLimitMb}
                          onChange={handleSizeLimitMbChange}
                          style={{ width: '5.5em', flexGrow: 0, textAlign: 'right' }}
                        />
                        <span className={styles['unit']}>{t('MB')}</span>
                      </div>
                      <div className={styles['quickPicks']}>
                        {sizeLimitQuickPicksMb.map((mb) => (
                          <button
                            key={mb}
                            type="button"
                            className={[styles['quickPick'], ...(sizeLimitMb === mb ? [styles['quickPickActive']] : [])].join(' ')}
                            onClick={() => setSizeLimitMb(mb)}
                          >
                            {mb}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles['field']}>
                    <div className={styles['fieldName']}>{t('Preset')}</div>
                    <div className={styles['fieldControl']}>
                      <SegmentedControl<SizeLimitPreset | 'custom'>
                        ariaLabel={t('Preset')}
                        value={presetChoice}
                        onChange={handlePresetChoice}
                        options={[
                          { value: 'max_quality', label: t('Max Quality') },
                          { value: 'quality', label: t('Quality') },
                          { value: 'fast', label: t('Fast') },
                          { value: 'custom', label: t('Custom'), title: t('Pick the encoder and its settings yourself') },
                        ]}
                      />
                      <div className={styles['fieldHint']}>
                        {isCustomSizeLimit ? (
                          <>
                            {t('Custom: {{encoder}}', { encoder: advancedEncoderLabel })}
                            {' · '}
                            {sizeLimitAdvancedTwoPass ? t('2-pass') : t('1-pass')}
                            {' · '}
                            <button type="button" className={styles['inlineLink']} onClick={() => setShowAdvancedOverride(true)}>{t('Edit')}</button>
                          </>
                        ) : presetDescription}
                      </div>
                      {isCustomSizeLimit && advancedEncoderUnavailableMessage != null && (
                        <div className={styles['fieldWarning']}>{advancedEncoderUnavailableMessage}</div>
                      )}
                    </div>
                  </div>

                  <div className={styles['field']}>
                    <label className={styles['fieldName']} htmlFor="size-limit-resolution">{t('Resolution')}</label>
                    <div className={styles['fieldControl']}>
                      <Select
                        id="size-limit-resolution"
                        value={selectedSizeLimitedResolution}
                        title={sizeLimitedResolutionDescription}
                        onChange={withBlur((e) => handleSizeLimitedResolutionChange(
                            e.target.value as SizeLimitSimpleResolution,
                        ))}
                      >
                        {sizeLimitedResolutionOptions.map((value) => (
                          <option key={value} value={value}>
                            {
                                {
                                  auto: t('Auto (recommended)'),
                                  source: t('Keep source'),
                                  '720p': '720p',
                                  '1080p': '1080p',
                                  '1440p': '1440p',
                                }[value]
                              }
                          </option>
                        ))}
                      </Select>
                      <div className={styles['fieldHint']}>{sizeLimitedResolutionDescription}</div>
                    </div>
                  </div>

                  <div className={styles['field']}>
                    <label className={styles['fieldName']} htmlFor="size-limit-fps">{t('Frame rate')}</label>
                    <div className={styles['fieldControl']}>
                      <Select
                        id="size-limit-fps"
                        value={selectedSizeLimitedFps}
                        title={sizeLimitedFpsDescription}
                        onChange={withBlur((e) => handleSizeLimitedFpsChange(
                            e.target.value as SizeLimitSimpleFps,
                        ))}
                      >
                        {sizeLimitedFpsOptions.map((value) => (
                          <option key={value} value={value}>
                            {
                                {
                                  auto: t('Auto (recommended)'),
                                  source: t('Keep source'),
                                  '30fps': t('30 fps'),
                                }[value]
                              }
                          </option>
                        ))}
                      </Select>
                      <div className={styles['fieldHint']}>{sizeLimitedFpsDescription}</div>
                    </div>
                  </div>
                  {advancedH264TargetWarningMessage != null && (
                    <div className={styles['fieldWarning']}>{advancedH264TargetWarningMessage}</div>
                  )}
                </div>
              )}
            </section>

            <section className={styles['section']}>
              <div className={styles['sectionHeading']}>{t('Files')}</div>

              {effectiveExportMode === 'segments_to_chapters' ? (
                <div className={styles['fieldHint']}>
                  {t('Chapters-only export is on: the recording is kept whole, with chapters made from the clips. Change it in More options.')}
                </div>
              ) : (
                <SegmentedControl<'separate' | 'merge' | 'merge+separate'>
                  ariaLabel={t('Files')}
                  value={effectiveExportMode}
                  onChange={handleQuickExportModeChange}
                  options={[
                    { value: 'separate', label: t('One file per clip') },
                    { value: 'merge', label: t('One merged file'), disabled: segmentsOrInverse.selected.length < 2, title: segmentsOrInverse.selected.length < 2 ? t('Needs two or more clips') : t('Joins the clips into one video, in the order of the clips list') },
                    { value: 'merge+separate', label: t('Both'), disabled: segmentsOrInverse.selected.length < 2, title: segmentsOrInverse.selected.length < 2 ? t('Needs two or more clips') : t('One file per clip, plus one merged file') },
                  ]}
                />
              )}

              <div className={styles['fileNames']}>
                {(!willMerge || canEditSegTemplate) && separateFileName}
                {mergedFileName}
              </div>

              <div className={styles['metaRows']}>
                <div className={styles['metaRow']}>
                  <div className={styles['metaLabel']}>{t('Save to')}</div>
                  <div className={styles['metaValue']} title={outputDir}>{outputDir}</div>
                  <OutDirSelector>
                    <Button size="sm">{t('Change')}</Button>
                  </OutDirSelector>
                </div>
                <div className={styles['metaRow']}>
                  <div className={styles['metaLabel']}>{t('Tracks')}</div>
                  <div className={styles['metaValue']}>
                    {isSizeLimited ? t('Video and one audio track') : t('{{count}} tracks', { count: numStreamsToCopy })}
                  </div>
                  <Button size="sm" onClick={onShowStreamsSelectorClick}>{t('Change')}</Button>
                </div>
                {renderNotice(notices.specific['problematicStreams'], { style: { marginTop: '.25rem' } })}
              </div>
            </section>

            <button type="button" className={styles['disclosure']} onClick={toggleAdvanced} aria-expanded={showAdvanced}>
              {showAdvanced ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
              <span>{t('More options')}</span>
              <span className={styles['disclosureHint']}>{t('Encoder, naming and compatibility')}</span>
            </button>
          </>
        ) : (
          <>
            {segmentsOrInverse.selected.length !== segmentsOrInverse.all.length && (
              <div className={styles['selectionPill']}>
                <FaRegCheckCircle size={12} style={{ marginRight: 6 }} />
                {t(
                  '{{selectedSegments}} of {{nonFilteredSegments}} clips selected',
                  {
                    selectedSegments: segmentsOrInverse.selected.length,
                    nonFilteredSegments: segmentsOrInverse.all.length,
                  },
                )}
              </div>
            )}

            <div className={styles['summaryGrid']}>
              <section className={styles['summaryCard']}>
                <div className={styles['summaryLabel']}>{t('Tracks kept')}</div>
                <div className={styles['summaryValue']}>
                  {t('{{count}} tracks', { count: numStreamsToCopy })}
                </div>
                {renderNotice(notices.specific['problematicStreams'], {
                  style: { marginBottom: 0 },
                })}
                <Button size="sm" onClick={onShowStreamsSelectorClick}>
                  {t('Change')}
                </Button>
              </section>

              <section className={styles['summaryCard']}>
                <div className={styles['summaryLabel']}>{t('Save to')}</div>
                <div
                  className={styles['summaryValue']}
                  style={{ wordBreak: 'break-word' }}
                >
                  {outputDir}
                </div>
                <OutDirSelector>
                  <Button size="sm">{t('Change')}</Button>
                </OutDirSelector>
              </section>

              <section className={[styles['summaryCard'], styles['summaryCardWide']].join(' ')}>
                <div className={styles['summaryLabel']}>{t('Container')}</div>
                <div className={styles['summaryValue']}>
                  {isSizeLimited
                    ? 'MP4'
                    : (effectiveOutFormat ?? t('Same as source'))}
                </div>
                <div className={styles['helperText']}>
                  {isSizeLimited
                    ? t('Fixed to MP4 for fast, shareable clips.')
                    : t('Change container details in Advanced settings if you need to.')}
                </div>
              </section>

              <section className={[styles['summaryCard'], styles['summaryCardWide'], styles['summaryFieldCard']].join(' ')}>
                {separateFileName}
              </section>

              {mergedFileName != null && (
                <section className={[styles['summaryCard'], styles['summaryCardWide'], styles['summaryFieldCard']].join(' ')}>
                  {mergedFileName}
                </section>
              )}
            </div>

            <div className={styles['advancedHeader']}>
              <div className={styles['sectionHeading']}>{t('Full export controls')}</div>
            </div>
          </>
        )}

        {shouldRenderAdvancedTable && (
          <div className={styles['advancedTableWrap']}>
            <table className={styles['options']}>
              <colgroup>
                <col style={{ width: '32%' }} />
                <col />
                <col style={{ width: '1.7em' }} />
              </colgroup>
              <tbody>
                {segmentsOrInverse.selected.length
                  !== segmentsOrInverse.all.length && (
                  <tr>
                    <td colSpan={2}>
                      <FaRegCheckCircle size={12} style={{ marginRight: 3 }} />
                      {t(
                        '{{selectedSegments}} of {{nonFilteredSegments}} segments selected',
                        {
                          selectedSegments: segmentsOrInverse.selected.length,
                          nonFilteredSegments: segmentsOrInverse.all.length,
                        },
                      )}
                    </td>
                    <td />
                  </tr>
                )}

                {!simpleMode && (
                  <tr>
                    <td>{t('Export type')}</td>
                    <td>
                      <Select
                        value={exportEncodeMode}
                        onChange={withBlur((e) => handleExportEncodeModeChange(
                            e.target.value as ExportEncodeMode,
                        ))}
                        style={{ height: '1.8em' }}
                      >
                        <option value="lossless">
                          {t('Lossless export')}
                        </option>
                        <option value="size_limited">
                          {t('Limit file size')}
                        </option>
                      </Select>
                    </td>
                    <td>
                      <HelpIcon onClick={onExportEncodeModeHelpPress} />
                    </td>
                  </tr>
                )}

                {isSizeLimited && (
                  <>
                    {!simpleMode && (
                      <tr>
                        <td>{t('Target file size')}</td>
                        <td>
                          <div
                            style={{
                              display: 'inline-flex',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              gap: '.4em',
                              width: '100%',
                            }}
                          >
                            <TextInput
                              type="number"
                              min={1}
                              step={0.1}
                              value={sizeLimitMb}
                              onChange={handleSizeLimitMbChange}
                              style={{
                                width: '6em',
                                flexGrow: 0,
                                textAlign: 'right',
                              }}
                            />
                            <span>{t('MB')}</span>
                          </div>
                        </td>
                        <td>
                          <HelpIcon onClick={onTargetSizeHelpPress} />
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td>{t('Controls')}</td>
                      <td>
                        <Select
                          value={sizeLimitControlMode}
                          onChange={withBlur((e) => setSizeLimitControlMode(
                              e.target.value as SizeLimitControlMode,
                          ))}
                          style={{ height: '1.8em' }}
                        >
                          <option value="simple">
                            {t('Simple')}
                          </option>
                          <option value="advanced">
                            {t('Advanced')}
                          </option>
                        </Select>
                      </td>
                      <td>
                        <HelpIcon onClick={onSizeLimitedControlModeHelpPress} />
                      </td>
                    </tr>

                    <tr>
                      <td>
                        {sizeLimitControlMode === 'simple'
                          ? t('Preset')
                          : t('Encoder')}
                      </td>
                      <td>
                        {sizeLimitControlMode === 'simple' ? (
                          <>
                            <Select
                              value={sizeLimitPreset}
                              onChange={withBlur((e) => setSizeLimitPreset(
                                  e.target.value as SizeLimitPreset,
                              ))}
                              style={{ height: '1.8em' }}
                            >
                              <option value="max_quality">
                                {t('Max Quality')}
                              </option>
                              <option value="quality">
                                {t('Quality')}
                              </option>
                              <option value="fast">
                                {t('Fast')}
                              </option>
                            </Select>
                            <div
                              style={{
                                marginTop: '.35em',
                                fontSize: '.88em',
                                color: 'var(--gray-11)',
                              }}
                            >
                              {presetDescription}
                            </div>
                          </>
                        ) : (
                          <>
                            <Select
                              value={sizeLimitAdvancedEncoder}
                              onChange={withBlur((e) => setSizeLimitAdvancedEncoder(
                                  e.target.value as SizeLimitAdvancedEncoder,
                              ))}
                              style={{ height: '1.8em' }}
                            >
                              <option
                                value="av1_cpu"
                                disabled={
                                  encoderCapabilities != null
                                  && !encoderCapabilities.libsvtav1
                                }
                              >
                                {t('AV1 CPU (SVT-AV1)')}
                              </option>
                              <option
                                value="av1_nvenc"
                                disabled={encoderCapabilities != null && gpuAv1Encoder == null}
                              >
                                {gpuAv1Encoder != null ? t('AV1 GPU ({{vendor}})', { vendor: gpuVendorLabels[gpuAv1Encoder.vendor] }) : t('AV1 GPU')}
                              </option>
                              <option
                                value="h264_cpu"
                                disabled={
                                  encoderCapabilities != null
                                  && !encoderCapabilities.libx264
                                }
                              >
                                {t('H.264 CPU (x264)')}
                              </option>
                              <option
                                value="h264_nvenc"
                                disabled={encoderCapabilities != null && gpuH264Encoder == null}
                              >
                                {gpuH264Encoder != null ? t('H.264 GPU ({{vendor}})', { vendor: gpuVendorLabels[gpuH264Encoder.vendor] }) : t('H.264 GPU')}
                              </option>
                            </Select>
                            {advancedEncoderUnavailableMessage != null && (
                              <div
                                style={{
                                  marginTop: '.35em',
                                  fontSize: '.88em',
                                  color: warningColor,
                                }}
                              >
                                {advancedEncoderUnavailableMessage}
                              </div>
                            )}
                            {advancedH264TargetWarningMessage != null && (
                              <div
                                style={{
                                  marginTop:
                                    advancedEncoderUnavailableMessage != null
                                      ? '.2em'
                                      : '.35em',
                                  fontSize: '.88em',
                                  color: warningColor,
                                }}
                              >
                                {advancedH264TargetWarningMessage}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        <HelpIcon
                          onClick={
                            sizeLimitControlMode === 'simple'
                              ? onSizeLimitedPresetHelpPress
                              : onSizeLimitedAdvancedEncoderHelpPress
                          }
                        />
                      </td>
                    </tr>

                    <tr>
                      <td>{t('Resolution')}</td>
                      <td>
                        <Select
                          value={selectedSizeLimitedResolution}
                          onChange={withBlur((e) => handleSizeLimitedResolutionChange(
                              e.target.value as SizeLimitSimpleResolution,
                          ))}
                          style={{ height: '1.8em' }}
                        >
                          {sizeLimitedResolutionOptions.map((value) => (
                            <option key={value} value={value}>
                              {
                                {
                                  auto: t('Auto (recommended)'),
                                  source: t('Keep source'),
                                  '720p': '720p',
                                  '1080p': '1080p',
                                  '1440p': '1440p',
                                }[value]
                              }
                            </option>
                          ))}
                        </Select>
                        <div
                          style={{
                            marginTop: '.35em',
                            fontSize: '.88em',
                            color: 'var(--gray-11)',
                          }}
                        >
                          {sizeLimitedResolutionDescription}
                        </div>
                      </td>
                      <td>
                        <HelpIcon onClick={onSizeLimitedResolutionHelpPress} />
                      </td>
                    </tr>

                    <tr>
                      <td>{t('FPS')}</td>
                      <td>
                        <Select
                          value={selectedSizeLimitedFps}
                          onChange={withBlur((e) => handleSizeLimitedFpsChange(
                              e.target.value as SizeLimitSimpleFps,
                          ))}
                          style={{ height: '1.8em' }}
                        >
                          {sizeLimitedFpsOptions.map((value) => (
                            <option key={value} value={value}>
                              {
                                {
                                  auto: t('Auto (recommended)'),
                                  source: t('Keep source'),
                                  '30fps': t('30 fps'),
                                }[value]
                              }
                            </option>
                          ))}
                        </Select>
                        <div
                          style={{
                            marginTop: '.35em',
                            fontSize: '.88em',
                            color: 'var(--gray-11)',
                          }}
                        >
                          {sizeLimitedFpsDescription}
                        </div>
                      </td>
                      <td>
                        <HelpIcon onClick={onSizeLimitedFpsHelpPress} />
                      </td>
                    </tr>

                    {sizeLimitControlMode === 'advanced' && (
                      <tr>
                        <td>{t('2-pass')}</td>
                        <td>
                          <Switch
                            checked={sizeLimitAdvancedTwoPass}
                            onCheckedChange={setSizeLimitAdvancedTwoPass}
                          />
                        </td>
                        <td>
                          <HelpIcon
                            onClick={onSizeLimitedAdvancedTwoPassHelpPress}
                          />
                        </td>
                      </tr>
                    )}

                    {sizeLimitControlMode === 'advanced' && (
                      <tr>
                        <td>{t('Preset')}</td>
                        <td>
                          <Select
                            value={advancedPresetValue}
                            onChange={withBlur((e) => handleAdvancedPresetChange(e.target.value))}
                            style={{ height: '1.8em' }}
                          >
                            {advancedPresetOptions.map(({ value, label }) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td>
                          <HelpIcon
                            onClick={onSizeLimitedAdvancedPresetHelpPress}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )}

                {!simpleMode && (
                  <tr>
                    <td>
                      {segmentsOrInverse.selected.length > 1
                        ? t('Export mode for {{segments}} segments', {
                          segments: segmentsOrInverse.selected.length,
                        })
                        : t('Export mode')}
                      {renderNotice(notices.specific['exportMode'], {})}
                    </td>
                    <td>
                      <ExportModeButton
                        selectedSegments={segmentsOrInverse.selected}
                        style={{ height: '1.8em' }}
                        allowSegmentsToChapters={!isSizeLimited}
                      />
                    </td>
                    <td>
                      {renderNoticeIcon(
                        notices.specific['exportMode'],
                        rightIconStyle,
                      ) ?? <HelpIcon onClick={onExportModeHelpPress} />}
                    </td>
                  </tr>
                )}

                <tr>
                  <td>{t('Output container format:')}</td>
                  <td>
                    {isSizeLimited ? (
                      <HighlightedText>mp4 - MPEG-4 Part 14</HighlightedText>
                    ) : (
                      renderOutFmt({ height: '1.8em', maxWidth: 150 })
                    )}
                  </td>
                  <td>
                    <HelpIcon onClick={onOutFmtHelpPress} />
                  </td>
                </tr>

                {!simpleMode && (
                  <>
                    <tr>
                      <td>
                        <Trans>Input has {{ numStreamsTotal }} tracks</Trans>
                        {renderNotice(notices.specific['problematicStreams'], {})}
                      </td>
                      <td>
                        <HighlightedText
                          style={{ cursor: 'pointer' }}
                          onClick={onShowStreamsSelectorClick}
                        >
                          <Trans>Keeping {{ numStreamsToCopy }} tracks</Trans>
                        </HighlightedText>
                      </td>
                      <td>
                        {renderNoticeIcon(
                          notices.specific['problematicStreams'],
                          rightIconStyle,
                        ) ?? <HelpIcon onClick={onTracksHelpPress} />}
                      </td>
                    </tr>

                    <tr>
                      <td>{t('Save output to path:')}</td>
                      <td>
                        <OutDirSelector>
                          <HighlightedText
                            role="button"
                            style={{ wordBreak: 'break-all', cursor: 'pointer' }}
                          >
                            {outputDir}
                          </HighlightedText>
                        </OutDirSelector>
                      </td>
                      <td />
                    </tr>

                    {canEditSegTemplate && (
                      <tr>
                        <td colSpan={2}>
                          {isSizeLimited
                          && sizeLimitSeparateNamingMode === 'auto'
                          && generateAutoCutFileNames != null ? (
                            <AutoNamePreview
                              title={t('Output name(s):', {
                                count: segmentsToExport.length,
                              })}
                              generateFileNames={generateAutoCutFileNames}
                              onCustomize={enableSizeLimitedSeparateCustomNaming}
                              currentSegIndexSafe={currentSegIndexSafe}
                            />
                            ) : (
                              <FileNameTemplateEditor
                                mode="separate"
                                template={
                                isSizeLimited
                                  ? (sizeLimitCutFileTemplate
                                    ?? defaultSizeLimitedCutFileTemplate)
                                  : (cutFileTemplate ?? defaultCutFileTemplate)
                              }
                                setTemplate={isSizeLimited ? setSizeLimitCutFileTemplate : setCutFileTemplate}
                                defaultTemplate={
                                isSizeLimited
                                  ? defaultSizeLimitedCutFileTemplate
                                  : defaultCutFileTemplate
                              }
                                generateFileNames={generateCutFileNames}
                                currentSegIndexSafe={currentSegIndexSafe}
                                onReset={
                                isSizeLimited
                                  ? () => setSizeLimitSeparateNamingMode('auto')
                                  : undefined
                              }
                                resetLabel={
                                isSizeLimited ? t('Use auto naming') : undefined
                              }
                              />
                            )}
                        </td>
                        <td>
                          <HelpIcon onClick={onCutFileTemplateHelpPress} />
                        </td>
                      </tr>
                    )}

                    {willMerge && (
                      <tr>
                        <td colSpan={2}>
                          {isSizeLimited
                          && sizeLimitMergedNamingMode === 'auto'
                          && generateAutoCutMergedFileNames != null ? (
                            <AutoNamePreview
                              title={t('Merged output file name:')}
                              generateFileNames={generateAutoCutMergedFileNames}
                              onCustomize={enableSizeLimitedMergedCustomNaming}
                            />
                            ) : (
                              <FileNameTemplateEditor
                                mode="merge-segments"
                                template={
                                isSizeLimited
                                  ? (sizeLimitCutMergedFileTemplate
                                    ?? defaultSizeLimitedCutMergedFileTemplate)
                                  : (cutMergedFileTemplate
                                    ?? defaultCutMergedFileTemplate)
                              }
                                setTemplate={isSizeLimited ? setSizeLimitCutMergedFileTemplate : setCutMergedFileTemplate}
                                defaultTemplate={
                                isSizeLimited
                                  ? defaultSizeLimitedCutMergedFileTemplate
                                  : defaultCutMergedFileTemplate
                              }
                                generateFileNames={generateCutMergedFileNames}
                                onReset={
                                isSizeLimited
                                  ? () => setSizeLimitMergedNamingMode('auto')
                                  : undefined
                              }
                                resetLabel={
                                isSizeLimited ? t('Use auto naming') : undefined
                              }
                              />
                            )}
                        </td>
                        <td>
                          <HelpIcon onClick={onCutMergedFileTemplateHelpPress} />
                        </td>
                      </tr>
                    )}
                  </>
                )}

                <tr>
                  <td>
                    {t('Overwrite existing files')}
                    {renderNotice(notices.specific['overwriteOutput'], {})}
                  </td>
                  <td>
                    <Switch
                      checked={enableOverwriteOutput}
                      onCheckedChange={setEnableOverwriteOutput}
                    />
                  </td>
                  <td>
                    {renderNoticeIcon(
                      notices.specific['overwriteOutput'],
                      rightIconStyle,
                    ) ?? (
                      <HelpIcon
                        onClick={() => showHelpText({
                          text: t(
                            'Overwrite files when exporting, if a file with the same name as the output file name exists?',
                          ),
                        })}
                      />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

              {!isSizeLimited && (
              <>
                <h3 style={{ marginBottom: '.5em' }}>
                  {t('Advanced options')}
                </h3>

                <table className={styles['options']}>
                  <colgroup>
                    <col style={{ width: '32%' }} />
                    <col />
                    <col style={{ width: '1.7em' }} />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          paddingTop: '.5em',
                          color: 'var(--gray-11)',
                          fontSize: '.9em',
                        }}
                        colSpan={2}
                      >
                        {t(
                          'Depending on your specific file/player, you may have to try different options for best results.',
                        )}
                      </td>
                      <td />
                    </tr>
                    {areWeCutting && (
                      <>
                        <AnimatedTr>
                          <td>{t('Shift all start times')}</td>
                          <td>
                            <ShiftTimes
                              values={adjustCutFromValues}
                              num={cutFromAdjustmentFrames}
                              setNum={setCutFromAdjustmentFrames}
                            />
                          </td>
                          <td>
                            <HelpIcon
                              onClick={onCutFromAdjustmentFramesHelpPress}
                            />
                          </td>
                        </AnimatedTr>
                        <AnimatedTr>
                          <td>{t('Shift all end times')}</td>
                          <td>
                            <ShiftTimes
                              values={adjustCutToValues}
                              num={cutToAdjustmentFrames}
                              setNum={setCutToAdjustmentFrames}
                            />
                          </td>
                          <td />
                        </AnimatedTr>
                      </>
                    )}

                    {isMov && (
                      <>
                        <AnimatedTr>
                          <td>{t('Enable MOV Faststart?')}</td>
                          <td>
                            <Switch
                              checked={movFastStart}
                              onCheckedChange={toggleMovFastStart}
                            />
                            {renderNotice(notices.specific['movFastStart'], {})}
                          </td>
                          <td>
                            {renderNoticeIcon(
                              notices.specific['movFastStart'],
                              rightIconStyle,
                            ) ?? <HelpIcon onClick={onMovFastStartHelpPress} />}
                          </td>
                        </AnimatedTr>

                        <AnimatedTr>
                          <td>
                            {t('Preserve all MP4/MOV metadata?')}
                            {renderNotice(
                              notices.specific['preserveMovData'],
                              {},
                            )}
                          </td>
                          <td>
                            <Switch
                              checked={preserveMovData}
                              onCheckedChange={togglePreserveMovData}
                            />
                          </td>
                          <td>
                            {renderNoticeIcon(
                              notices.specific['preserveMovData'],
                              rightIconStyle,
                            ) ?? (
                              <HelpIcon onClick={onPreserveMovDataHelpPress} />
                            )}
                          </td>
                        </AnimatedTr>
                      </>
                    )}

                    <AnimatedTr>
                      <td>{t('Preserve chapters')}</td>
                      <td>
                        <Switch
                          checked={preserveChapters}
                          onCheckedChange={togglePreserveChapters}
                        />
                      </td>
                      <td>
                        <HelpIcon onClick={onPreserveChaptersPress} />
                      </td>
                    </AnimatedTr>

                    <AnimatedTr>
                      <td>{t('Preserve metadata')}</td>
                      <td>
                        <Select
                          value={preserveMetadata}
                          onChange={(e) => setPreserveMetadata(
                              e.target.value as PreserveMetadata,
                          )}
                          style={{ height: 20, marginLeft: 5 }}
                        >
                          <option value="default">
                            {t('Default')}
                          </option>
                          <option value="none">
                            {t('None')}
                          </option>
                          <option value="nonglobal">
                            {t('Non-global')}
                          </option>
                        </Select>
                      </td>
                      <td>
                        <HelpIcon onClick={onPreserveMetadataHelpPress} />
                      </td>
                    </AnimatedTr>

                    {willMerge && (
                      <>
                        <AnimatedTr>
                          <td>
                            {t('Create chapters from merged segments? (slow)')}
                          </td>
                          <td>
                            <Switch
                              checked={segmentsToChapters}
                              onCheckedChange={toggleSegmentsToChapters}
                            />
                          </td>
                          <td>
                            <HelpIcon onClick={onSegmentsToChaptersHelpPress} />
                          </td>
                        </AnimatedTr>

                        <AnimatedTr>
                          <td>
                            {t(
                              'Preserve original metadata when merging? (slow)',
                            )}
                          </td>
                          <td>
                            <Switch
                              checked={preserveMetadataOnMerge}
                              onCheckedChange={togglePreserveMetadataOnMerge}
                            />
                          </td>
                          <td>
                            <HelpIcon
                              onClick={onPreserveMetadataOnMergeHelpPress}
                            />
                          </td>
                        </AnimatedTr>
                      </>
                    )}

                    {areWeCutting && (
                      <>
                        <AnimatedTr>
                          <td>
                            {t('Smart cut (experimental):')}
                            {renderNotice(notices.specific['smartCut'], {})}
                          </td>
                          <td>
                            <Switch
                              checked={enableSmartCut}
                              onCheckedChange={() => setEnableSmartCut((v) => !v)}
                            />
                          </td>
                          <td>
                            {renderNoticeIcon(
                              notices.specific['smartCut'],
                              rightIconStyle,
                            ) ?? <HelpIcon onClick={onSmartCutHelpPress} />}
                          </td>
                        </AnimatedTr>

                        {!isEncoding && (
                          <AnimatedTr>
                            <td>
                              {t('Keyframe cut mode')}
                              {renderNotice(notices.specific['cutMode'], {})}
                            </td>
                            <td>
                              <Switch
                                checked={keyframeCut}
                                onCheckedChange={() => toggleKeyframeCut()}
                              />
                            </td>
                            <td>
                              {renderNoticeIcon(
                                notices.specific['cutMode'],
                                rightIconStyle,
                              ) ?? (
                                <HelpIcon onClick={onKeyframeCutHelpPress} />
                              )}
                            </td>
                          </AnimatedTr>
                        )}
                      </>
                    )}

                    {isEncoding && (
                      <AnimatedTr>
                        <td>{t('Smart cut auto detect bitrate')}</td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                            }}
                          >
                            {encBitrate != null && (
                              <>
                                <TextInput
                                  value={encBitrate}
                                  onChange={handleEncBitrateChange}
                                  style={{
                                    width: '4em',
                                    flexGrow: 0,
                                    marginRight: '.3em',
                                  }}
                                />
                                <span style={{ marginRight: '.3em' }}>
                                  {t('kbit/s')}
                                </span>
                              </>
                            )}
                            <span>
                              <Switch
                                checked={encBitrate == null}
                                onCheckedChange={handleEncBitrateToggle}
                              />
                            </span>
                          </div>
                        </td>
                        <td />
                      </AnimatedTr>
                    )}

                    {lossyMode != null && (
                      <AnimatedTr>
                        <td>{t('Lossy mode')}</td>
                        <td>
                          <Switch disabled checked={lossyMode != null} />
                          <div>{lossyMode.videoEncoder}</div>
                        </td>
                        <td />
                      </AnimatedTr>
                    )}

                    {!isEncoding && (
                      <AnimatedTr>
                        <td>
                          &quot;ffmpeg&quot;{' '}
                          <code className="highlighted">avoid_negative_ts</code>
                          {renderNotice(
                            notices.specific['avoidNegativeTs'],
                            {},
                          )}
                        </td>
                        <td>
                          <Select
                            value={avoidNegativeTs}
                            onChange={(e) => setAvoidNegativeTs(
                                e.target.value as AvoidNegativeTs,
                            )}
                            style={{ height: 20, marginLeft: 5 }}
                          >
                            <option value="auto">
                              auto
                            </option>
                            <option value="make_zero">
                              make_zero
                            </option>
                            <option value="make_non_negative">
                              make_non_negative
                            </option>
                            <option value="disabled">
                              disabled
                            </option>
                          </Select>
                        </td>
                        <td>
                          {renderNoticeIcon(
                            notices.specific['avoidNegativeTs'],
                            rightIconStyle,
                          ) ?? (
                            <HelpIcon onClick={onAvoidNegativeTsHelpPress} />
                          )}
                        </td>
                      </AnimatedTr>
                    )}

                    <AnimatedTr>
                      <td>{t('"ffmpeg" experimental flag')}</td>
                      <td>
                        <Switch
                          checked={ffmpegExperimental}
                          onCheckedChange={setFfmpegExperimental}
                        />
                      </td>
                      <td>
                        <HelpIcon onClick={onFfmpegExperimentalHelpPress} />
                      </td>
                    </AnimatedTr>

                    <AnimatedTr>
                      <td>{t('More settings')}</td>
                      <td>
                        <IoIosSettings
                          size={24}
                          role="button"
                          onClick={toggleSettings}
                          style={{ marginLeft: 5 }}
                        />
                      </td>
                      <td />
                    </AnimatedTr>
                  </tbody>
                </table>
              </>
              )}
          </div>
        )}
      </div>
    </ExportSheet>
  );
}

export default memo(ExportConfirm);
