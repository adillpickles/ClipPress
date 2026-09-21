/**
 * Turning an ffprobe failure into something worth reading.
 *
 * Every file ClipPress cannot open produced the same three words, "Unsupported file",
 * which is true of a deleted file, a file another program has open, a zero-byte
 * recording and a text file renamed to .mp4 alike -- and leaves the user with nothing to
 * act on and no idea which of their files it was about.
 *
 * Deliberately no extension allowlist: ffmpeg decides what it can read, and hard-coding
 * a list of "supported" extensions would reject files it handles fine and accept files
 * it does not.
 */

export type FfprobeFailureKind =
  /** The path does not lead to a file any more. */
  | 'missing'
  /** The file is there but cannot be read: permissions, or another program holding it. */
  | 'noPermission'
  /** Zero bytes. Common when a recording or download was interrupted. */
  | 'empty'
  /** ffmpeg read the file and found nothing it recognises as media. */
  | 'notMedia'
  /** ffprobe failed for a reason we do not have a better word for. */
  | 'unknown';

/**
 * ffprobe's own last word on the file.
 *
 * It prints progress and stream information before the failure, so only the final line
 * is the reason. ffprobe prefixes it with the input path, which we drop because the file
 * is already named separately -- repeating a long path inside the detail line pushes the
 * part that matters off the end.
 */
export function getFfprobeFailureDetail({ stderr, filePath }: {
  stderr: string | undefined,
  filePath: string,
}) {
  const lastLine = (stderr ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .findLast((line) => line.length > 0);

  if (lastLine == null) return undefined;

  const fileName = filePath.split(/[/\\]/u).pop() ?? filePath;
  for (const prefix of [filePath, fileName]) {
    if (lastLine.startsWith(`${prefix}: `)) return lastLine.slice(prefix.length + 2);
  }
  return lastLine;
}

export function classifyFfprobeFailure({ stderr, fileSize }: {
  stderr: string | undefined,
  /** Undefined when we could not stat the file, which is itself not conclusive. */
  fileSize: number | undefined,
}): FfprobeFailureKind {
  const text = stderr ?? '';

  // Checked before the stderr patterns: a zero-byte file reports the same "Invalid data"
  // as a corrupt one, and "there is nothing in it" is the more useful thing to say.
  if (fileSize === 0) return 'empty';

  if (/No such file or directory/iu.test(text)) return 'missing';
  if (/Permission denied|Operation not permitted|being used by another process/iu.test(text)) return 'noPermission';
  if (/Invalid data found when processing input|End of file|Invalid argument/iu.test(text)) return 'notMedia';

  return 'unknown';
}
