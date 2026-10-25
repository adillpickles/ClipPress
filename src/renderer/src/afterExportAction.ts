import type { CleanupChoicesType } from './dialogs';

/**
 * What happens to the recording after an export, for Settings > Export > "After exporting". Follows the
 * export code in App.tsx: the clean-up runs only when "Do this automatically after each export" is on (and
 * then asks first if "Ask me each time" is on); without it, simple mode still closes the recording when
 * "Close the recording" is ticked. Moving the original to the Recycle Bin is left out: it has its own switch.
 */
export type AfterExportAction =
  | 'nothing'
  | 'close'
  | 'ask'
  | 'binTemp'
  | 'closeAndBinTemp'
  | 'binProject'
  | 'closeAndBinProject'
  | 'binTempAndProject'
  | 'closeAndBinTempAndProject';

export default function getAfterExportAction(choices: CleanupChoicesType, simpleMode: boolean): AfterExportAction {
  if (!choices.cleanupAfterExport) return simpleMode && choices.closeFile ? 'close' : 'nothing';
  if (choices.askForCleanup) return 'ask';

  const temp = choices.trashTmpFiles;
  const project = choices.trashProjectFile === true;
  const close = choices.closeFile;
  if (temp && project) return close ? 'closeAndBinTempAndProject' : 'binTempAndProject';
  if (temp) return close ? 'closeAndBinTemp' : 'binTemp';
  if (project) return close ? 'closeAndBinProject' : 'binProject';
  return close ? 'close' : 'nothing';
}

/**
 * Whether the original's edits go to the Recycle Bin with it after an export: Settings > Projects > "Recycle edits with
 * the original" (`recycleEdits`), unless the clean-up that runs after this export (asked, or done automatically) has
 * "Move the project file" unticked. That box is a choice made for this export, so it decides.
 */
export function shouldRecycleEditsWithOriginal(recycleEdits: boolean, cleanupChoices: CleanupChoicesType | undefined) {
  return recycleEdits && (cleanupChoices == null || cleanupChoices.trashProjectFile === true);
}
