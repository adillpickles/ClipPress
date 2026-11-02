import i18n from 'i18next';

import { runFfmpegStartupCheck, getFfmpegPath, FfExecutableNotFoundError } from './ffmpeg';
import { openSendReportDialog } from './reporting';
import { isMasBuild } from './util';


export default async function runStartupCheck({ onError }: { onError: (error: { title: string, message: string }) => void }) {
  try {
    return await runFfmpegStartupCheck();
  } catch (err) {
    if (err instanceof FfExecutableNotFoundError && !isMasBuild) {
      onError({
        title: i18n.t('Fatal: FFmpeg executable not found'),
        message: `${i18n.t('Make sure that the FFmpeg executable exists:')}\n\n${err.path}`,
      });
      return undefined;
    }

    if (err instanceof Error && !isMasBuild && 'code' in err && typeof err.code === 'string' && ['EPERM', 'EACCES', 'ENOENT'].includes(err.code)) {
      onError({
        title: i18n.t('Fatal: FFmpeg not accessible'),
        message: [
          i18n.t('Error code: {{errorCode}}. This could mean that anti-virus or something else is blocking the execution of FFmpeg. Make sure the following file exists and is executable:', { errorCode: err.code }),
          '',
          getFfmpegPath(),
        ].join('\n'),
      });
      return undefined;
    }

    openSendReportDialog({ message: i18n.t('FFmpeg is non-functional'), err });
    return undefined;
  }
}
