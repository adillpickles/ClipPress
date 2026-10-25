import { describe, expect, test } from 'vitest';

import getAfterExportAction, { shouldRecycleEditsWithOriginal, shouldRecycleOriginalAfterExport } from './afterExportAction';

const defaults = { trashTmpFiles: true, askForCleanup: true, closeFile: true, cleanupAfterExport: false };

describe('after export action', () => {
  test('without the automatic clean-up, only simple mode closes the recording', () => {
    expect(getAfterExportAction(defaults, true)).toBe('close');
    expect(getAfterExportAction(defaults, false)).toBe('nothing');
    expect(getAfterExportAction({ ...defaults, closeFile: false }, true)).toBe('nothing');
    // The saved clean-up choices don't run on their own.
    expect(getAfterExportAction({ ...defaults, askForCleanup: false, trashProjectFile: true }, true)).toBe('close');
  });

  test('asks first when "Ask me each time" is on', () => {
    expect(getAfterExportAction({ ...defaults, cleanupAfterExport: true }, true)).toBe('ask');
    expect(getAfterExportAction({ ...defaults, cleanupAfterExport: true }, false)).toBe('ask');
  });

  test('otherwise names what the clean-up does, in either mode', () => {
    const auto = { ...defaults, cleanupAfterExport: true, askForCleanup: false };
    expect(getAfterExportAction(auto, false)).toBe('closeAndBinTemp');
    expect(getAfterExportAction({ ...auto, trashProjectFile: true }, false)).toBe('closeAndBinTempAndProject');
    expect(getAfterExportAction({ ...auto, trashTmpFiles: false }, true)).toBe('close');
    expect(getAfterExportAction({ ...auto, trashTmpFiles: false, trashProjectFile: true }, true)).toBe('closeAndBinProject');
    expect(getAfterExportAction({ ...auto, trashTmpFiles: false, closeFile: false, trashProjectFile: true }, true)).toBe('binProject');
    expect(getAfterExportAction({ ...auto, trashTmpFiles: false, closeFile: false }, true)).toBe('nothing');
    expect(getAfterExportAction({ ...auto, closeFile: false }, true)).toBe('binTemp');
    expect(getAfterExportAction({ ...auto, closeFile: false, trashProjectFile: true }, true)).toBe('binTempAndProject');
  });

  test('leaves the original recording to its own switch', () => {
    const auto = { ...defaults, cleanupAfterExport: true, askForCleanup: false, trashTmpFiles: false };
    expect(getAfterExportAction({ ...auto, trashSourceFile: true }, true)).toBe('close');
  });
});

describe('the edits of an original moved to the Recycle Bin after an export', () => {
  test('go with it when the setting is on, unless the clean-up after the export leaves the project file unticked', () => {
    // Settings > Export > "Move the original to the Recycle Bin" alone: the setting decides.
    expect(shouldRecycleEditsWithOriginal(true, undefined)).toBe(true);
    expect(shouldRecycleEditsWithOriginal(false, undefined)).toBe(false);
    // The clean-up dialog (asked, or its choices done automatically): its "Move the project file" box decides.
    const cleanup = { ...defaults, cleanupAfterExport: true, trashSourceFile: true };
    expect(shouldRecycleEditsWithOriginal(true, cleanup)).toBe(false);
    expect(shouldRecycleEditsWithOriginal(true, { ...cleanup, trashProjectFile: false })).toBe(false);
    expect(shouldRecycleEditsWithOriginal(true, { ...cleanup, trashProjectFile: true })).toBe(true);
    // With the setting off, the clean-up moves only the copies it always did.
    expect(shouldRecycleEditsWithOriginal(false, { ...cleanup, trashProjectFile: true })).toBe(false);
  });
});

describe('the original after an export', () => {
  const asked = { ...defaults, cleanupAfterExport: true };

  test('goes when the clean-up dialog asked and its box was ticked, whatever the Export switch says', () => {
    expect(shouldRecycleOriginalAfterExport(true, true, { ...asked, trashSourceFile: true })).toBe(true);
    expect(shouldRecycleOriginalAfterExport(false, true, { ...asked, trashSourceFile: true })).toBe(true);
  });

  test('is kept when the clean-up dialog asked and its box was unticked, or it was cancelled', () => {
    expect(shouldRecycleOriginalAfterExport(true, true, { ...asked, trashSourceFile: false })).toBe(false);
    expect(shouldRecycleOriginalAfterExport(true, true, asked)).toBe(false);
    expect(shouldRecycleOriginalAfterExport(true, true, undefined)).toBe(false);
  });

  test('follows the Export switch when nothing asked', () => {
    expect(shouldRecycleOriginalAfterExport(true, false, undefined)).toBe(true);
    expect(shouldRecycleOriginalAfterExport(false, false, undefined)).toBe(false);
    // The clean-up done without asking leaves the original to the switch.
    const unattended = { ...asked, askForCleanup: false };
    expect(shouldRecycleOriginalAfterExport(true, false, { ...unattended, trashSourceFile: false })).toBe(true);
    expect(shouldRecycleOriginalAfterExport(false, false, { ...unattended, trashSourceFile: true })).toBe(false);
  });
});
