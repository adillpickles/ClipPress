import i18n from 'i18next';

import { gpuEncoderLabels } from './gpuEncoders';
import type { SizeLimitedResolvedStrategy } from './sizeLimitedTypes';

/**
 * What an export's result says about the encoder a size-limited export used. Only advanced mode shows `notices`; the
 * simple editor shows `warnings` too, so a step down to another encoder is a notice, never a warning (except AV1's
 * own, as before HEVC became the default).
 */
export default function addSizeLimitedStrategyNotes({ strategy, notices, warnings, gpuSwitchedOff }: {
  strategy: SizeLimitedResolvedStrategy,
  notices: Set<string>,
  warnings: Set<string>,
  /** "Use the GPU" off: a preset on the CPU says so, rather than blaming the graphics card. */
  gpuSwitchedOff: boolean,
}) {
  const encoder = gpuEncoderLabels[strategy.encoder];
  if (strategy.controlMode === 'advanced') {
    // GPU 2-pass runs as one encode with the encoder's own multipass.
    const passLabel = strategy.executionMode === 'ffmpeg_two_pass' || strategy.encoderMultipass
      ? i18n.t('2-pass')
      : i18n.t('1-pass');
    if (strategy.fallbackReason === 'nvidia_unavailable') {
      notices.add(i18n.t('No NVIDIA GPU was found, so Custom settings used {{encoder}} instead.', { encoder }));
    }
    notices.add(
      i18n.t(
        'Custom settings used {{encoder}} {{passLabel}} with preset {{preset}}.',
        {
          encoder,
          passLabel,
          preset: String(strategy.encoderPreset),
        },
      ),
    );
  } else if (gpuSwitchedOff && !strategy.usesGpu && strategy.preset !== 'max_quality') {
    notices.add(i18n.t('Use the GPU is off, so {{encoder}} was used.', { encoder }));
  } else {
    // AV1 chosen keeps its notes from before HEVC became the default. For HEVC and H.264 every step down is a note
    // (only advanced mode shows notes): the simple editor never mentions a fallback.
    const presetName = { max_quality: i18n.t('Max Quality'), quality: i18n.t('Quality'), fast: i18n.t('Fast') }[strategy.preset ?? 'quality'];
    switch (strategy.id) {
      case 'max_quality_av1_cpu': {
        notices.add(strategy.executionMode === 'ffmpeg_two_pass'
          ? i18n.t('Max Quality used CPU AV1 (SVT-AV1) 2-pass for the strongest low-bitrate result.')
          : i18n.t('Max Quality used CPU AV1 (SVT-AV1) for the strongest low-bitrate result.'));
        break;
      }
      case 'max_quality_av1_nvenc_two_pass':
      case 'max_quality_av1_gpu': {
        warnings.add(i18n.t('SVT-AV1 was unavailable, so Max Quality used {{encoder}}.', { encoder }));
        break;
      }
      case 'max_quality_h264_cpu_two_pass':
      case 'max_quality_h264_nvenc_two_pass':
      case 'max_quality_h264_gpu': {
        if (strategy.fallbackReason === 'av1_unavailable') warnings.add(i18n.t('AV1 encoders were unavailable, so Max Quality used {{encoder}}.', { encoder }));
        else if (strategy.fallbackReason === 'hevc_unavailable') notices.add(i18n.t('No HEVC encoder was found, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        else notices.add(i18n.t('{{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        break;
      }
      case 'max_quality_hevc_cpu': {
        notices.add(strategy.executionMode === 'ffmpeg_two_pass'
          ? i18n.t('Max Quality used CPU HEVC (x265) 2-pass for the sharpest result every phone plays.')
          : i18n.t('Max Quality used CPU HEVC (x265) for the sharpest result every phone plays.'));
        break;
      }
      case 'max_quality_hevc_gpu': {
        notices.add(i18n.t('x265 was unavailable, so Max Quality used {{encoder}}.', { encoder }));
        break;
      }
      case 'quality_av1_nvenc':
      case 'quality_av1_gpu': {
        notices.add(i18n.t('Quality used {{encoder}} for a stronger quality-to-speed balance.', { encoder }));
        break;
      }
      case 'quality_av1_cpu': {
        notices.add(i18n.t('This GPU has no AV1 encoder, so Quality used CPU AV1 (SVT-AV1), which takes longer.'));
        break;
      }
      case 'quality_hevc_cpu': {
        notices.add(i18n.t('This GPU has no HEVC encoder, so Quality used CPU HEVC (x265), which takes longer.'));
        break;
      }
      case 'quality_h264_gpu':
      case 'fast_h264_gpu':
      case 'quality_hevc_gpu':
      case 'fast_hevc_gpu': {
        if (strategy.fallbackReason === 'gpu_av1_unavailable' && strategy.id === 'quality_h264_gpu') notices.add(i18n.t('This GPU has no AV1 encoder, so Quality used {{encoder}} to keep the export quick.', { encoder }));
        else if (strategy.fallbackReason === 'gpu_av1_unavailable') notices.add(i18n.t('This GPU has no AV1 encoder, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        else if (strategy.fallbackReason === 'gpu_hevc_unavailable') notices.add(i18n.t('This GPU has no HEVC encoder, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        else notices.add(i18n.t('{{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        break;
      }
      case 'quality_h264_cpu': {
        if (strategy.fallbackReason === 'av1_unavailable') warnings.add(i18n.t('AV1 encoders were unavailable, so Quality fell back to H.264 CPU.'));
        else if (strategy.fallbackReason === 'hevc_unavailable') notices.add(i18n.t('No HEVC encoder was found, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        else notices.add(i18n.t('No usable GPU encoder was found, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        break;
      }
      case 'fast_av1_nvenc':
      case 'fast_av1_gpu': {
        notices.add(i18n.t('Fast used {{encoder}} with a speed-tuned profile for quick shareable exports.', { encoder }));
        break;
      }
      case 'fast_hevc_cpu':
      case 'fast_av1_cpu':
      case 'fast_h264_cpu': {
        notices.add(i18n.t('No usable GPU encoder was found, so {{preset}} used {{encoder}}.', { preset: presetName, encoder }));
        break;
      }
      default: {
        break;
      }
    }
  }
}
