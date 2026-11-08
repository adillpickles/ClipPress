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
  return ['h264Nvenc', 'av1Nvenc', 'libx264', 'libx265', 'libsvtav1', 'svtTwoPass', 'x265TwoPass', 'hevcNvencUhq', ...known].every((key) => typeof (capabilities as Record<string, unknown>)[key] === 'boolean')
    && retest.every((key) => known.includes(key as GpuCapability))
    && (basicSettingsOnly == null || (Array.isArray(basicSettingsOnly) && basicSettingsOnly.every((key) => known.includes(key as GpuCapability))));
}

/**
 * The encoders the next runs test again rather than read back: each one that didn't open on a card that is here,
 * unless the card surely lacks it. That takes a second failure in a row (the first may only have been a busy card:
 * another app using its sessions, memory short) while another of the card's encoders opened (an RTX 30's AV1), on a
 * maker's only card (with two, an iGPU and a graphics card, FFmpeg may open the other one next time). Such a one
 * stays "no" until a card, its driver, FFmpeg or ClipPress changes. One that timed out is always tested again.
 */
export function getEncodersToRetest({ capabilities, listed, unsure, failedBefore, adapters }: {
  capabilities: SavedEncoderCheck['capabilities'],
  /** Whether this FFmpeg has the encoder at all. */
  listed: (encoder: GpuEncoderName) => boolean,
  unsure: ReadonlySet<GpuCapability>,
  /** Those that had failed at the run before too (this run tested them again). */
  failedBefore: ReadonlySet<GpuCapability>,
  /** The maker of each graphics card in this PC, once per card. */
  adapters: readonly GpuVendor[],
}) {
  const working = new Set(gpuEncoders.filter(({ capability }) => capabilities[capability] === true).map(({ vendor }) => vendor));
  const surelyLacks = (vendor: GpuVendor, capability: GpuCapability) => failedBefore.has(capability) && working.has(vendor) && adapters.filter((adapter) => adapter === vendor).length === 1;
  return gpuEncoders
    .filter(({ encoder, vendor, capability }) => listed(encoder) && capabilities[capability] !== true && (unsure.has(capability) || (adapters.includes(vendor) && !surelyLacks(vendor, capability))))
    .map(({ capability }) => capability);
}
