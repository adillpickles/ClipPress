import type { SizeLimitControlMode, SizeLimitSimpleFps, SizeLimitSimpleResolution } from '../../common/types';
import type { Packet } from './ffmpeg';
import { isNeutralAudioGain } from './util/streams';

/**
 * Lossless when it fits (Beta 6.1): a size-limited export of a clip that needs no re-encoding, and whose own bytes
 * already fit, is a copy of those bytes: at once, and at the recording's full quality.
 */

/** A copy keeps the recording's codecs, so only ones that play everywhere Discord and browsers play MP4. */
const copyableVideoCodecs = new Set(['h264', 'av1']);
const copyableAudioCodecs = new Set(['aac', 'mp3', 'opus']);

/**
 * How much earlier than the clip a copy may start. A copy must start on a keyframe, and the one before the clip is
 * better than one after (the owner: "rather have a clip begin early than … slightly late"), but not by much.
 */
export const maxLosslessLeadIn = 2;

/** MP4's index and headers on top of the packets' own bytes: generous, as the copy is weighed afterwards anyway. */
const mp4BytesPerPacket = 16;
const mp4HeaderBytes = 16 * 1024;

/** Nothing in the clip needs re-encoding, and the export settings ask for nothing a copy can't keep. */
export function canCopyLosslessly({ playbackRate, cropped, hasText, audioGainDb, hasAudio, rotation, controlMode, resolution, fps, videoCodec, audioCodec }: {
  playbackRate: number,
  cropped: boolean,
  hasText: boolean,
  audioGainDb: number | undefined,
  hasAudio: boolean,
  rotation: number | undefined,
  controlMode: SizeLimitControlMode,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  videoCodec: string | undefined,
  audioCodec: string | undefined,
}) {
  if (playbackRate !== 1 || cropped || hasText || rotation != null) return false;
  // Chosen on purpose: a size, a frame rate or an encoder of their own.
  if (controlMode !== 'simple' || (resolution !== 'auto' && resolution !== 'source') || (fps !== 'auto' && fps !== 'source')) return false;
  if (videoCodec == null || !copyableVideoCodecs.has(videoCodec)) return false;
  if (!hasAudio) return true;
  return audioCodec != null && copyableAudioCodecs.has(audioCodec) && isNeutralAudioGain(audioGainDb);
}

/**
 * Where a copy of [start, end) starts (the keyframe before start) and how many bytes it takes, from the packets read
 * around it. Undefined when that keyframe is too far before the clip, or isn't among the packets.
 */
export function estimateLosslessCopy({ packets, videoStreamIndex, audioStreamIndex, start, end }: {
  packets: readonly Packet[],
  videoStreamIndex: number,
  audioStreamIndex: number | undefined,
  start: number,
  end: number,
}) {
  const epsilon = 0.001;
  let copyStart: number | undefined;
  for (const packet of packets) {
    if (packet.streamIndex === videoStreamIndex && packet.keyframe && packet.time <= start + epsilon && (copyStart == null || packet.time > copyStart)) copyStart = packet.time;
  }
  if (copyStart == null || start - copyStart > maxLosslessLeadIn) return undefined;
  let bytes = mp4HeaderBytes;
  for (const packet of packets) {
    if ((packet.streamIndex === videoStreamIndex || packet.streamIndex === audioStreamIndex) && packet.time >= copyStart - epsilon && packet.time < end) bytes += packet.size + mp4BytesPerPacket;
  }
  return { copyStart, bytes };
}
