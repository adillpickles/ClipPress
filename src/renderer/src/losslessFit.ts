import type { SizeLimitControlMode, SizeLimitSimpleFps, SizeLimitSimpleResolution, SizeLimitVideoFormat } from '../../common/types';
import type { Packet } from './ffmpeg';
import { isNeutralAudioGain } from './util/streams';

/**
 * Lossless when it fits (Beta 6.1): a size-limited export of a clip that needs no re-encoding, and whose own bytes
 * already fit, is a copy of those bytes: at once, and at the recording's full quality.
 */

/**
 * A copy keeps the recording's codec, so only one the Video format setting would make or take instead: H.264 plays on
 * anything, HEVC on every phone and most PCs, AV1 only when it's the format chosen (iPhones won't save it, and play it
 * only from the 15 Pro on). ShadowPlay and OBS can record any of the three.
 */
const copyableVideoCodecs: Record<SizeLimitVideoFormat, ReadonlySet<string>> = {
  hevc: new Set(['h264', 'hevc']),
  h264: new Set(['h264']),
  av1: new Set(['h264', 'hevc', 'av1']),
};
/** 8-bit 4:2:0: a 10-bit or 4:4:4 recording (HDR, OBS's lossless-ish settings) won't play on many phones. */
const copyablePixelFormats = new Set(['yuv420p', 'yuvj420p']);
const copyableAudioCodecs = new Set(['aac', 'mp3', 'opus']);

/**
 * How much earlier than the clip a copy may start. A copy must start on a keyframe, and the one before the clip is
 * better than one after (a clip that begins a little early beats one that starts late), but not by much.
 */
export const maxLosslessLeadIn = 2;

/** MP4's index and headers on top of the packets' own bytes: generous, as the copy is weighed afterwards anyway. */
const mp4BytesPerPacket = 16;
const mp4HeaderBytes = 16 * 1024;

/** Nothing in the clip needs re-encoding, and the export settings ask for nothing a copy can't keep. */
export function canCopyLosslessly({ playbackRate, cropped, hasText, audioGainDb, hasAudio, rotation, controlMode, resolution, fps, videoFormat, videoCodec, videoPixFmt, audioCodec }: {
  playbackRate: number,
  cropped: boolean,
  hasText: boolean,
  audioGainDb: number | undefined,
  hasAudio: boolean,
  rotation: number | undefined,
  controlMode: SizeLimitControlMode,
  resolution: SizeLimitSimpleResolution,
  fps: SizeLimitSimpleFps,
  videoFormat: SizeLimitVideoFormat,
  videoCodec: string | undefined,
  videoPixFmt: string | undefined,
  audioCodec: string | undefined,
}) {
  if (playbackRate !== 1 || cropped || hasText || rotation != null) return false;
  // Chosen on purpose: a size, a frame rate or an encoder of their own.
  if (controlMode !== 'simple' || (resolution !== 'auto' && resolution !== 'source') || (fps !== 'auto' && fps !== 'source')) return false;
  // A value this version doesn't know (a newer one's, or a hand-edited settings file) counts as HEVC, as for the presets.
  if (videoCodec == null || !(copyableVideoCodecs[videoFormat] ?? copyableVideoCodecs.hevc).has(videoCodec)) return false;
  if (videoPixFmt == null || !copyablePixelFormats.has(videoPixFmt)) return false;
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

/** FFmpeg's arguments for the copy of [start, end) into an MP4. */
export function getLosslessCopyArgs({ filePath, start, end, videoStream, audioStream, outPath }: {
  filePath: string,
  start: number,
  end: number,
  videoStream: { index: number, codec_name?: string | undefined },
  audioStream: { index: number } | undefined,
  outPath: string,
}) {
  return [
    '-hide_banner',
    // Before the input: the copy starts on the keyframe before the clip, never after it.
    '-ss', start.toFixed(5),
    '-i', filePath,
    '-t', (end - start).toFixed(5),
    '-map', `0:${videoStream.index}`,
    ...(audioStream != null ? ['-map', `0:${audioStream.index}`] : []),
    '-c', 'copy',
    // FFmpeg's MP4 default for HEVC is `hev1`, which Apple's Photos won't save.
    ...(videoStream.codec_name === 'hevc' ? ['-tag:v', 'hvc1'] : []),
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    '-f', 'mp4', '-y', outPath,
  ];
}
