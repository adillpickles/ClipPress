/**
 * Reads what's typed in the size limit box. Undefined while the text isn't a usable size yet (empty, "0", "0.",
 * a stray letter), so the box can hold a half-typed number without it replacing the last good limit.
 * A decimal comma counts as a point, as people type it in many languages.
 */
export default function parseSizeLimitMb(text: string) {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
