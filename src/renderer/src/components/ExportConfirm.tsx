import type { CSSProperties, ChangeEvent, Dispatch, ReactNode, SetStateAction } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FaExclamationTriangle, FaInfoCircle, FaRegCheckCircle } from 'react-icons/fa';
import i18n from 'i18next';
import { useTranslation, Trans } from 'react-i18next';
import { IoIosHelpCircle, IoIosSettings } from 'react-icons/io';
import type { SweetAlertIcon } from 'sweetalert2';

import ExportButton from './ExportButton';
import ExportModeButton from './ExportModeButton';
import FileNameTemplateEditor from './FileNameTemplateEditor';
import HighlightedText from './HighlightedText';
import Select from './Select';
import Switch from './Switch';
import Button from './Button';

import { primaryTextColor, warningColor } from '../colors';
import { withBlur } from '../util';
import getSwal from '../swal';
import { isMov as ffmpegIsMov } from '../util/streams';
import useUserSettings from '../hooks/useUserSettings';
import styles from './ExportConfirm.module.css';
import type { SegmentToExport, SizeLimitedEncoderCapabilities } from '../types';
import type { GenerateOutFileNames, GeneratedOutFileNames } from '../util/outputNameTemplate';
import { defaultCutFileTemplate, defaultCutMergedFileTemplate, defaultSizeLimitedCutFileTemplate, defaultSizeLimitedCutMergedFileTemplate } from '../util/outputNameTemplate';
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
} from '../../../common/types';
import TextInput from './TextInput';
import type { UseSegments } from '../hooks/useSegments';
import ExportSheet from './ExportSheet';
import ToggleExportConfirm from './ToggleExportConfirm';
import type { LossyMode } from '../../../main';
import AnimatedTr from './AnimatedTr';
import type { Frame } from '../ffmpeg';
import type { FindNearestKeyframeTime } from '../hooks/useKeyframes';
import { troubleshootingUrl } from '../../../common/constants';
import OutDirSelector from './OutDirSelector';
import { getSizeLimitedEncoderCapabilities } from '../sizeLimitedExport';

const remote = window.require('@electron/remote');
const { shell } = remote;


const noticeStyle: CSSProperties = { marginBottom: '.5em' };
const infoStyle: CSSProperties = { ...noticeStyle, color: primaryTextColor };
const warningStyle: CSSProperties = { ...noticeStyle, color: warningColor };

const rightIconStyle: CSSProperties = { fontSize: '1.2em', verticalAlign: 'middle' };

const adjustCutFromValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const adjustCutToValues = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const av1CpuPresetOptions = Array.from({ length: 14 }, (_, index) => index);
const nvencPresetOptions = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const satisfies readonly SizeLimitAdvancedNvencPreset[];
const h264CpuPresetOptions = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const satisfies readonly SizeLimitAdvancedH264CpuPreset[];

const HelpIcon = ({ onClick, style }: { onClick: () => void, style?: CSSProperties }) => (
  <IoIosHelpCircle role="button" onClick={withBlur(onClick)} style={{ cursor: 'pointer', color: primaryTextColor, verticalAlign: 'middle', fontSize: '1.5em', ...style }} />
);

function ShiftTimes({ values, num, setNum }: { values: number[], num: number, setNum: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={num} onChange={(e) => setNum(Number(e.target.value))} style={{ height: 20, marginLeft: 5 }}>
      {values.map((v) => <option key={v} value={v}>{t('{{numFrames}} frames', { numFrames: v >= 0 ? `+${v}` : v, count: v })}</option>)}
    </Select>
  );
}

function renderNoticeIcon(notice: { warning?: boolean | undefined } | undefined, style?: CSSProperties) {
  if (!notice) return undefined;
  return notice.warning ? (
    <FaExclamationTriangle style={{ flexShrink: '0', fontSize: '.8em', verticalAlign: 'baseline', color: warningColor, ...style }} />
  ) : (
    <FaInfoCircle style={{ flexShrink: '0', fontSize: '.8em', verticalAlign: 'baseline', color: 'var(--blue-10)', ...style }} />
  );
}

interface Notice {
  warning?: true,
  text: ReactNode,
}

interface GenericNotice {
  warning?: true,
  text: string,
  url?: string,
}

function renderNotice(notice: Notice | GenericNotice | undefined, { style }: { style?: CSSProperties }) {
  if (notice == null) return null;
  const { warning, text } = notice;
  const url = 'url' in notice ? notice.url : undefined;
  return (
    <div key={typeof notice.text === 'string' ? notice.text : undefined} style={{ ...(warning ? warningStyle : infoStyle), display: 'flex', alignItems: 'center', gap: '0 .5em', ...style }}>
      {renderNoticeIcon({ warning }, { fontSize: '1em', flexShrink: 0 })} <span style={{ fontSize: '.9em' }}>{text}</span>{url != null && <IoIosHelpCircle style={{ cursor: 'pointer', fontSize: '1.5em', flexShrink: 0, color: primaryTextColor }} title={i18n.t('Learn more')} role="button" tabIndex={0} onClick={() => shell.openExternal(url)} />}
    </div>
  );
}

function AutoNamePreview({
  title,
  generateFileNames,
  onCustomize,
  currentSegIndexSafe,
}: {
  title: string,
  generateFileNames: () => Promise<GeneratedOutFileNames>,
  onCustomize: () => void,
  currentSegIndexSafe?: number | undefined,
}) {
  const { t } = useTranslation();
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
      <div>{title}</div>
      <div style={{ marginBottom: '.3em' }}>
        <HighlightedText style={{ wordBreak: 'break-word' }}>{previewName ?? t('Generating preview...')}</HighlightedText>
      </div>
      <Button onClick={onCustomize} style={{ padding: '.25em .7em' }}>{t('Customize')}</Button>
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
} : {
  areWeCutting: boolean,
  segmentsToExport: SegmentToExport[],
  willMerge: boolean,
  visible: boolean,
  onClosePress: () => void,
  onExportConfirm: () => void,
  outFormat: string | undefined,
  renderOutFmt: (style: CSSProperties) => JSX.Element,
  outputDir: string | undefined,
  numStreamsTotal: number,
  numStreamsToCopy: number,
  onShowStreamsSelectorClick: () => void,
  cutFileTemplate: string | undefined,
  cutMergedFileTemplate: string | undefined,
  generateCutFileNames: GenerateOutFileNames,
  generateCutMergedFileNames: GenerateOutFileNames,
  generateAutoCutFileNames?: (() => Promise<GeneratedOutFileNames>) | undefined,
  generateAutoCutMergedFileNames?: (() => Promise<GeneratedOutFileNames>) | undefined,
  currentSegIndexSafe: number,
  segmentsOrInverse: UseSegments['segmentsOrInverse'],
  mainCopiedThumbnailStreams: FFprobeStream[],
  needSmartCut: boolean,
  isEncoding: boolean,
  encBitrate: number | undefined,
  setEncBitrate: Dispatch<SetStateAction<number | undefined>>,
  toggleSettings: () => void,
  outputPlaybackRate: number,
  lossyMode: LossyMode | undefined,
  neighbouringKeyFrames: Frame[],
  findNearestKeyFrameTime: FindNearestKeyframeTime,
}) {
  const { t } = useTranslation();

  const { keyframeCut, toggleKeyframeCut, preserveMovData, setPreserveMovData, preserveMetadata, setPreserveMetadata, preserveChapters, setPreserveChapters, movFastStart, setMovFastStart, avoidNegativeTs, setAvoidNegativeTs, autoDeleteMergedSegments, exportConfirmEnabled, toggleExportConfirmEnabled, segmentsToChapters, setSegmentsToChapters, setSegmentsToChaptersOnly, preserveMetadataOnMerge, setPreserveMetadataOnMerge, enableSmartCut, setEnableSmartCut, effectiveExportMode, enableOverwriteOutput, setEnableOverwriteOutput, ffmpegExperimental, setFfmpegExperimental, cutFromAdjustmentFrames, setCutFromAdjustmentFrames, cutToAdjustmentFrames, setCutToAdjustmentFrames, setCutFileTemplate, setCutMergedFileTemplate, simpleMode, keyframesEnabled, exportEncodeMode, setExportEncodeMode, sizeLimitMb, setSizeLimitMb, sizeLimitControlMode, setSizeLimitControlMode, sizeLimitPreset, setSizeLimitPreset, sizeLimitAdvancedEncoder, setSizeLimitAdvancedEncoder, sizeLimitAdvancedTwoPass, setSizeLimitAdvancedTwoPass, sizeLimitAdvancedAv1CpuPreset, setSizeLimitAdvancedAv1CpuPreset, sizeLimitAdvancedAv1NvencPreset, setSizeLimitAdvancedAv1NvencPreset, sizeLimitAdvancedH264CpuPreset, setSizeLimitAdvancedH264CpuPreset, sizeLimitAdvancedH264NvencPreset, setSizeLimitAdvancedH264NvencPreset, sizeLimitSeparateNamingMode, setSizeLimitSeparateNamingMode, sizeLimitMergedNamingMode, setSizeLimitMergedNamingMode } = useUserSettings();

  const [showAdvanced, setShowAdvanced] = useState(!simpleMode);
  const togglePreserveChapters = useCallback(() => setPreserveChapters((val) => !val), [setPreserveChapters]);
  const togglePreserveMovData = useCallback(() => setPreserveMovData((val) => !val), [setPreserveMovData]);
  const toggleMovFastStart = useCallback(() => setMovFastStart((val) => !val), [setMovFastStart]);
  const toggleSegmentsToChapters = useCallback(() => setSegmentsToChapters((v) => !v), [setSegmentsToChapters]);
  const togglePreserveMetadataOnMerge = useCallback(() => setPreserveMetadataOnMerge((v) => !v), [setPreserveMetadataOnMerge]);

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
  }, [isSizeLimited]);

  useEffect(() => {
    if (!isSizeLimited) return;
    if (effectiveExportMode === 'segments_to_chapters') {
      setSegmentsToChaptersOnly(false);
    }
  }, [effectiveExportMode, isSizeLimited, setSegmentsToChaptersOnly]);

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
    const specific: Record<'exportMode' | 'problematicStreams' | 'movFastStart' | 'preserveMovData' | 'smartCut' | 'cutMode' | 'avoidNegativeTs' | 'overwriteOutput', Notice | undefined> = {
      exportMode: effectiveExportMode === 'segments_to_chapters' ? { text: i18n.t('Segments to chapters mode is active, this means that the file will not be cut. Instead chapters will be created from the segments.') } : undefined,
      problematicStreams: !isSizeLimited && areWeCuttingProblematicStreams ? { warning: true, text: <Trans>Warning: Cutting thumbnail tracks is known to cause problems. Consider disabling track {{ trackNumber: mainCopiedThumbnailStreams[0] ? mainCopiedThumbnailStreams[0].index + 1 : 0 }}.</Trans> } : undefined,
      movFastStart: isMov && isIpod && !movFastStart ? { warning: true, text: t('For the ipod format, it is recommended to activate this option') } : undefined,
      preserveMovData: isMov && isIpod && preserveMovData ? { warning: true, text: t('For the ipod format, it is recommended to deactivate this option') } : undefined,
      smartCut: areWeCutting && needSmartCut ? { warning: true, text: t('Smart cut is experimental and will not work on all files.') } : undefined,
      cutMode: areWeCutting && !isEncoding && !keyframeCut ? { text: t('Note: Keyframe cut is recommended for most common files') } : undefined,
      avoidNegativeTs: !isEncoding ? (() => {
        if (willMerge) {
          if (avoidNegativeTs !== 'make_non_negative') {
            return { text: t('When merging, it\'s generally recommended to set this to "make_non_negative"') };
          }
          return undefined;
        }
        if (!['make_zero', 'auto'].includes(avoidNegativeTs)) {
          return { text: t('It\'s generally recommended to set this to one of: {{values}}', { values: '"auto", "make_zero"' }) };
        }
        return undefined;
      })() : undefined,
      overwriteOutput: enableOverwriteOutput ? { text: t('Existing files will be overwritten without warning!') } : undefined,
    };

    const generic: GenericNotice[] = [];

    if ((effectiveExportMode === 'separate' || effectiveExportMode === 'merge' || effectiveExportMode === 'merge+separate') && !areWeCutting) {
      generic.push({ text: t('Exporting whole file without cutting, because there are no segments to export.') });
    }

    if (areWeCutting) {
      // https://github.com/mifi/lossless-cut/issues/1809
      if (isSizeLimited) {
        generic.push({ text: t('Size-limited export creates a shareable MP4 and keeps only the main video plus one audio track.') });
      }
      if (effectiveOutFormat === 'flac') {
        generic.push({ text: t('There is a known issue in FFmpeg with cutting FLAC files. The file will be re-encoded, which is still lossless, but the export may be slower.') });
      }
      if (outputPlaybackRate !== 1) {
        generic.push({ warning: true, text: t('Adjusting the output FPS and cutting at the same time will cause incorrect cuts. Consider instead doing it in two separate steps.') });
      }
      if (keyframesEnabled && haveSegmentWithProblematicKeyframe) {
        generic.push({ warning: true, text: t('A segment may result in an unexpectedly long output file length after exporting, because your video file doesn\'t have any keyframes near the start time of the segment you\'re trying to cut.'), url: troubleshootingUrl });
      }
    }

    return {
      generic,
      specific,
      totalNum: generic.filter((n) => n.warning).length + Object.values(specific).filter((n) => n != null && n.warning).length,
    };
  }, [areWeCutting, areWeCuttingProblematicStreams, avoidNegativeTs, effectiveExportMode, effectiveOutFormat, enableOverwriteOutput, haveSegmentWithProblematicKeyframe, isEncoding, isIpod, isMov, isSizeLimited, keyframeCut, keyframesEnabled, mainCopiedThumbnailStreams, movFastStart, needSmartCut, outputPlaybackRate, preserveMovData, t, willMerge]);

  const exportModeDescription = useMemo(() => ({
    segments_to_chapters: t('Don\'t cut the file, but instead export an unmodified original which has chapters generated from segments'),
    merge: t('Auto merge segments to one file after export'),
    'merge+separate': t('Auto merge segments into one file after export, but keep exported per-segment files too'),
    separate: t('Export each segment to a separate file'),
  })[effectiveExportMode], [effectiveExportMode, t]);

  const showHelpText = useCallback(({ icon = 'info', timer = 10000, text }: { icon?: SweetAlertIcon, timer?: number, text: string }) => getSwal().toast.fire({ icon, timer, text }), []);

  const onPreserveChaptersPress = useCallback(() => {
    showHelpText({ text: i18n.t('Whether to preserve chapters from source file.') });
  }, [showHelpText]);

  const onPreserveMovDataHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('Preserve all MOV/MP4 metadata tags (e.g. EXIF, GPS position etc.) from source file? Note that some players have trouble playing back files where all metadata is preserved, like iTunes and other Apple software') });
  }, [showHelpText]);

  const onPreserveMetadataHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('Whether to preserve metadata from source file. Default: Global (file metadata), per-track and per-chapter metadata will be copied. Non-global: Only per-track and per-chapter metadata will be copied. None: No metadata will be copied') });
  }, [showHelpText]);

  const onMovFastStartHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('Enabling this will allow faster playback of the exported file. This makes processing use 3 times as much export I/O, which is negligible for small files but might slow down exporting of large files.') });
  }, [showHelpText]);

  const onOutFmtHelpPress = useCallback(() => {
    showHelpText({ text: isSizeLimited ? t('Size-limited export is forced to MP4 in MVP so the result is immediately shareable.') : i18n.t('Defaults to same format as input file. You can losslessly change the file format (container) of the file with this option. Not all formats support all codecs. Matroska/MP4/MOV support the most common codecs. Sometimes it\'s even impossible to export to the same output format as input.') });
  }, [isSizeLimited, showHelpText, t]);

  const onExportEncodeModeHelpPress = useCallback(() => {
    showHelpText({ text: isSizeLimited ? t('Size-limited export makes a shareable MP4 and retries internally until the file lands under your requested size.') : t('Lossless export keeps the original ClipPress workflow and exports without built-in re-encoding.') });
  }, [isSizeLimited, showHelpText, t]);

  const onTargetSizeHelpPress = useCallback(() => {
    showHelpText({ text: t('ClipPress will try to keep every produced file slightly under this size, so it is ready to share.') });
  }, [showHelpText, t]);

  const onSizeLimitedControlModeHelpPress = useCallback(() => {
    showHelpText({ text: t('Simple mode chooses a goal-focused preset for you. Advanced mode exposes the exact encoder path, preset, and 2-pass option directly.') });
  }, [showHelpText, t]);

  const onSizeLimitedPresetHelpPress = useCallback(() => {
    showHelpText({ text: t('Max Quality chases the best-looking result under the cap. Quality is the recommended everyday balance. Fast prioritizes speed while keeping the result shareable.') });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedEncoderHelpPress = useCallback(() => {
    showHelpText({ text: t('Choose the exact encoder path directly in Advanced mode. AV1 CPU prioritizes premium quality, AV1 NVIDIA prioritizes faster AV1, H.264 CPU is the compatibility CPU path, and H.264 NVIDIA is the fastest GPU-backed H.264 path.') });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedTwoPassHelpPress = useCallback(() => {
    showHelpText({ text: t('Turn this on to use true ffmpeg 2-pass encoding for the selected encoder path. ClipPress will show Pass 1/2 and Pass 2/2 during export when this is enabled.') });
  }, [showHelpText, t]);

  const onSizeLimitedAdvancedPresetHelpPress = useCallback(() => {
    showHelpText({ text: t('Advanced mode exposes the encoder’s real preset ladder. Lower SVT-AV1 numbers and higher NVENC or x264 preset levels usually trade more time for more compression efficiency.') });
  }, [showHelpText, t]);

  const handleExportEncodeModeChange = useCallback((value: ExportEncodeMode) => {
    setExportEncodeMode(value);
    if (value === 'size_limited' && effectiveExportMode === 'segments_to_chapters') {
      setSegmentsToChaptersOnly(false);
    }
  }, [effectiveExportMode, setExportEncodeMode, setSegmentsToChaptersOnly]);

  const handleSizeLimitMbChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(e.target.value);
    if (Number.isNaN(nextValue) || nextValue <= 0) return;
    setSizeLimitMb(nextValue);
  }, [setSizeLimitMb]);

  const presetDescription = useMemo(() => ({
    max_quality: t('Best-looking result under the limit. Slower is acceptable.'),
    quality: t('Recommended everyday balance for most shareable clips.'),
    fast: t('Good everyday shareable quality with quicker export.'),
  })[sizeLimitPreset], [sizeLimitPreset, t]);

  const advancedEncoderUnavailableMessage = useMemo(() => {
    if (encoderCapabilities == null) return undefined;

    if (sizeLimitAdvancedEncoder === 'av1_cpu' && !encoderCapabilities.libsvtav1) return t('AV1 CPU (SVT-AV1) is unavailable in this bundled ffmpeg build.');
    if (sizeLimitAdvancedEncoder === 'av1_nvenc' && !encoderCapabilities.av1Nvenc) return t('AV1 NVIDIA (NVENC) is unavailable on this system.');
    if (sizeLimitAdvancedEncoder === 'h264_cpu' && !encoderCapabilities.libx264) return t('H.264 CPU (x264) is unavailable in this bundled ffmpeg build.');
    if (sizeLimitAdvancedEncoder === 'h264_nvenc' && !encoderCapabilities.h264Nvenc) return t('H.264 NVIDIA (NVENC) is unavailable on this system.');
    return undefined;
  }, [encoderCapabilities, sizeLimitAdvancedEncoder, t]);

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
  }, [sizeLimitAdvancedAv1CpuPreset, sizeLimitAdvancedAv1NvencPreset, sizeLimitAdvancedEncoder, sizeLimitAdvancedH264CpuPreset, sizeLimitAdvancedH264NvencPreset]);

  const handleAdvancedPresetChange = useCallback((value: string) => {
    switch (sizeLimitAdvancedEncoder) {
      case 'av1_cpu': {
        setSizeLimitAdvancedAv1CpuPreset(Number(value));
        break;
      }
      case 'av1_nvenc': {
        setSizeLimitAdvancedAv1NvencPreset(value as SizeLimitAdvancedNvencPreset);
        break;
      }
      case 'h264_cpu': {
        setSizeLimitAdvancedH264CpuPreset(value as SizeLimitAdvancedH264CpuPreset);
        break;
      }
      case 'h264_nvenc': {
        setSizeLimitAdvancedH264NvencPreset(value as SizeLimitAdvancedNvencPreset);
        break;
      }
      default: {
        break;
      }
    }
  }, [setSizeLimitAdvancedAv1CpuPreset, setSizeLimitAdvancedAv1NvencPreset, setSizeLimitAdvancedH264CpuPreset, setSizeLimitAdvancedH264NvencPreset, sizeLimitAdvancedEncoder]);

  const advancedPresetOptions = useMemo(() => {
    switch (sizeLimitAdvancedEncoder) {
      case 'av1_cpu': {
        return av1CpuPresetOptions.map((value) => ({ value: String(value), label: String(value) }));
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
    showHelpText({ text: i18n.t('With "keyframe cut", we will cut at the nearest keyframe before the desired start cutpoint. This is recommended for most files. With "Normal cut" you may have to manually set the cutpoint a few frames before the next keyframe to achieve a precise cut') });
  }, [showHelpText]);

  const onSmartCutHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('This experimental feature will re-encode the part of the video from the cutpoint until the next keyframe in order to attempt to make a 100% accurate cut. It only works on some files. Reports so far suggest better luck with some h264 files and only a few h265 files. See more here: {{url}}', { url: 'https://github.com/mifi/lossless-cut/issues/126' }) });
  }, [showHelpText]);

  const onTracksHelpPress = useCallback(() => {
    showHelpText({ text: isSizeLimited ? t('Size-limited export keeps only the main video plus one audio track in MVP to keep the output shareable and predictable.') : i18n.t('Not all formats support all track types, and ClipPress is unable to properly cut some track types, so you may have to sacrifice some tracks by disabling them in order to get correct result.') });
  }, [isSizeLimited, showHelpText, t]);

  const onSegmentsToChaptersHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('When merging, do you want to create chapters in the merged file, according to the cut segments? NOTE: This may dramatically increase processing time') });
  }, [showHelpText]);

  const onPreserveMetadataOnMergeHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('When merging, do you want to preserve metadata from your original file? NOTE: This may dramatically increase processing time') });
  }, [showHelpText]);

  const onCutFileTemplateHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('You can customize the file name of the output segment(s) using special variables.', { count: segmentsToExport.length }) });
  }, [segmentsToExport.length, showHelpText]);

  const onCutMergedFileTemplateHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('You can customize the file name of the merged file using special variables.') });
  }, [showHelpText]);

  const onExportModeHelpPress = useCallback(() => {
    showHelpText({ text: exportModeDescription });
  }, [exportModeDescription, showHelpText]);

  const onAvoidNegativeTsHelpPress = useCallback(() => {
    // https://ffmpeg.org/ffmpeg-all.html#Format-Options
    // https://github.com/mifi/lossless-cut/issues/1206
    const texts = {
      make_non_negative: i18n.t('Shift timestamps to make them non-negative. Also note that this affects only leading negative timestamps, and not non-monotonic negative timestamps.'),
      make_zero: i18n.t('Shift timestamps so that the first timestamp is 0. (ClipPress default)'),
      auto: i18n.t('Enables shifting when required by the target format.'),
      disabled: i18n.t('Disables shifting of timestamp.'),
    };
    showHelpText({ text: `${avoidNegativeTs}: ${texts[avoidNegativeTs]}` });
  }, [avoidNegativeTs, showHelpText]);

  const onCutFromAdjustmentFramesHelpPress = useCallback(() => {
    showHelpText({ text: i18n.t('This option allows you to shift all segment start times forward by one or more frames before cutting. This can be useful if the output video starts from the wrong (preceding) keyframe.') });
  }, [showHelpText]);

  const onFfmpegExperimentalHelpPress = useCallback(() => {
    showHelpText({ text: t('Enable experimental ffmpeg features flag?') });
  }, [showHelpText, t]);

  const canEditSegTemplate = !willMerge || !autoDeleteMergedSegments;

  const handleEncBitrateToggle = useCallback((checked: boolean) => {
    setEncBitrate(() => (checked ? undefined : 10000));
  }, [setEncBitrate]);

  const handleEncBitrateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isNaN(v) || v <= 0) return;
    setEncBitrate(v);
  }, [setEncBitrate]);

  const enableSizeLimitedSeparateCustomNaming = useCallback(() => {
    if (cutFileTemplate == null) setCutFileTemplate(defaultSizeLimitedCutFileTemplate);
    setSizeLimitSeparateNamingMode('custom_template');
  }, [cutFileTemplate, setCutFileTemplate, setSizeLimitSeparateNamingMode]);

  const enableSizeLimitedMergedCustomNaming = useCallback(() => {
    if (cutMergedFileTemplate == null) setCutMergedFileTemplate(defaultSizeLimitedCutMergedFileTemplate);
    setSizeLimitMergedNamingMode('custom_template');
  }, [cutMergedFileTemplate, setCutMergedFileTemplate, setSizeLimitMergedNamingMode]);

  return (
    <ExportSheet
      width="50em"
      visible={visible}
      title={t('Export options')}
      onClosePress={onClosePress}
      renderButton={() => (
        <ExportButton segmentsToExport={segmentsToExport} areWeCutting={areWeCutting} onClick={withBlur(() => onExportConfirm())} style={{ fontSize: '1.3em' }} />
      )}
      renderBottom={() => (
        <>
          <ToggleExportConfirm size="1.5em" />
          <div style={{ fontSize: '.8em', marginLeft: '.4em', marginRight: '.5em', maxWidth: '8.5em', lineHeight: '100%', color: exportConfirmEnabled ? 'var(--gray-12)' : 'var(--gray-11)', cursor: 'pointer' }} role="button" onClick={toggleExportConfirmEnabled}>
            {t('Show this page before exporting?')}
          </div>
          {notices.totalNum > 0 && (
            renderNoticeIcon({ warning: true }, { fontSize: '1.5em', marginRight: '.5em' })
          )}
        </>
      )}
    >
      <table className={styles['options']}>
        <tbody>
          <tr>
            <td colSpan={2}>
              {notices.generic.map((notice) => renderNotice(notice, {}))}
            </td>
            <td />
          </tr>

          {segmentsOrInverse.selected.length !== segmentsOrInverse.all.length && (
            <tr>
              <td colSpan={2}>
                <FaRegCheckCircle size={12} style={{ marginRight: 3 }} />{t('{{selectedSegments}} of {{nonFilteredSegments}} segments selected', { selectedSegments: segmentsOrInverse.selected.length, nonFilteredSegments: segmentsOrInverse.all.length })}
              </td>
              <td />
            </tr>
          )}

          <tr>
            <td>
              {t('Export type')}
            </td>
            <td>
              <Select value={exportEncodeMode} onChange={withBlur((e) => handleExportEncodeModeChange(e.target.value as ExportEncodeMode))} style={{ height: '1.8em' }}>
                <option value={'lossless' satisfies ExportEncodeMode}>{t('Lossless export')}</option>
                <option value={'size_limited' satisfies ExportEncodeMode}>{t('Limit file size')}</option>
              </Select>
            </td>
            <td>
              <HelpIcon onClick={onExportEncodeModeHelpPress} />
            </td>
          </tr>

          {isSizeLimited && (
            <>
              <tr>
                <td>
                  {t('Target file size')}
                </td>
                <td>
                  <div style={{ display: 'inline-flex', justifyContent: 'flex-end', alignItems: 'center', gap: '.4em', width: '100%' }}>
                    <TextInput type="number" min={1} step={0.1} value={sizeLimitMb} onChange={handleSizeLimitMbChange} style={{ width: '6em', flexGrow: 0, textAlign: 'right' }} />
                    <span>{t('MB')}</span>
                  </div>
                </td>
                <td>
                  <HelpIcon onClick={onTargetSizeHelpPress} />
                </td>
              </tr>

              <tr>
                <td>
                  {t('Controls')}
                </td>
                <td>
                  <Select value={sizeLimitControlMode} onChange={withBlur((e) => setSizeLimitControlMode(e.target.value as SizeLimitControlMode))} style={{ height: '1.8em' }}>
                    <option value={'simple' satisfies SizeLimitControlMode}>{t('Simple')}</option>
                    <option value={'advanced' satisfies SizeLimitControlMode}>{t('Advanced')}</option>
                  </Select>
                </td>
                <td>
                  <HelpIcon onClick={onSizeLimitedControlModeHelpPress} />
                </td>
              </tr>

              <tr>
                <td>
                  {sizeLimitControlMode === 'simple' ? t('Preset') : t('Encoder')}
                </td>
                <td>
                  {sizeLimitControlMode === 'simple' ? (
                    <>
                      <Select value={sizeLimitPreset} onChange={withBlur((e) => setSizeLimitPreset(e.target.value as SizeLimitPreset))} style={{ height: '1.8em' }}>
                        <option value={'max_quality' satisfies SizeLimitPreset}>{t('Max Quality')}</option>
                        <option value={'quality' satisfies SizeLimitPreset}>{t('Quality')}</option>
                        <option value={'fast' satisfies SizeLimitPreset}>{t('Fast')}</option>
                      </Select>
                      <div style={{ marginTop: '.35em', fontSize: '.88em', color: 'var(--gray-11)' }}>{presetDescription}</div>
                    </>
                  ) : (
                    <>
                      <Select value={sizeLimitAdvancedEncoder} onChange={withBlur((e) => setSizeLimitAdvancedEncoder(e.target.value as SizeLimitAdvancedEncoder))} style={{ height: '1.8em' }}>
                        <option value={'av1_cpu' satisfies SizeLimitAdvancedEncoder} disabled={encoderCapabilities != null && !encoderCapabilities.libsvtav1}>{t('AV1 CPU (SVT-AV1)')}</option>
                        <option value={'av1_nvenc' satisfies SizeLimitAdvancedEncoder} disabled={encoderCapabilities != null && !encoderCapabilities.av1Nvenc}>{t('AV1 NVIDIA (NVENC)')}</option>
                        <option value={'h264_cpu' satisfies SizeLimitAdvancedEncoder} disabled={encoderCapabilities != null && !encoderCapabilities.libx264}>{t('H.264 CPU (x264)')}</option>
                        <option value={'h264_nvenc' satisfies SizeLimitAdvancedEncoder} disabled={encoderCapabilities != null && !encoderCapabilities.h264Nvenc}>{t('H.264 NVIDIA (NVENC)')}</option>
                      </Select>
                      {advancedEncoderUnavailableMessage != null && <div style={{ marginTop: '.35em', fontSize: '.88em', color: warningColor }}>{advancedEncoderUnavailableMessage}</div>}
                    </>
                  )}
                </td>
                <td>
                  <HelpIcon onClick={sizeLimitControlMode === 'simple' ? onSizeLimitedPresetHelpPress : onSizeLimitedAdvancedEncoderHelpPress} />
                </td>
              </tr>

              {sizeLimitControlMode === 'advanced' && (
                <tr>
                  <td>
                    {t('2-pass')}
                  </td>
                  <td>
                    <Switch checked={sizeLimitAdvancedTwoPass} onCheckedChange={setSizeLimitAdvancedTwoPass} />
                  </td>
                  <td>
                    <HelpIcon onClick={onSizeLimitedAdvancedTwoPassHelpPress} />
                  </td>
                </tr>
              )}

              {sizeLimitControlMode === 'advanced' && (
                <tr>
                  <td>
                    {t('Preset')}
                  </td>
                  <td>
                    <Select value={advancedPresetValue} onChange={withBlur((e) => handleAdvancedPresetChange(e.target.value))} style={{ height: '1.8em' }}>
                      {advancedPresetOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </td>
                  <td>
                    <HelpIcon onClick={onSizeLimitedAdvancedPresetHelpPress} />
                  </td>
                </tr>
              )}
            </>
          )}

          <tr>
            <td>
              {segmentsOrInverse.selected.length > 1 ? t('Export mode for {{segments}} segments', { segments: segmentsOrInverse.selected.length }) : t('Export mode')}
              {renderNotice(notices.specific['exportMode'], {})}
            </td>
            <td>
              <ExportModeButton selectedSegments={segmentsOrInverse.selected} style={{ height: '1.8em' }} allowSegmentsToChapters={!isSizeLimited} />
            </td>
            <td>
              {renderNoticeIcon(notices.specific['exportMode'], rightIconStyle) ?? <HelpIcon onClick={onExportModeHelpPress} />}
            </td>
          </tr>

          <tr>
            <td>
              {t('Output container format:')}
            </td>
            <td>
              {isSizeLimited ? <HighlightedText>mp4 - MPEG-4 Part 14</HighlightedText> : renderOutFmt({ height: '1.8em', maxWidth: 150 })}
            </td>
            <td>
              <HelpIcon onClick={onOutFmtHelpPress} />
            </td>
          </tr>

          <tr>
            <td>
              <Trans>Input has {{ numStreamsTotal }} tracks</Trans>
              {renderNotice(notices.specific['problematicStreams'], {})}
            </td>
            <td>
              {isSizeLimited ? (
                <HighlightedText><Trans>Keeping main video + 1 audio track</Trans></HighlightedText>
              ) : (
                <HighlightedText style={{ cursor: 'pointer' }} onClick={onShowStreamsSelectorClick}><Trans>Keeping {{ numStreamsToCopy }} tracks</Trans></HighlightedText>
              )}
            </td>
            <td>
              {renderNoticeIcon(notices.specific['problematicStreams'], rightIconStyle) ?? <HelpIcon onClick={onTracksHelpPress} />}
            </td>
          </tr>

          <tr>
            <td>
              {t('Save output to path:')}
            </td>
            <td>
              <OutDirSelector>
                <HighlightedText role="button" style={{ wordBreak: 'break-all', cursor: 'pointer' }}>{outputDir}</HighlightedText>
              </OutDirSelector>
            </td>
            <td />
          </tr>

          {canEditSegTemplate && (
            <tr>
              <td colSpan={2}>
                {isSizeLimited && sizeLimitSeparateNamingMode === 'auto' && generateAutoCutFileNames != null ? (
                  <AutoNamePreview title={t('Output name(s):', { count: segmentsToExport.length })} generateFileNames={generateAutoCutFileNames} onCustomize={enableSizeLimitedSeparateCustomNaming} currentSegIndexSafe={currentSegIndexSafe} />
                ) : (
                  <FileNameTemplateEditor
                    mode="separate"
                    template={isSizeLimited ? (cutFileTemplate ?? defaultSizeLimitedCutFileTemplate) : (cutFileTemplate ?? defaultCutFileTemplate)}
                    setTemplate={setCutFileTemplate}
                    defaultTemplate={isSizeLimited ? defaultSizeLimitedCutFileTemplate : defaultCutFileTemplate}
                    generateFileNames={generateCutFileNames}
                    currentSegIndexSafe={currentSegIndexSafe}
                    onReset={isSizeLimited ? (() => setSizeLimitSeparateNamingMode('auto')) : undefined}
                    resetLabel={isSizeLimited ? t('Use auto naming') : undefined}
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
                {isSizeLimited && sizeLimitMergedNamingMode === 'auto' && generateAutoCutMergedFileNames != null ? (
                  <AutoNamePreview title={t('Merged output file name:')} generateFileNames={generateAutoCutMergedFileNames} onCustomize={enableSizeLimitedMergedCustomNaming} />
                ) : (
                  <FileNameTemplateEditor
                    mode="merge-segments"
                    template={isSizeLimited ? (cutMergedFileTemplate ?? defaultSizeLimitedCutMergedFileTemplate) : (cutMergedFileTemplate ?? defaultCutMergedFileTemplate)}
                    setTemplate={setCutMergedFileTemplate}
                    defaultTemplate={isSizeLimited ? defaultSizeLimitedCutMergedFileTemplate : defaultCutMergedFileTemplate}
                    generateFileNames={generateCutMergedFileNames}
                    onReset={isSizeLimited ? (() => setSizeLimitMergedNamingMode('auto')) : undefined}
                    resetLabel={isSizeLimited ? t('Use auto naming') : undefined}
                  />
                )}
              </td>
              <td>
                <HelpIcon onClick={onCutMergedFileTemplateHelpPress} />
              </td>
            </tr>
          )}

          <tr>
            <td>
              {t('Overwrite existing files')}
              {renderNotice(notices.specific['overwriteOutput'], {})}
            </td>
            <td>
              <Switch checked={enableOverwriteOutput} onCheckedChange={setEnableOverwriteOutput} />
            </td>
            <td>
              {renderNoticeIcon(notices.specific['overwriteOutput'], rightIconStyle) ?? <HelpIcon onClick={() => showHelpText({ text: t('Overwrite files when exporting, if a file with the same name as the output file name exists?') })} />}
            </td>
          </tr>
        </tbody>
      </table>

      {!isSizeLimited && (
        <>
          <h3 style={{ marginBottom: '.5em' }}>{t('Advanced options')}</h3>

          <table className={styles['options']}>
            <tbody>
              <tr>
                <td style={{ paddingTop: '.5em', color: 'var(--gray-11)', fontSize: '.9em' }} colSpan={2}>
                  {t('Depending on your specific file/player, you may have to try different options for best results.')}
                </td>
                <td />
              </tr>

              <tr>
                <td>
                  {t('Show advanced options')}
                </td>
                <td>
                  <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
                </td>
                <td />
              </tr>

              {showAdvanced && (
                <>
                  {areWeCutting && (
                    <>
                      <AnimatedTr>
                        <td>
                          {t('Shift all start times')}
                        </td>
                        <td>
                          <ShiftTimes values={adjustCutFromValues} num={cutFromAdjustmentFrames} setNum={setCutFromAdjustmentFrames} />
                        </td>
                        <td>
                          <HelpIcon onClick={onCutFromAdjustmentFramesHelpPress} />
                        </td>
                      </AnimatedTr>
                      <AnimatedTr>
                        <td>
                          {t('Shift all end times')}
                        </td>
                        <td>
                          <ShiftTimes values={adjustCutToValues} num={cutToAdjustmentFrames} setNum={setCutToAdjustmentFrames} />
                        </td>
                        <td />
                      </AnimatedTr>
                    </>
                  )}

                  {isMov && (
                    <>
                      <AnimatedTr>
                        <td>
                          {t('Enable MOV Faststart?')}
                        </td>
                        <td>
                          <Switch checked={movFastStart} onCheckedChange={toggleMovFastStart} />
                          {renderNotice(notices.specific['movFastStart'], {})}
                        </td>
                        <td>
                          {renderNoticeIcon(notices.specific['movFastStart'], rightIconStyle) ?? <HelpIcon onClick={onMovFastStartHelpPress} />}
                        </td>
                      </AnimatedTr>

                      <AnimatedTr>
                        <td>
                          {t('Preserve all MP4/MOV metadata?')}
                          {renderNotice(notices.specific['preserveMovData'], {})}
                        </td>
                        <td>
                          <Switch checked={preserveMovData} onCheckedChange={togglePreserveMovData} />
                        </td>
                        <td>
                          {renderNoticeIcon(notices.specific['preserveMovData'], rightIconStyle) ?? <HelpIcon onClick={onPreserveMovDataHelpPress} />}
                        </td>
                      </AnimatedTr>
                    </>
                  )}

                  <AnimatedTr>
                    <td>
                      {t('Preserve chapters')}
                    </td>
                    <td>
                      <Switch checked={preserveChapters} onCheckedChange={togglePreserveChapters} />
                    </td>
                    <td>
                      <HelpIcon onClick={onPreserveChaptersPress} />
                    </td>
                  </AnimatedTr>

                  <AnimatedTr>
                    <td>
                      {t('Preserve metadata')}
                    </td>
                    <td>
                      <Select value={preserveMetadata} onChange={(e) => setPreserveMetadata(e.target.value as PreserveMetadata)} style={{ height: 20, marginLeft: 5 }}>
                        <option value={'default' satisfies PreserveMetadata}>{t('Default')}</option>
                        <option value={'none' satisfies PreserveMetadata}>{t('None')}</option>
                        <option value={'nonglobal' satisfies PreserveMetadata}>{t('Non-global')}</option>
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
                          <Switch checked={segmentsToChapters} onCheckedChange={toggleSegmentsToChapters} />
                        </td>
                        <td>
                          <HelpIcon onClick={onSegmentsToChaptersHelpPress} />
                        </td>
                      </AnimatedTr>

                      <AnimatedTr>
                        <td>
                          {t('Preserve original metadata when merging? (slow)')}
                        </td>
                        <td>
                          <Switch checked={preserveMetadataOnMerge} onCheckedChange={togglePreserveMetadataOnMerge} />
                        </td>
                        <td>
                          <HelpIcon onClick={onPreserveMetadataOnMergeHelpPress} />
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
                          <Switch checked={enableSmartCut} onCheckedChange={() => setEnableSmartCut((v) => !v)} />
                        </td>
                        <td>
                          {renderNoticeIcon(notices.specific['smartCut'], rightIconStyle) ?? <HelpIcon onClick={onSmartCutHelpPress} />}
                        </td>
                      </AnimatedTr>

                      {!isEncoding && (
                        <AnimatedTr>
                          <td>
                            {t('Keyframe cut mode')}
                            {renderNotice(notices.specific['cutMode'], {})}
                          </td>
                          <td>
                            <Switch checked={keyframeCut} onCheckedChange={() => toggleKeyframeCut()} />
                          </td>
                          <td>
                            {renderNoticeIcon(notices.specific['cutMode'], rightIconStyle) ?? <HelpIcon onClick={onKeyframeCutHelpPress} />}
                          </td>
                        </AnimatedTr>
                      )}
                    </>
                  )}


                  {isEncoding && (
                    <AnimatedTr>
                      <td>
                        {t('Smart cut auto detect bitrate')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {encBitrate != null && (
                            <>
                              <TextInput value={encBitrate} onChange={handleEncBitrateChange} style={{ width: '4em', flexGrow: 0, marginRight: '.3em' }} />
                              <span style={{ marginRight: '.3em' }}>{t('kbit/s')}</span>
                            </>
                          )}
                          <span><Switch checked={encBitrate == null} onCheckedChange={handleEncBitrateToggle} /></span>
                        </div>
                      </td>
                      <td />
                    </AnimatedTr>
                  )}

                  {lossyMode != null && (
                    <AnimatedTr>
                      <td>
                        {t('Lossy mode')}
                      </td>
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
                        &quot;ffmpeg&quot; <code className="highlighted">avoid_negative_ts</code>
                        {renderNotice(notices.specific['avoidNegativeTs'], {})}
                      </td>
                      <td>
                        <Select value={avoidNegativeTs} onChange={(e) => setAvoidNegativeTs(e.target.value as AvoidNegativeTs)} style={{ height: 20, marginLeft: 5 }}>
                          <option value={'auto' satisfies AvoidNegativeTs}>auto</option>
                          <option value={'make_zero' satisfies AvoidNegativeTs}>make_zero</option>
                          <option value={'make_non_negative' satisfies AvoidNegativeTs}>make_non_negative</option>
                          <option value={'disabled' satisfies AvoidNegativeTs}>disabled</option>
                        </Select>
                      </td>
                      <td>
                        {renderNoticeIcon(notices.specific['avoidNegativeTs'], rightIconStyle) ?? <HelpIcon onClick={onAvoidNegativeTsHelpPress} />}
                      </td>
                    </AnimatedTr>
                  )}

                  <AnimatedTr>
                    <td>
                      {t('"ffmpeg" experimental flag')}
                    </td>
                    <td>
                      <Switch checked={ffmpegExperimental} onCheckedChange={setFfmpegExperimental} />
                    </td>
                    <td>
                      <HelpIcon onClick={onFfmpegExperimentalHelpPress} />
                    </td>
                  </AnimatedTr>

                  <AnimatedTr>
                    <td>
                      {t('More settings')}
                    </td>
                    <td>
                      <IoIosSettings size={24} role="button" onClick={toggleSettings} style={{ marginLeft: 5 }} />
                    </td>
                    <td />
                  </AnimatedTr>
                </>
              )}
            </tbody>
          </table>
        </>
      )}
    </ExportSheet>
  );
}

export default memo(ExportConfirm);
