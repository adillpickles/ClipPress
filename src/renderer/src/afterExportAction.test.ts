import { describe, expect, test } from 'vitest';

import getAfterExportAction from './afterExportAction';

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
