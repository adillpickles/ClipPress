import { gpuEncoders } from './gpuEncoders';
import type { GpuEncoderName, GpuVendor } from './gpuEncoders';
import type { SizeLimitedEncoderCapabilities } from './sizeLimitedTypes';

export type GpuCapability = (typeof gpuEncoders)[number]['capability'];

/** What's kept between runs: the answer, and the encoders to test again each run all the same. */
export interface SavedEncoderCheck { capabilities: Omit<SizeLimitedEncoderCapabilities, 'cpuThreads'>, retest: GpuCapability[] }

/**
 * A saved check this version can trust: every answer it asks for is there. One from a version that didn't ask (before
 * x265, say) is tested again rather than read as "no".
 */
export function isSavedEncoderCheck(value: unknown): value is SavedEncoderCheck {
  if (value == null || typeof value !== 'object') return false;
  const { capabilities, retest } = value as Record<string, unknown>;
  if (capabilities == null || typeof capabilities !== 'object' || !Array.isArray(retest)) return false;
  const known = gpuEncoders.map(({ capability }) => capability);
  const { basicSettingsOnly } = capabilities as Record<string, unknown>;
  return ['h264Nvenc', 'av1Nvenc', 'libx264', 'libx265', 'libsvtav1', 'svtTwoPass', 'x265TwoPass', ...known].every((key) => typeof (capabilities as Record<string, unknown>)[key] === 'boolean')
    && retest.every((key) => known.includes(key as GpuCapability))
    && (basicSettingsOnly == null || (Array.isArray(basicSettingsOnly) && basicSettingsOnly.every((key) => known.includes(key as GpuCapability))));
}

/**
 * The encoders the next runs test again rather than read back: one that didn't open on a card that is here, when none
 * of that card maker's encoders opened (it may only have been busy) or it timed out. One a working card lacks (another
 * of its encoders opened: an RTX 30's AV1) stays "no" until the card, its driver, FFmpeg or ClipPress changes.
 */
export function getEncodersToRetest({ capabilities, listed, unsure, vendors }: {
  capabilities: SavedEncoderCheck['capabilities'],
  /** Whether this FFmpeg has the encoder at all. */
  listed: (encoder: GpuEncoderName) => boolean,
  unsure: ReadonlySet<GpuCapability>,
  /** The graphics card makers in this PC. */
  vendors: readonly GpuVendor[],
}) {
  const working = new Set(gpuEncoders.filter(({ capability }) => capabilities[capability] === true).map(({ vendor }) => vendor));
  return gpuEncoders
    .filter(({ encoder, vendor, capability }) => listed(encoder) && capabilities[capability] !== true && (unsure.has(capability) || (vendors.includes(vendor) && !working.has(vendor))))
    .map(({ capability }) => capability);
}
