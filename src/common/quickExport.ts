import type { ExportEncodeMode, KeyBinding, KeyboardAction, QuickExportPreset, SizeLimitPreset } from './types.ts';

/** Ctrl+1, Ctrl+2 and Ctrl+3, in the order of `Config['quickExportPresets']`. */
export const quickExportPresetActions = ['quickExportPreset1', 'quickExportPreset2', 'quickExportPreset3'] as const satisfies readonly KeyboardAction[];

export const defaultQuickExportPresets: QuickExportPreset[] = [
  { name: '', encodeMode: 'lossless', sizeLimitMb: 10, sizeLimitPreset: 'quality' },
  { name: 'Discord', encodeMode: 'size_limited', sizeLimitMb: 10, sizeLimitPreset: 'quality' },
  { name: 'Email', encodeMode: 'size_limited', sizeLimitMb: 20, sizeLimitPreset: 'quality' },
];

/** Ctrl+E exports with the sheet's last settings; Ctrl+1/2/3 with a preset. None of them is used by anything else. */
export const quickExportKeyBindings: KeyBinding[] = [
  { keys: 'ControlLeft+KeyE', action: 'quickExport' },
  { keys: 'ControlLeft+Digit1', action: 'quickExportPreset1' },
  { keys: 'ControlLeft+Digit2', action: 'quickExportPreset2' },
  { keys: 'ControlLeft+Digit3', action: 'quickExportPreset3' },
];

const encodeModes: readonly ExportEncodeMode[] = ['lossless', 'size_limited'];
const sizeLimitPresets: readonly SizeLimitPreset[] = ['max_quality', 'quality', 'fast'];

/** Always three presets: a missing or broken one (a hand-edited settings file) is the default for its place. */
export function normalizeQuickExportPresets(stored: unknown): QuickExportPreset[] {
  const list: unknown[] = Array.isArray(stored) ? stored : [];
  return defaultQuickExportPresets.map((fallback, index) => {
    const value = list[index];
    if (value == null || typeof value !== 'object') return fallback;
    const { name, encodeMode, sizeLimitMb, sizeLimitPreset } = value as Partial<Record<keyof QuickExportPreset, unknown>>;
    return {
      name: typeof name === 'string' ? name : fallback.name,
      encodeMode: encodeModes.find((mode) => mode === encodeMode) ?? fallback.encodeMode,
      sizeLimitMb: typeof sizeLimitMb === 'number' && Number.isFinite(sizeLimitMb) && sizeLimitMb > 0 ? sizeLimitMb : fallback.sizeLimitMb,
      sizeLimitPreset: sizeLimitPresets.find((preset) => preset === sizeLimitPreset) ?? fallback.sizeLimitPreset,
    };
  });
}

// Left and right modifier keys do the same (see useKeyboard), so Ctrl+E is taken whichever Ctrl a binding names.
const comboOf = (keys: string) => keys.split('+').map((key) => key.replace(/^(Control|Shift|Alt|Meta)Right$/, '$1Left')).sort().join('+');

/** Saved shortcuts plus the quick export ones, each only where its keys don't already do something and its action has none. */
export function addQuickExportKeyBindings(existing: KeyBinding[]): KeyBinding[] {
  const added = quickExportKeyBindings.filter((binding) => (
    !existing.some((other) => other.action === binding.action || comboOf(other.keys) === comboOf(binding.keys))
  ));
  return added.length > 0 ? [...existing, ...added] : existing;
}
