// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logger from './logger.js';

// Which video encoders the graphics card can use, kept between runs: testing them takes a couple of seconds, and the
// answer only changes with the card, its driver, FFmpeg or ClipPress itself, which the saved key covers.

interface GpuDevice { vendorId?: number, deviceId?: number, driverVersion?: string }

const getFilePath = () => join(app.getPath('userData'), 'encoder-check.json');

async function getGpuDevices() {
  const info = await app.getGPUInfo('basic') as { gpuDevice?: GpuDevice[] };
  return info.gpuDevice ?? [];
}

async function getKey(ffmpegKey: string) {
  const devices = await getGpuDevices();
  if (devices.length === 0) return undefined;
  const gpus = devices.map(({ vendorId, deviceId, driverVersion }) => `${vendorId}:${deviceId}:${driverVersion ?? ''}`).sort().join(',');
  return `${app.getVersion()}|${ffmpegKey}|${gpus}`;
}

export async function readSavedEncoderCheck(ffmpegKey: string): Promise<unknown> {
  try {
    const [key, text] = await Promise.all([getKey(ffmpegKey), readFile(getFilePath(), 'utf8')]);
    const saved = JSON.parse(text) as { key?: unknown, capabilities?: unknown };
    return key != null && saved.key === key ? saved.capabilities : undefined;
  } catch {
    // None saved yet, or unreadable: tested again.
    return undefined;
  }
}

export async function saveEncoderCheck(ffmpegKey: string, capabilities: Record<string, boolean>) {
  try {
    const key = await getKey(ffmpegKey);
    if (key == null) return;
    await writeFile(getFilePath(), JSON.stringify({ key, capabilities }));
  } catch (error) {
    logger.warn('Could not save the encoder check', error);
  }
}

/** After a GPU export failed: the next run tests again. */
export async function forgetEncoderCheck() {
  await rm(getFilePath(), { force: true }).catch((error: unknown) => logger.warn('Could not remove the encoder check', error));
}
