// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logger from './logger.js';

// Which video encoders the graphics card can use, kept between runs: testing them takes a couple of seconds, and the
// answer only changes with the card, its driver, FFmpeg or ClipPress itself, which the saved key covers.

interface GpuDevice { vendorId?: number, deviceId?: number, driverVersion?: string }

const vendorIds: Record<number, 'nvidia' | 'amd' | 'intel'> = { 0x10DE: 'nvidia', 0x1002: 'amd', 0x1022: 'amd', 0x8086: 'intel' };

const getFilePath = () => join(app.getPath('userData'), 'encoder-check.json');

async function getGpuDevices() {
  const info = await app.getGPUInfo('basic') as { gpuDevice?: GpuDevice[] };
  return info.gpuDevice ?? [];
}

async function getKey(ffmpegKey: string) {
  const devices = await getGpuDevices();
  // Without every card's driver version, a driver installed later couldn't be told apart: not kept.
  if (devices.length === 0 || devices.some(({ driverVersion }) => !driverVersion)) return undefined;
  const gpus = devices.map(({ vendorId, deviceId, driverVersion }) => `${vendorId}:${deviceId}:${driverVersion ?? ''}`).sort().join(',');
  return `${app.getVersion()}|${ffmpegKey}|${gpus}`;
}

/** The graphics card makers in this PC: an encoder of a maker with no card here can't start working by itself. */
export async function getGpuVendors() {
  const devices = await getGpuDevices();
  return [...new Set(devices.flatMap(({ vendorId }) => (vendorId != null && vendorIds[vendorId] != null ? [vendorIds[vendorId]] : [])))];
}

export async function readSavedEncoderCheck(ffmpegKey: string): Promise<unknown> {
  try {
    const [key, text] = await Promise.all([getKey(ffmpegKey), readFile(getFilePath(), 'utf8')]);
    const saved = JSON.parse(text) as { key?: unknown, check?: unknown };
    return key != null && saved.key === key ? saved.check : undefined;
  } catch {
    // None saved yet, or unreadable: tested again.
    return undefined;
  }
}

export async function saveEncoderCheck(ffmpegKey: string, check: unknown) {
  try {
    const key = await getKey(ffmpegKey);
    if (key == null) return;
    await writeFile(getFilePath(), JSON.stringify({ key, check }));
  } catch (error) {
    logger.warn('Could not save the encoder check', error);
  }
}

/** After a GPU export failed: the next run tests again. */
export async function forgetEncoderCheck() {
  await rm(getFilePath(), { force: true }).catch((error: unknown) => logger.warn('Could not remove the encoder check', error));
}
