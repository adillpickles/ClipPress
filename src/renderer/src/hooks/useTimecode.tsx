import type { FormEventHandler } from 'react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FormatTimecode, ParseTimecode } from '../types';
import { getFrameCountRaw } from '../edlFormats';
import { getFrameDuration } from '../util';
import type { TimecodeFormat } from '../../../common/types';
import { formatDuration, parseDuration } from '../util/duration';
import type { ShowGenericDialog } from '../components/GenericDialog';
import { useGenericDialogContext } from '../components/GenericDialog';
import * as Dialog from '../components/Dialog';
import TextInput from '../components/TextInput';
import { ButtonRow } from '../components/Dialog';
import { DialogButton } from '../components/Button';
import HelpTip from '../components/HelpTip';
import { dangerColor } from '../colors';


export default ({ detectedFps, timecodeFormat, showGenericDialog }: {
  detectedFps: number | undefined,
  timecodeFormat: TimecodeFormat,
  showGenericDialog: ShowGenericDialog,
}) => {
  const getFrameCount = useCallback((sec: number) => getFrameCountRaw(detectedFps, sec), [detectedFps]);
  const frameCountToDuration = useCallback((frames: number) => getFrameDuration(detectedFps) * frames, [detectedFps]);

  const formatTimecode = useCallback<FormatTimecode>(({ seconds, shorten, fileNameFriendly }) => {
    if (timecodeFormat === 'frameCount') {
      const frameCount = getFrameCount(seconds);
      return frameCount != null ? String(frameCount) : '';
    }
    if (timecodeFormat === 'seconds') {
      return seconds.toFixed(3);
    }
    if (timecodeFormat === 'timecodeWithFramesFraction') {
      return formatDuration({ seconds, shorten, fileNameFriendly, fps: detectedFps });
    }
    return formatDuration({ seconds, shorten, fileNameFriendly });
  }, [detectedFps, timecodeFormat, getFrameCount]);

  const timecodePlaceholder = useMemo(() => formatTimecode({ seconds: 0, shorten: false }), [formatTimecode]);

  const parseTimecode = useCallback<ParseTimecode>((val: string) => {
    if (timecodeFormat === 'frameCount') {
      const parsed = parseInt(val, 10);
      return frameCountToDuration(parsed);
    }
    if (timecodeFormat === 'seconds') {
      return parseFloat(val);
    }
    if (timecodeFormat === 'timecodeWithFramesFraction') {
      return parseDuration(val, detectedFps);
    }
    return parseDuration(val);
  }, [detectedFps, frameCountToDuration, timecodeFormat]);

  const formatTimeAndFrames = useCallback((seconds: number) => {
    const frameCount = getFrameCount(seconds);

    const timeStr = timecodeFormat === 'timecodeWithFramesFraction'
      ? formatDuration({ seconds, fps: detectedFps })
      : formatDuration({ seconds });

    return `${timeStr} (${frameCount ?? '0'})`;
  }, [detectedFps, timecodeFormat, getFrameCount]);

  const promptTimecode = useCallback(async ({ initialValue, title, description, help, inputPlaceholder, allowRelative = false, parse, invalidMessage }: {
    initialValue?: string | undefined,
    title: string,
    description?: string | undefined,
    /** Tips kept behind an "i" next to the title instead of a line of text that is always shown. */
    help?: string | undefined,
    inputPlaceholder: string,
    allowRelative?: boolean,
    /** Reads what was typed. Defaults to the user's timecode format; simple mode passes its own clock format. */
    parse?: ((value: string) => number | undefined) | undefined,
    invalidMessage?: string | undefined,
  }) => new Promise<{ duration: number, relDirection: number | undefined } | undefined>((resolve) => {
    function TimecodeDialog() {
      const { t } = useTranslation();
      const [value, setValue] = useState(initialValue ?? '');
      const [error, setError] = useState<string | undefined>();
      const descriptionId = useId();
      const inputRef = useRef<HTMLInputElement>(null);

      const { onOpenChange } = useGenericDialogContext();

      const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(async (e) => {
        e.preventDefault();

        let relDirection: number | undefined;
        if (allowRelative) {
          if (value.startsWith('-')) relDirection = -1;
          else if (value.startsWith('+')) relDirection = 1;
        }

        const withoutPrefix = allowRelative ? value.replace(/^[+-]/, '') : value;

        const duration = (parse ?? parseTimecode)(withoutPrefix);

        setError(duration == null ? (invalidMessage ?? t('Invalid timecode format')) : undefined);

        if (duration != null) {
          resolve({ duration, relDirection });
          onOpenChange(false);
        }
      }, [onOpenChange, t, value]);

      // Start in the field with the time selected, so typing replaces it, even when the "i" comes first.
      const handleOpenAutoFocus = useCallback((e: Event) => {
        if (inputRef.current == null) return;
        e.preventDefault();
        inputRef.current.focus();
        inputRef.current.select();
      }, []);

      return (
        // One short field, so a narrow dialog like the app's other small prompts.
        <Dialog.Content aria-describedby={description ? descriptionId : undefined} style={{ width: 'min(24rem, 92vw)' }} onOpenAutoFocus={handleOpenAutoFocus}>
          {help ? (
            // The "i" sits beside the title, not inside it, so it stays out of the dialog's name.
            <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', margin: '0 2.5rem .35rem 0' }}>
              <Dialog.Title style={{ margin: 0 }}>{title}</Dialog.Title>
              <HelpTip label={t('How to type a time')}>{help}</HelpTip>
            </div>
          ) : (
            <Dialog.Title>{title}</Dialog.Title>
          )}

          {description && <Dialog.Description id={descriptionId}>{description}</Dialog.Description>}

          <form onSubmit={handleSubmit}>
            <TextInput
              ref={inputRef}
              value={value}
              placeholder={inputPlaceholder}
              aria-label={title}
              onChange={(e) => setValue(e.target.value)}
              style={{ margin: '.5rem 0 0', width: '100%', boxSizing: 'border-box' }}
            />

            {error != null && (
              <div role="alert" style={{ color: dangerColor, fontWeight: 'bold', marginTop: '.5rem' }}>
                {error}
              </div>
            )}

            <ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Cancel')}</DialogButton>
              </Dialog.Close>

              <DialogButton type="submit" primary>{t('Go')}</DialogButton>
            </ButtonRow>
          </form>
        </Dialog.Content>
      );
    }

    showGenericDialog({
      render: () => <TimecodeDialog />,
      onClose: () => resolve(undefined),
    });
  }), [parseTimecode, showGenericDialog]);

  return {
    parseTimecode,
    formatTimecode,
    formatTimeAndFrames,
    timecodePlaceholder,
    getFrameCount,
    promptTimecode,
  };
};
