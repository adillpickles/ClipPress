import { describe, expect, it } from 'vitest';

import { classifyFfprobeFailure, getFfprobeFailureDetail } from './ffprobeFailure';

const filePath = String.raw`D:\Recordings\CLIPS\Valorant 2026.09.11 - 18.42.42.40.DVR.mp4`;

describe('getFfprobeFailureDetail', () => {
  it('takes ffprobe\'s last word, not its first', () => {
    const stderr = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2:',
      '  Duration: N/A, bitrate: N/A',
      `${filePath}: Invalid data found when processing input`,
    ].join('\n');
    expect(getFfprobeFailureDetail({ stderr, filePath })).toBe('Invalid data found when processing input');
  });

  it('drops the path ffprobe repeats, whether full or just the name', () => {
    expect(getFfprobeFailureDetail({ stderr: `${filePath}: Permission denied`, filePath }))
      .toBe('Permission denied');
    expect(getFfprobeFailureDetail({ stderr: 'Valorant 2026.09.11 - 18.42.42.40.DVR.mp4: Permission denied', filePath }))
      .toBe('Permission denied');
  });

  it('keeps a line that is not just a repeat of the path', () => {
    expect(getFfprobeFailureDetail({ stderr: 'Something else: went wrong', filePath }))
      .toBe('Something else: went wrong');
  });

  it('copes with carriage returns and trailing blank lines', () => {
    expect(getFfprobeFailureDetail({ stderr: 'first\r\nlast line\r\n\r\n', filePath })).toBe('last line');
  });

  it('has nothing to say when ffprobe said nothing', () => {
    expect(getFfprobeFailureDetail({ stderr: '', filePath })).toBeUndefined();
    expect(getFfprobeFailureDetail({ stderr: undefined, filePath })).toBeUndefined();
    expect(getFfprobeFailureDetail({ stderr: '  \n \n', filePath })).toBeUndefined();
  });
});

describe('classifyFfprobeFailure', () => {
  it('recognises a file that is no longer there', () => {
    expect(classifyFfprobeFailure({ stderr: `${filePath}: No such file or directory`, fileSize: undefined })).toBe('missing');
  });

  it('recognises a file it is not allowed to read', () => {
    expect(classifyFfprobeFailure({ stderr: `${filePath}: Permission denied`, fileSize: 1000 })).toBe('noPermission');
    expect(classifyFfprobeFailure({ stderr: 'The process cannot access the file because it is being used by another process', fileSize: 1000 })).toBe('noPermission');
  });

  it('recognises a file with nothing ffmpeg can read in it', () => {
    expect(classifyFfprobeFailure({ stderr: `${filePath}: Invalid data found when processing input`, fileSize: 4096 })).toBe('notMedia');
    expect(classifyFfprobeFailure({ stderr: 'End of file', fileSize: 4096 })).toBe('notMedia');
  });

  it('calls a zero-byte file empty, which ffprobe cannot tell us', () => {
    // An interrupted recording reports the same "Invalid data" as a corrupt one, and
    // "there is nothing in it" is the more useful thing to say.
    expect(classifyFfprobeFailure({ stderr: `${filePath}: Invalid data found when processing input`, fileSize: 0 })).toBe('empty');
  });

  it('does not guess when it cannot tell', () => {
    expect(classifyFfprobeFailure({ stderr: 'something we have never seen', fileSize: 1000 })).toBe('unknown');
    expect(classifyFfprobeFailure({ stderr: undefined, fileSize: undefined })).toBe('unknown');
  });

  it('does not depend on a file size it could not read', () => {
    expect(classifyFfprobeFailure({ stderr: `${filePath}: No such file or directory`, fileSize: undefined })).toBe('missing');
  });
});
