/**
 * The parts of an export that the progress card has its own lines for. A second encode (sharper, or smaller) has
 * none: it's more of the same work as far as anyone can tell (6.1 round 4: nothing gives it away).
 */
export type ExportPhase = 'starting' | 'cutting' | 'encoding' | 'finishing';

type Translate = (key: string) => string;

// Plain, light words for what it's doing, not the literal step (like a game's loading lines). Literal t() calls, so
// the i18n extraction finds them.
const linesByPhase: Record<ExportPhase, (t: Translate) => string[]> = {
  starting: (t) => [
    t('Readying up'), t('Queueing up'), t('Spawning in'), t('Gearing up'), t('Taking aim'), t('Getting into position'),
    t('Setting the stage'), t('Rolling the tape'), t('Grabbing the footage'), t('Picking up the clip'), t('Starting the run'), t('Locking on'),
  ],
  cutting: (t) => [
    t('Cutting it clean'), t('Clipping the moment'), t('Marking the moment'), t('Framing the play'), t('Zeroing in'), t('Keeping the good bits'),
    t('Cutting the downtime'), t('Lining up the cuts'), t('Snipping the start'), t('Locking the timing'), t('Splicing it together'), t('Isolating the play'),
  ],
  encoding: (t) => [
    t('Polishing pixels'), t('Sharpening the frames'), t('Packing it tight'), t('Dialing it in'), t('Cooking the clip'), t('Buffing the edges'),
    t('Crunching the frames'), t('Smoothing it out'), t('Tuning the picture'), t('Getting it crisp'), t('Fine-tuning'), t('Rendering the play'),
  ],
  finishing: (t) => [
    t('Final touches'), t('Locking it in'), t('Almost there'), t('Wrapping up'), t('Saving your clip'), t('Sealing it up'),
    t('Last few frames'), t('Nearly done'), t('Packing it up'), t('Landing it'), t('Crossing the line'), t('That\'s a wrap'),
  ],
};

export function getExportTitleLines(phase: ExportPhase, t: Translate) {
  return linesByPhase[phase](t);
}

/**
 * A random line the export hasn't shown yet (`shown`, updated); once every line was shown, any but the current one.
 */
export function pickExportTitleLine(lines: readonly string[], shown: Set<string>, current: string | undefined, random = Math.random) {
  let fresh = lines.filter((line) => !shown.has(line));
  if (fresh.length === 0) {
    lines.forEach((line) => shown.delete(line));
    fresh = lines.filter((line) => line !== current);
  }
  const line = fresh[Math.floor(random() * fresh.length)] ?? lines[0] ?? '';
  shown.add(line);
  return line;
}
