import { memo, useMemo } from 'react';

import styles from './TimelineRuler.module.css';
import formatClockTime from '../util/clockTime';

const niceIntervals = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
const minLabelSpacingPx = 72;
const minDrawnLabelGapPx = 52;
const minMinorSpacingPx = 9;
const maxTicks = 800;

export function pickRulerInterval(pxPerSecond: number) {
  return niceIntervals.find((interval) => interval * pxPerSecond >= minLabelSpacingPx) ?? niceIntervals.at(-1)!;
}

function pickMinorInterval(interval: number, pxPerSecond: number) {
  for (const divisions of [5, 4, 2]) {
    const minor = interval / divisions;
    if (minor * pxPerSecond >= minMinorSpacingPx) return minor;
  }
  return undefined;
}

/**
 * Time ruler above the timeline lanes. Ticks are in source time and placed through the same mapping
 * as the lanes, so they line up with clips even where retimed clips stretch or squeeze the lane.
 * Only ticks in (and just around) the visible window are drawn.
 */
function TimelineRuler({ toLanePercent, lanePx, laneDuration, visibleStart, visibleEnd, fileDuration, hoverTime, hoverLabel, height }: {
  toLanePercent: (time: number) => number,
  /** Width of the whole lane in pixels (wider than the view when zoomed). */
  lanePx: number,
  /** Duration that the lane width represents, in lane (display) seconds. */
  laneDuration: number,
  visibleStart: number,
  visibleEnd: number,
  fileDuration: number,
  hoverTime: number | undefined,
  hoverLabel: string | undefined,
  height: number,
}) {
  const ticks = useMemo(() => {
    if (lanePx <= 0 || laneDuration <= 0 || fileDuration <= 0) return { major: [], minor: [] };
    const pxPerSecond = lanePx / laneDuration;
    const interval = pickRulerInterval(pxPerSecond);
    const minor = pickMinorInterval(interval, pxPerSecond);
    const margin = (visibleEnd - visibleStart) * 0.25;
    const from = Math.max(0, visibleStart - margin);
    const to = Math.min(fileDuration, visibleEnd + margin);
    const showTenths = interval < 1;
    const longFile = fileDuration >= 3600;

    const major: { time: number, left: number, label: string | undefined }[] = [];
    let lastLabelPx = -Infinity;
    for (let i = Math.floor(from / interval); i * interval <= to && major.length < maxTicks; i += 1) {
      const time = i * interval;
      const left = toLanePercent(time);
      const px = (left / 100) * lanePx;
      // Retimed (sped-up) clips squeeze time, so labels can collide there: skip the ones that would.
      const label = px - lastLabelPx >= minDrawnLabelGapPx ? formatClockTime(time, { showHours: longFile, decimals: showTenths ? (interval < 0.1 ? 2 : 1) : 0 }) : undefined;
      if (label != null) lastLabelPx = px;
      major.push({ time, left, label });
    }

    const minorTicks: number[] = [];
    if (minor != null) {
      const perMajor = Math.round(interval / minor);
      for (let i = Math.floor(from / minor); i * minor <= to && minorTicks.length < maxTicks * 4; i += 1) {
        if (i % perMajor !== 0) minorTicks.push(toLanePercent(i * minor));
      }
    }
    return { major, minor: minorTicks };
  }, [fileDuration, laneDuration, lanePx, toLanePercent, visibleEnd, visibleStart]);

  return (
    <div className={styles['ruler']} style={{ height }}>
      {ticks.minor.map((left) => (
        <div key={`m${left}`} className={styles['minor']} style={{ left: `${left}%` }} />
      ))}
      {ticks.major.map(({ time, left, label }) => (
        <div key={time} className={styles['major']} style={{ left: `${left}%` }}>
          {label != null && <span className={styles['label']}>{label}</span>}
        </div>
      ))}
      {hoverTime != null && hoverLabel != null && (
        <div className={styles['hover']} style={{ left: `${toLanePercent(hoverTime)}%` }}>
          <span className={styles['hoverLabel']}>{hoverLabel}</span>
        </div>
      )}
    </div>
  );
}

export default memo(TimelineRuler);
