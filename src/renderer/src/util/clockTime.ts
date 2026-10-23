import padStart from 'lodash/padStart';

/**
 * A compact clock time for display, e.g. `0:07`, `1:02.5`, `1:02:03.25`. Unlike timecodes, minutes
 * are not padded and hours only appear when asked for (or needed), so short clips read naturally.
 * The value is truncated, not rounded, so a clock never shows a time that hasn't been reached yet.
 */
export default function formatClockTime(seconds: number, { showHours = false, decimals = 0 }: { showHours?: boolean, decimals?: 0 | 1 | 2 } = {}) {
  const sign = seconds < 0 ? '-' : '';
  const scale = 10 ** decimals;
  // Small epsilon so that e.g. 1.2 (stored as 1.19999…) still shows as 1.2.
  const totalUnits = Math.floor(Math.abs(seconds) * scale + 1e-6);
  const wholeSeconds = Math.floor(totalUnits / scale);
  const fraction = totalUnits % scale;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const secs = wholeSeconds % 60;

  const withHours = showHours || hours > 0;
  const minutesStr = withHours ? padStart(String(minutes), 2, '0') : String(minutes);
  const fractionStr = decimals > 0 ? `.${padStart(String(fraction), decimals, '0')}` : '';
  return `${sign}${withHours ? `${hours}:` : ''}${minutesStr}:${padStart(String(secs), 2, '0')}${fractionStr}`;
}

/**
 * How long something lasts (a clip, the export), e.g. `0:12.6` or `1:30.0`. Simple mode writes every length
 * this one way, so the Clips panel, its total and the speed band can be compared at a glance.
 */
export function formatClipLength(seconds: number) {
  return formatClockTime(seconds, { decimals: 1 });
}
