const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]];

/**
 * When something happened, as a label of its own: "5 minutes ago", "Yesterday", or `justNow` under a minute
 * (Intl would say "this minute"). The first letter is capitalised so a column of these reads in sentence case.
 */
export default function formatRelativeTime(ms: number, now: number, format: Intl.RelativeTimeFormat, justNow: string) {
  const seconds = (ms - now) / 1000;
  const { locale } = format.resolvedOptions();
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      const text = format.format(Math.round(seconds / size), unit);
      return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    }
  }
  return justNow;
}
