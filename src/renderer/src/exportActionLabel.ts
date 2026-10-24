export type TranslateExportActionLabel = (key: string, options: Record<string, string | number>) => string;

/**
 * The export sheet's main button says what it will make: "Export 1 clip", "Export 5 clips", "Export merged clip"
 * or "Export 5 clips + merged". From what the export really does, not the Files choice alone: with one clip
 * there's nothing to merge, so "One merged file" makes that one clip. Plain "Export" when it isn't cutting (the
 * whole recording, or chapters only).
 */
export default function getExportActionLabel({ clipCount, willMerge, keepClipFiles, areWeCutting, t }: {
  clipCount: number,
  willMerge: boolean,
  /** "Both": the clip files are kept next to the merged one. */
  keepClipFiles: boolean,
  areWeCutting: boolean,
  t: TranslateExportActionLabel,
}) {
  if (!areWeCutting) return t('Export', {});
  if (willMerge) return keepClipFiles ? t('Export {{count}} clips + merged', { count: clipCount }) : t('Export merged clip', {});
  return t('Export {{count}} clips', { count: clipCount });
}
