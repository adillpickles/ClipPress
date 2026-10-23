import type { ChangeEventHandler } from 'react';
import { useState, useCallback } from 'react';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

import type { Html5ifyMode } from '../../../common/types';
import { DirectoryAccessDeclinedError } from '../../errors';
import getSwal from '../swal';
import Checkbox from '../components/Checkbox';
import type { SetWorking } from './useLoading';
import type { WithErrorHandling } from './useErrorHandling';
import type { FfmpegOperations } from './useFfmpegOperations';
import type { ShowGenericDialog } from '../components/GenericDialog';
import { useGenericDialogContext } from '../components/GenericDialog';
import * as Dialog from '../components/Dialog';
import { ButtonRow } from '../components/Dialog';
import { DialogButton } from '../components/Button';
import styles from '../components/Html5ifyDialog.module.css';


export default function useHtml5ify({ filePath, hasVideo, hasAudio, workingRef, setWorking, ensureWritableOutDir, customOutDir, batchFiles, enableAutoHtml5ify, setProgress, html5ify, withErrorHandling, showGenericDialog }: {
  filePath: string | undefined,
  hasVideo: boolean,
  hasAudio: boolean,
  workingRef: React.MutableRefObject<boolean>,
  setWorking: SetWorking,
  ensureWritableOutDir: (options: { inputPath: string, outDir: string | undefined }) => Promise<string | undefined>,
  customOutDir: string | undefined,
  batchFiles: { path: string }[],
  enableAutoHtml5ify: boolean,
  setProgress: (progress: number | undefined) => void,
  html5ify: FfmpegOperations['html5ify'],
  html5ifyDummy: FfmpegOperations['html5ifyDummy'],
  withErrorHandling: WithErrorHandling,
  showGenericDialog: ShowGenericDialog,
}) {
  const [previewFilePath, setPreviewFilePath] = useState<string>();
  const [usingDummyVideo, setUsingDummyVideo] = useState(false);
  const [rememberConvertToSupportedFormat, setRememberConvertToSupportedFormat] = useState<Html5ifyMode>();

  const html5ifyAndLoad = useCallback(async (cod: string | undefined, fp: string, speed: Html5ifyMode, hv: boolean, ha: boolean) => {
    try {
      setProgress(0);
      const path = await html5ify({ customOutDir: cod, filePath: fp, speed, hasAudio: ha, hasVideo: hv, onProgress: setProgress });
      if (!path) return;

      setPreviewFilePath(path);
      setUsingDummyVideo(speed === 'fastest');
    } finally {
      setProgress(undefined);
    }
  }, [html5ify, setProgress]);

  const askForHtml5ifySpeed = useCallback(async ({ allowedOptions, showRemember, initialOption, batch }: {
    allowedOptions: Html5ifyMode[],
    showRemember?: boolean | undefined,
    initialOption?: Html5ifyMode | undefined,
    batch?: boolean | undefined,
  }) => {
    // One instant and one smooth choice up front; the rest (including the quick copies, which often fail) are under More options (#19).
    const availOptions: Record<Html5ifyMode, { title: string, description: string }> = {
      fastest: { title: i18n.t('Instant preview'), description: i18n.t('Plays right away without making a copy. Skipping around is slower.') },
      'slow-audio': { title: i18n.t('Smooth preview copy'), description: i18n.t('Makes a lighter copy that plays and skips around smoothly. Takes a little while.') },
      slow: { title: i18n.t('Smooth preview copy, no sound'), description: i18n.t('Makes a lighter copy of the video only. Takes a little while.') },
      slowest: { title: i18n.t('High-quality preview copy'), description: i18n.t('Sharper picture, but takes longer to make.') },
      'fast-audio-remux': { title: i18n.t('Quick preview copy'), description: i18n.t('Repackages the video and sound without converting them. Often fails.') },
      'fast-audio': { title: i18n.t('Quick preview copy, convert sound'), description: i18n.t('Fails if the video format itself is not supported.') },
      fast: { title: i18n.t('Quick preview copy, no sound'), description: i18n.t('Repackages the video only. Often fails.') },
    };
    const order: Html5ifyMode[] = ['fastest', 'slow-audio', 'slow', 'slowest', 'fast-audio-remux', 'fast-audio', 'fast'];
    const options = order.filter((mode) => allowedOptions.includes(mode));
    const smoothOption = (['slow-audio', 'slow'] as const).find((mode) => options.includes(mode));
    const mainOptions = options.filter((mode) => mode === 'fastest' || mode === smoothOption);
    const moreOptions = options.filter((mode) => !mainOptions.includes(mode));
    const recommended = mainOptions[0] ?? options[0];

    const response = await new Promise<{ selectedOption: Html5ifyMode, rememberChoice: boolean } | undefined>((resolve) => {
      function AskForHtml5ifySpeed() {
        const { onOpenChange } = useGenericDialogContext();
        const { t } = useTranslation();

        const [option, setOption] = useState<Html5ifyMode>(initialOption != null && options.includes(initialOption) ? initialOption : recommended!);
        const [remember, setRemember] = useState(!!initialOption);
        const [showMore, setShowMore] = useState(initialOption != null && moreOptions.includes(initialOption));

        const onOptionChange = useCallback<ChangeEventHandler<HTMLInputElement>>((e) => setOption(e.currentTarget.value as Html5ifyMode), []);

        const onRememberChange = useCallback((checked: boolean) => setRemember(checked), []);

        const handleConfirmClick = useCallback(() => {
          resolve({ selectedOption: option, rememberChoice: remember });
          onOpenChange(false);
        }, [onOpenChange, option, remember]);

        const renderOption = (mode: Html5ifyMode) => {
          const id = `html5ify-${mode}`;
          const { title, description } = availOptions[mode];
          return (
            <label key={mode} htmlFor={id} className={[styles['option'], ...(option === mode ? [styles['optionActive']] : [])].join(' ')}>
              <input id={id} type="radio" name="html5ify-speed" value={mode} checked={option === mode} onChange={onOptionChange} className={styles['radio']} />
              <span className={styles['optionText']}>
                <span className={styles['optionTitle']}>
                  {title}
                  {mode === recommended && <span className={styles['badge']}>{t('Recommended')}</span>}
                </span>
                <span className={styles['optionDescription']}>{description}</span>
              </span>
            </label>
          );
        };

        return (
          <Dialog.Content aria-describedby={undefined} style={{ width: '34rem' }}>
            <Dialog.Title>
              {batch ? t('Make these recordings playable') : t('Make this recording playable')}
            </Dialog.Title>

            <Dialog.Description>
              {batch
                ? t('ClipPress makes a preview copy of each file in the batch list. Exports always use the original recordings.')
                : t('ClipPress can\'t play this file directly. Pick how to preview it while you edit. Exports always use the original recording.')}
            </Dialog.Description>

            <div className={styles['options']} role="radiogroup" aria-label={t('Preview method')}>
              {mainOptions.map((mode) => renderOption(mode))}
              {moreOptions.length > 0 && (
                <>
                  <button type="button" className={styles['more']} aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
                    {showMore ? <FiChevronDown aria-hidden /> : <FiChevronRight aria-hidden />}
                    {t('More options')}
                  </button>
                  {showMore && moreOptions.map((mode) => renderOption(mode))}
                </>
              )}
            </div>

            {showRemember && <Checkbox checked={remember} onCheckedChange={onRememberChange} label={t('Use this for other files until I restart ClipPress')} style={{ marginTop: '1rem' }} />}

            <ButtonRow>
              <Dialog.Close asChild>
                <DialogButton>{t('Cancel')}</DialogButton>
              </Dialog.Close>

              <DialogButton onClick={handleConfirmClick} primary>{t('Continue')}</DialogButton>
            </ButtonRow>
          </Dialog.Content>
        );
      }

      showGenericDialog({
        render: () => <AskForHtml5ifySpeed />,
        onClose: () => resolve(undefined),
      });
    });

    if (response == null) {
      return undefined;
    }

    return response;
  }, [showGenericDialog]);

  const userHtml5ifyCurrentFile = useCallback(async ({ ignoreRememberedValue, speed }: { ignoreRememberedValue?: boolean, speed?: Html5ifyMode } = {}) => {
    if (!filePath) return;

    // An explicit speed (e.g. from the preview's error state) skips the dialog.
    let selectedOption = speed ?? rememberConvertToSupportedFormat;
    if (selectedOption == null || (speed == null && ignoreRememberedValue)) {
      let allowedOptions: Html5ifyMode[] = [];
      if (hasAudio && hasVideo) allowedOptions = ['fastest', 'fast-audio-remux', 'fast-audio', 'fast', 'slow', 'slow-audio', 'slowest'];
      else if (hasAudio) allowedOptions = ['fast-audio-remux', 'slow-audio', 'slowest'];
      else if (hasVideo) allowedOptions = ['fastest', 'fast', 'slow', 'slowest'];

      const userResponse = await askForHtml5ifySpeed({ allowedOptions, showRemember: true, initialOption: selectedOption });
      console.log('Choice', userResponse);
      if (userResponse == null) return;
      ({ selectedOption } = userResponse);

      const { rememberChoice } = userResponse;

      setRememberConvertToSupportedFormat(rememberChoice ? selectedOption : undefined);
    }

    if (workingRef.current) return;
    try {
      setWorking({ text: i18n.t('Converting to supported format') });
      await withErrorHandling(async () => {
        await html5ifyAndLoad(customOutDir, filePath, selectedOption, hasVideo, hasAudio);
      }, i18n.t('Failed to convert file. Try a different conversion'));
    } finally {
      setWorking(undefined);
    }
  }, [filePath, rememberConvertToSupportedFormat, workingRef, hasAudio, hasVideo, askForHtml5ifySpeed, setWorking, withErrorHandling, html5ifyAndLoad, customOutDir]);

  const convertFormatBatch = useCallback(async () => {
    if (batchFiles.length === 0) return;

    const response = await askForHtml5ifySpeed({ allowedOptions: ['fast-audio-remux', 'fast-audio', 'fast', 'slow', 'slow-audio', 'slowest'], batch: true });
    if (response == null) return;
    const { selectedOption: speed } = response;

    if (workingRef.current) return;

    setWorking({ text: i18n.t('Batch converting to supported format') });
    setProgress(0);

    const filePaths = batchFiles.map((f) => f.path);

    const failedFiles: string[] = [];
    let i = 0;
    const setTotalProgress = (fileProgress = 0) => setProgress((i + fileProgress) / filePaths.length);

    try {
      await withErrorHandling(async () => {
        for (const path of filePaths) {
          try {
            const newCustomOutDir = await ensureWritableOutDir({ inputPath: path, outDir: customOutDir });

            await html5ify({ customOutDir: newCustomOutDir, filePath: path, speed, hasAudio: true, hasVideo: true, onProgress: setTotalProgress });
          } catch (err2) {
            if (err2 instanceof DirectoryAccessDeclinedError) return;

            console.error('Failed to html5ify', path, err2);
            failedFiles.push(path);
          }

          i += 1;
          setTotalProgress();
        }

        if (failedFiles.length > 0) getSwal().toast.fire({ title: `${i18n.t('Failed to convert files:')} ${failedFiles.join(' ')}`, timer: undefined, showConfirmButton: true });
      }, i18n.t('Failed to batch convert to supported format'));
    } finally {
      setWorking(undefined);
      setProgress(undefined);
    }
  }, [askForHtml5ifySpeed, batchFiles, customOutDir, ensureWritableOutDir, html5ify, setProgress, setWorking, withErrorHandling, workingRef]);

  const getConvertToSupportedFormat = useCallback((fallback: Html5ifyMode) => rememberConvertToSupportedFormat || fallback, [rememberConvertToSupportedFormat]);

  const html5ifyAndLoadWithPreferences = useCallback(async (cod: string | undefined, fp: string, speed: Html5ifyMode, hv: boolean, ha: boolean) => {
    if (!enableAutoHtml5ify) return;
    setWorking({ text: i18n.t('Converting to supported format') });
    await html5ifyAndLoad(cod, fp, getConvertToSupportedFormat(speed), hv, ha);
  }, [enableAutoHtml5ify, setWorking, html5ifyAndLoad, getConvertToSupportedFormat]);

  return { previewFilePath, setPreviewFilePath, usingDummyVideo, setUsingDummyVideo, userHtml5ifyCurrentFile, convertFormatBatch, html5ifyAndLoadWithPreferences };
}
