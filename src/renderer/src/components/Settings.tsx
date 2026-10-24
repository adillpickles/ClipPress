import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { memo, useCallback, useId, useMemo, useState } from 'react';
import { FiFolder, FiX } from 'react-icons/fi';
import { FaRegKeyboard } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';

import AutoExportToggler from './AutoExportToggler';
import Switch from './Switch';
import UpdateSettings from './UpdateSettings';
import useUserSettings from '../hooks/useUserSettings';
import { askForFfPath } from '../dialogs';
import { getEnableImportChaptersOptions, isMasBuild, isStoreBuild } from '../util';
import type { SupportedLanguage } from '../../../common/i18n';
import { langNames } from '../../../common/i18n';
import type { CaptureFormat, Config, EnableImportChapters, ModifierKey, ProjectFileLocation, TimecodeFormat } from '../../../common/types.js';
import { getProjectsDir, getProjectStoreEnv } from '../projectStore';
import styles from './Settings.module.css';
import Select from './Select';
import Button from './Button';
import { getModifierKeyNames } from '../hooks/useTimelineScroll';
import type { TunerType } from '../types';
import SettingRow from './SettingRow';
import getAfterExportAction from '../afterExportAction';
import type { AfterExportAction } from '../afterExportAction';
import { DirectoryAccessDeclinedError } from '../../errors';

function ModifierKeySetting({ label, description, value, setValue }: { label: string, description?: string, value: ModifierKey, setValue: (v: ModifierKey) => void }) {
  const id = useId();
  return (
    <SettingRow label={label} description={description} controlId={id}>
      <Select id={id} value={value} onChange={(e) => setValue(e.target.value as ModifierKey)}>
        {Object.entries(getModifierKeyNames()).map(([key, name]) => (
          <option key={key} value={key}>{name}</option>
        ))}
      </Select>
    </SettingRow>
  );
}

type Category = 'general' | 'interface' | 'editing' | 'export' | 'snapshots' | 'input' | 'projects' | 'updates' | 'advanced';

function Settings({
  onTunerRequested,
  onKeyboardShortcutsDialogRequested,
  askForCleanupChoices,
  onProjectFileLocationChange,
  showAdvancedSettings,
  setShowAdvancedSettings,
}: {
  onTunerRequested: (type: TunerType) => void,
  onKeyboardShortcutsDialogRequested: () => void,
  askForCleanupChoices: () => Promise<unknown>,
  onProjectFileLocationChange: (location: ProjectFileLocation) => Promise<void>,
  showAdvancedSettings: boolean,
  setShowAdvancedSettings: (v: boolean) => void,
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category>('general');
  const projectLocationId = useId();
  const showProjectsFolder = useCallback(() => {
    window.require('electron').shell.openPath(getProjectsDir(getProjectStoreEnv())).catch?.(() => undefined);
  }, []);

  const { customOutDir, setCustomOutDir, changeOutDir, ensureWritableOutDirWithFilePath, cleanupChoices, simpleMode, captureFormat, setCaptureFormat, wheelSensitivity, waveformHeight, keyboardNormalSeekSpeed, keyboardSeekSpeed2, keyboardSeekSpeed3, keyboardSeekAccFactor, keyframeCut, toggleKeyframeCut, timecodeFormat, setTimecodeFormat, invertCutSegments, setInvertCutSegments, askBeforeClose, setAskBeforeClose, enableImportChapters, setEnableImportChapters, enableAskForFileOpenAction, setEnableAskForFileOpenAction, autoSaveProjectFile, setAutoSaveProjectFile, invertTimelineScroll, setInvertTimelineScroll, language, setLanguage, hideNotifications, setHideNotifications, hideOsNotifications, setHideOsNotifications, autoLoadTimecode, setAutoLoadTimecode, enableAutoHtml5ify, setEnableAutoHtml5ify, customFfPath, setCustomFfPath, projectFileLocation, mouseWheelZoomModifierKey, setMouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, setMouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, setMouseWheelKeyframeSeekModifierKey, segmentMouseModifierKey, setSegmentMouseModifierKey, captureFrameMethod, setCaptureFrameMethod, captureFrameQuality, setCaptureFrameQuality, captureFrameFileNameFormat, setCaptureFrameFileNameFormat, enableNativeHevc, setEnableNativeHevc, allowMultipleInstances, setAllowMultipleInstances, preferStrongColors, setPreferStrongColors, treatInputFileModifiedTimeAsStart, setTreatInputFileModifiedTimeAsStart, treatOutputFileModifiedTimeAsStart, setTreatOutputFileModifiedTimeAsStart, exportConfirmEnabled, toggleExportConfirmEnabled, storeWindowBounds, setStoreWindowBounds, reducedMotion, setReducedMotion, ffmpegHwaccel, setFfmpegHwaccel, exportGpuAcceleration, setExportGpuAcceleration, trashSourceAfterExport, setTrashSourceAfterExport, enableAdvancedMode, setEnableAdvancedMode } = useUserSettings();

  const onLangChange = useCallback<ChangeEventHandler<HTMLSelectElement>>((e) => {
    const { value } = e.target;
    const l = value !== '' ? value : null;
    setLanguage(l as SupportedLanguage | null);
  }, [setLanguage]);

  const timecodeFormatOptions = useMemo<Record<TimecodeFormat, string>>(() => ({
    frameCount: t('Frame counts'),
    seconds: t('Total seconds'),
    timecodeWithDecimalFraction: t('Millisecond fractions'),
    timecodeWithFramesFraction: t('Frame fractions'),
  }), [t]);

  const changeCustomFfPath = useCallback(async () => {
    const newCustomFfPath = await askForFfPath(customFfPath);
    if (newCustomFfPath == null) return;
    setCustomFfPath(newCustomFfPath);
  }, [customFfPath, setCustomFfPath]);

  const clearCustomFfPath = useCallback(() => {
    setCustomFfPath(undefined);
  }, [setCustomFfPath]);

  // Back to saving next to the recording, once that folder can be written to (as the folder dialog does).
  const saveNextToRecording = useCallback(async () => {
    try {
      await ensureWritableOutDirWithFilePath({ outDir: undefined });
      setCustomOutDir(undefined);
    } catch (err) {
      if (err instanceof DirectoryAccessDeclinedError) return;
      throw err;
    }
  }, [ensureWritableOutDirWithFilePath, setCustomOutDir]);

  const afterExportLabels = useMemo<Record<AfterExportAction, string>>(() => ({
    nothing: t('Keep the recording open'),
    close: t('Close the recording'),
    ask: t('Ask each time'),
    binTemp: t('Move temporary files to the Recycle Bin'),
    closeAndBinTemp: t('Close the recording and move temporary files to the Recycle Bin'),
    binProject: t('Move the project file to the Recycle Bin'),
    closeAndBinProject: t('Close the recording and move its project file to the Recycle Bin'),
    binTempAndProject: t('Move temporary and project files to the Recycle Bin'),
    closeAndBinTempAndProject: t('Close the recording and move temporary and project files to the Recycle Bin'),
  }), [t]);

  const formatSeconds = useCallback((seconds: number) => t('{{seconds}} s', { seconds: Number(seconds.toFixed(2)) }), [t]);

  const categories = useMemo(() => ([
    { id: 'general', label: t('General') },
    { id: 'interface', label: t('Appearance') },
    { id: 'editing', label: t('Editing') },
    { id: 'export', label: t('Export') },
    { id: 'snapshots', label: t('Snapshots') },
    { id: 'input', label: t('Keyboard & mouse') },
    { id: 'projects', label: t('Projects') },
    ...(!isStoreBuild ? [{ id: 'updates' as const, label: t('Updates') }] : []),
    ...(showAdvancedSettings ? [{ id: 'advanced' as const, label: t('Advanced') }] : []),
  ] satisfies { id: Category, label: string }[]), [showAdvancedSettings, t]);

  const activeCategory = categories.some((c) => c.id === category) ? category : 'general';
  const activeLabel = categories.find((c) => c.id === activeCategory)?.label;
  invariant(activeLabel != null);

  const languageId = useId();
  const reducedMotionId = useId();
  const timecodeId = useId();
  const outputDateId = useId();
  const sourceDateId = useId();
  const chaptersId = useId();
  const captureFormatId = useId();
  const advancedToggleId = useId();
  const tabsId = useId();
  const getTabId = (id: Category) => `${tabsId}-tab-${id}`;
  const panelId = `${tabsId}-panel`;

  // The categories are tabs: one Tab stop, and the arrow keys (or Home and End) move between them.
  const onTabListKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    const index = categories.findIndex((c) => c.id === activeCategory);
    const targets: Partial<Record<string, number>> = {
      ArrowDown: (index + 1) % categories.length,
      ArrowUp: (index - 1 + categories.length) % categories.length,
      Home: 0,
      End: categories.length - 1,
    };
    const next = targets[e.key];
    const nextCategory = next != null ? categories[next] : undefined;
    if (next == null || nextCategory == null) return;
    e.preventDefault();
    setCategory(nextCategory.id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  function renderCategory() {
    switch (activeCategory) {
      case 'general': {
        return (
          <>
            <SettingRow label={t('Language')} controlId={languageId}>
              <Select id={languageId} value={language ?? ''} onChange={onLangChange}>
                <option key="" value="">{t('System language')}</option>
                {Object.keys(langNames).map((lang) => <option key={lang} value={lang}>{langNames[lang as keyof typeof langNames]}</option>)}
              </Select>
            </SettingRow>

            <SettingRow
              label={t('Review before exporting')}
              description={t('Show the export options each time you export.')}
              details={t('The export options let you choose the quality or file size, how clips are saved and what they are called. Without them, Export uses your last choices straight away.')}
            >
              <Switch checked={exportConfirmEnabled} onCheckedChange={toggleExportConfirmEnabled} aria-label={t('Review before exporting')} />
            </SettingRow>

            <SettingRow label={t('System notifications')} description={t('Tell me when an export finishes.')}>
              <Switch checked={!hideOsNotifications} onCheckedChange={(v) => setHideOsNotifications(v ? undefined : 'all')} aria-label={t('System notifications')} />
            </SettingRow>

            <SettingRow label={t('In-app messages')} description={t('Short messages about what just happened.')}>
              <Switch checked={!hideNotifications} onCheckedChange={(v) => setHideNotifications(v ? undefined : 'all')} aria-label={t('In-app messages')} />
            </SettingRow>

            <SettingRow label={t('Confirm before closing')} description={t('Ask before closing ClipPress or a recording.')}>
              <Switch checked={askBeforeClose} onCheckedChange={setAskBeforeClose} aria-label={t('Confirm before closing')} />
            </SettingRow>

            <SettingRow label={t('Advanced mode')} description={t('Adds a switch to the top bar for the classic editor, with frame-by-frame tools and every export option. Still unfinished.')}>
              <Switch checked={enableAdvancedMode} onCheckedChange={setEnableAdvancedMode} aria-label={t('Advanced mode')} />
            </SettingRow>

            {showAdvancedSettings && (
              <SettingRow label={t('Ask when opening another file')} description={t('Choose what happens when a file is opened while another is open.')}>
                <Switch checked={enableAskForFileOpenAction} onCheckedChange={setEnableAskForFileOpenAction} aria-label={t('Ask when opening another file')} />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Remember window size and position')}>
                <Switch checked={storeWindowBounds} onCheckedChange={setStoreWindowBounds} aria-label={t('Remember window size and position')} />
              </SettingRow>
            )}
          </>
        );
      }

      case 'interface': {
        return (
          <>
            <SettingRow label={t('Stronger colors')} description={t('More saturated colors for clips on the timeline.')}>
              <Switch checked={preferStrongColors} onCheckedChange={setPreferStrongColors} aria-label={t('Stronger colors')} />
            </SettingRow>

            <SettingRow label={t('Reduce motion')} description={t('Turn off animations.')} controlId={reducedMotionId}>
              <Select id={reducedMotionId} value={reducedMotion} onChange={(e) => setReducedMotion(e.target.value as Config['reducedMotion'])}>
                {Object.entries({ user: t('System default'), always: t('Yes'), never: t('No') } satisfies Record<Config['reducedMotion'], string>).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </Select>
            </SettingRow>

            {/* Simple mode writes times its own way, so this only matters with the advanced options. */}
            {showAdvancedSettings && (
              <SettingRow label={t('Time format')} description={enableAdvancedMode ? t('How times are shown in advanced mode and in exported file names.') : t('How times are shown in exported file names.')} controlId={timecodeId}>
                <Select id={timecodeId} value={timecodeFormat} onChange={(e) => setTimecodeFormat(e.target.value as TimecodeFormat)}>
                  {Object.entries(timecodeFormatOptions).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </Select>
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Waveform height')} value={t('{{height}} px', { height: Math.round(waveformHeight) })}>
                <Button onClick={() => onTunerRequested('waveformHeight')}>{t('Adjust')}</Button>
              </SettingRow>
            )}
          </>
        );
      }

      case 'editing': {
        return (
          <>
            <SettingRow
              label={t('Clips are')}
              value={invertCutSegments ? t('The export keeps everything except the clips.') : t('The export contains only the clips.')}
              details={t('"Kept" is the usual way to make clips. "Removed" cuts the marked parts out of the recording instead, for example to drop a pause or a loading screen.')}
            >
              <Select value={invertCutSegments ? 'remove' : 'keep'} onChange={(e) => setInvertCutSegments(e.target.value === 'remove')} aria-label={t('Clips are')}>
                <option value="keep">{t('Kept')}</option>
                <option value="remove">{t('Removed')}</option>
              </Select>
            </SettingRow>

            {showAdvancedSettings && (
              <SettingRow label={t('Convert unsupported files')} description={t('Make a playable preview when a file cannot be played directly.')}>
                <Switch checked={enableAutoHtml5ify} onCheckedChange={setEnableAutoHtml5ify} aria-label={t('Convert unsupported files')} />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Use the file\'s timecode')} description={t('Start the timeline at the timecode stored in the file.')}>
                <Switch checked={autoLoadTimecode} onCheckedChange={setAutoLoadTimecode} aria-label={t('Use the file\'s timecode')} />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Chapters as clips')} description={t('Turn a file\'s chapters into clips when opening it.')} controlId={chaptersId}>
                <Select id={chaptersId} value={enableImportChapters} onChange={(e) => setEnableImportChapters(e.target.value as EnableImportChapters)}>
                  {Object.entries(getEnableImportChaptersOptions() satisfies Record<EnableImportChapters, string>).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </Select>
              </SettingRow>
            )}
          </>
        );
      }

      case 'export': {
        return (
          <>
            <SettingRow
              label={t('Use the GPU')}
              description={t('Faster exports on NVIDIA, AMD or Intel graphics.')}
              details={t('Decodes video on the graphics card and re-encodes regular exports with its H.264 encoder. ClipPress switches to the CPU automatically if the GPU fails. Size-limited exports pick their encoder from the preset.')}
            >
              <Switch checked={exportGpuAcceleration} onCheckedChange={setExportGpuAcceleration} aria-label={t('Use the GPU')} />
            </SettingRow>

            <SettingRow
              label={t('Save exports to')}
              value={customOutDir ?? t('The same folder as the recording.')}
            >
              {/* Straight to the folder picker; the small x goes back to the recording's folder. */}
              <div className={styles['controlGroup']}>
                <Button onClick={changeOutDir}>
                  <FiFolder aria-hidden />
                  {t('Change…')}
                </Button>
                {customOutDir != null && (
                  <Button variant="ghost" onClick={saveNextToRecording} title={t('Save next to the recording')} aria-label={t('Save next to the recording')}>
                    <FiX aria-hidden />
                  </Button>
                )}
              </div>
            </SettingRow>

            <SettingRow
              label={t('Move the original to the Recycle Bin after export')}
              description={t('Only after every exported file is saved and checked. Your clip keeps its own name.')}
              details={t('Never deleted permanently: if the Recycle Bin can\'t take the recording (too large, a drive without one, or in use), ClipPress keeps it and tells you.')}
            >
              <Switch checked={trashSourceAfterExport} onCheckedChange={setTrashSourceAfterExport} aria-label={t('Move the original to the Recycle Bin after export')} />
            </SettingRow>

            <SettingRow
              label={t('After exporting')}
              description={t('Close the recording, or move temporary and project files to the Recycle Bin.')}
              value={afterExportLabels[getAfterExportAction(cleanupChoices, simpleMode)]}
            >
              <Button onClick={askForCleanupChoices}>{t('Choose…')}</Button>
            </SettingRow>

            {showAdvancedSettings && (
              <SettingRow
                label={t('Keyframe cut')}
                value={keyframeCut ? t('Cut at the keyframe before the start (lossless exports).') : t('Cut at the exact time (lossless exports).')}
                details={keyframeCut ? (
                  <>
                    {t('Cut at the preceding keyframe (not accurate time.) Equiv to')}: <code className="highlighted">ffmpeg -ss N -i input.mp4</code>
                  </>
                ) : (
                  <>
                    {t('Accurate time but could leave an empty portion at the beginning of the video. Equiv to')}: <code className="highlighted">ffmpeg -i input -ss N</code>
                  </>
                )}
              >
                <Switch checked={keyframeCut} onCheckedChange={() => toggleKeyframeCut()} aria-label={t('Keyframe cut')} />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow
                label={t('Tracks that cannot be cut')}
                description={t('Data tracks such as GoPro GPS or telemetry.')}
                details={t('(data tracks such as GoPro GPS, telemetry etc. are not copied over by default because ffmpeg cannot cut them, thus they will cause the media duration to stay the same after cutting video/audio)')}
              >
                <AutoExportToggler />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Date of exported files')} controlId={outputDateId}>
                <Select id={outputDateId} value={typeof treatOutputFileModifiedTimeAsStart === 'boolean' ? String(treatOutputFileModifiedTimeAsStart) : 'disabled'} onChange={(e) => setTreatOutputFileModifiedTimeAsStart(e.target.value === 'disabled' ? null : (e.target.value === 'true'))}>
                  <option value="disabled">{t('Current time')}</option>
                  <option value="true">{t('Recording time + clip start')}</option>
                  <option value="false">{t('Recording time − clip end')}</option>
                </Select>
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Treat the recording\'s date as')} details={t('The recording file\'s modified date and time.')} controlId={sourceDateId}>
                <Select id={sourceDateId} disabled={treatOutputFileModifiedTimeAsStart == null} value={String(treatInputFileModifiedTimeAsStart)} onChange={(e) => setTreatInputFileModifiedTimeAsStart((e.target.value === 'true'))}>
                  <option value="true">{t('Start of video')}</option>
                  <option value="false">{t('End of video')}</option>
                </Select>
              </SettingRow>
            )}
          </>
        );
      }

      case 'snapshots': {
        return (
          <>
            <SettingRow label={t('Image format')} description={t('For frames captured from the video.')} controlId={captureFormatId}>
              <Select id={captureFormatId} value={captureFormat} onChange={(e) => setCaptureFormat(e.target.value as CaptureFormat)}>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </Select>
            </SettingRow>

            {/* PNG is lossless, so quality only matters there for the copies to the clipboard (always JPEG):
                that stays reachable with the advanced options. */}
            {(captureFormat !== 'png' || showAdvancedSettings) && (
              <SettingRow
                label={t('Image quality')}
                value={`${Math.round(captureFrameQuality * 100)}%`}
                details={t('Also used for snapshots copied to the clipboard.')}
              >
                <input
                  type="range"
                  className={styles['range']}
                  aria-label={t('Image quality')}
                  aria-valuetext={`${Math.round(captureFrameQuality * 100)}%`}
                  min={1}
                  max={100}
                  step={1}
                  value={Math.round(captureFrameQuality * 100)}
                  onChange={(e) => setCaptureFrameQuality(Math.max(Math.min(1, parseInt(e.target.value, 10) / 100), 0.01))}
                />
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow
                label={t('Capture method')}
                details={t('FFmpeg capture method might sometimes capture more correct colors, but the captured snapshot might be off by one or more frames, relative to the preview.')}
              >
                <Select value={captureFrameMethod} onChange={(e) => setCaptureFrameMethod(e.target.value as typeof captureFrameMethod)} aria-label={t('Capture method')}>
                  <option value="videotag">{t('HTML video tag')}</option>
                  <option value="ffmpeg">{t('FFmpeg')}</option>
                </Select>
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow
                label={t('Names of extracted frames')}
                details={t('Note that this only applies when extracting multiple frames. When "Frame number" is selected, frame numbers are relative to the start of the segment (starting from 1).')}
              >
                <Select value={captureFrameFileNameFormat} onChange={(e) => setCaptureFrameFileNameFormat(e.target.value as typeof captureFrameFileNameFormat)} aria-label={t('Names of extracted frames')}>
                  <option value="timestamp">{t('Frame timestamp')}</option>
                  <option value="index">{t('Frame number')}</option>
                </Select>
              </SettingRow>
            )}
          </>
        );
      }

      case 'input': {
        return (
          <>
            <SettingRow label={t('Keyboard shortcuts')} description={t('See and change every shortcut.')}>
              <Button onClick={onKeyboardShortcutsDialogRequested}>
                <FaRegKeyboard aria-hidden />
                {t('Open…')}
              </Button>
            </SettingRow>

            <ModifierKeySetting label={t('Move or resize a clip')} description={t('Hold this key and drag a clip\'s edge on the timeline.')} value={segmentMouseModifierKey} setValue={setSegmentMouseModifierKey} />
            <ModifierKeySetting label={t('Zoom with the wheel')} value={mouseWheelZoomModifierKey} setValue={setMouseWheelZoomModifierKey} />
            <ModifierKeySetting label={t('Step frames with the wheel')} value={mouseWheelFrameSeekModifierKey} setValue={setMouseWheelFrameSeekModifierKey} />
            {showAdvancedSettings && (
              <ModifierKeySetting label={t('Jump keyframes with the wheel')} value={mouseWheelKeyframeSeekModifierKey} setValue={setMouseWheelKeyframeSeekModifierKey} />
            )}

            <SettingRow label={t('Reverse wheel direction')} description={t('On the timeline.')}>
              <Switch checked={invertTimelineScroll ?? false} onCheckedChange={setInvertTimelineScroll} aria-label={t('Reverse wheel direction')} />
            </SettingRow>

            <SettingRow label={t('Wheel and trackpad sensitivity')} value={wheelSensitivity.toFixed(2)}>
              <Button onClick={() => onTunerRequested('wheelSensitivity')}>{t('Adjust')}</Button>
            </SettingRow>

            <SettingRow label={t('Arrow key seek step')} description={t('How far the arrow keys move.')} value={formatSeconds(keyboardNormalSeekSpeed)}>
              <Button onClick={() => onTunerRequested('keyboardNormalSeekSpeed')}>{t('Adjust')}</Button>
            </SettingRow>

            {showAdvancedSettings && (
              <>
                <SettingRow label={t('Longer seek step')} value={formatSeconds(keyboardSeekSpeed2)}>
                  <Button onClick={() => onTunerRequested('keyboardSeekSpeed2')}>{t('Adjust')}</Button>
                </SettingRow>

                <SettingRow label={t('Longest seek step')} value={formatSeconds(keyboardSeekSpeed3)}>
                  <Button onClick={() => onTunerRequested('keyboardSeekSpeed3')}>{t('Adjust')}</Button>
                </SettingRow>

                <SettingRow label={t('Seek acceleration')} description={t('How quickly holding a seek key speeds up.')} value={`×${keyboardSeekAccFactor.toFixed(2)}`}>
                  <Button onClick={() => onTunerRequested('keyboardSeekAccFactor')}>{t('Adjust')}</Button>
                </SettingRow>
              </>
            )}
          </>
        );
      }

      case 'projects': {
        return (
          <>
            <SettingRow
              label={t('Save edits automatically')}
              description={t('Opening the same recording again brings back your clips, text and settings.')}
            >
              <Switch checked={autoSaveProjectFile} onCheckedChange={setAutoSaveProjectFile} aria-label={t('Save edits automatically')} />
            </SettingRow>

            <SettingRow
              label={t('Where edits are kept')}
              description={t('Where ClipPress saves the clips, text and settings for each recording.')}
              details={(
                <>
                  {t('In ClipPress: your recording folders stay clean.')}
                  <br />
                  {t('Next to the recording: a small project file beside each edited recording.')}
                  <br />
                  {t('In the export folder: a project file beside your exports, or next to the recording while none is chosen.')}
                </>
              )}
              controlId={projectLocationId}
            >
              <div className={styles['inlineControls']}>
                {/* The saved choice, even when it waits for an export folder (its label says so): showing "Next to the
                    recording" instead would make that option impossible to pick, and leave a later export folder
                    quietly taking the project files. */}
                <Select
                  id={projectLocationId}
                  value={projectFileLocation}
                  disabled={!autoSaveProjectFile}
                  onChange={(e) => onProjectFileLocationChange(e.target.value as ProjectFileLocation)}
                >
                  <option value="app">{t('In ClipPress')}</option>
                  <option value="recording">{t('Next to the recording')}</option>
                  <option value="exportFolder" disabled={customOutDir == null}>{customOutDir == null ? t('In the export folder (choose one under Export)') : t('In the export folder')}</option>
                </Select>
                {projectFileLocation === 'app' && (
                  <Button onClick={showProjectsFolder}>
                    <FiFolder aria-hidden />
                    {t('Show folder')}
                  </Button>
                )}
              </div>
            </SettingRow>
          </>
        );
      }

      case 'updates': {
        return <UpdateSettings />;
      }

      case 'advanced': {
        return (
          <>
            {!isMasBuild && (
              <SettingRow
                label={t('Custom FFmpeg')}
                value={customFfPath ?? t('Using the FFmpeg that comes with ClipPress.')}
                details={t('This allows you to specify custom FFmpeg and FFprobe binaries to use. Make sure the "ffmpeg" and "ffprobe" executables exist in the same directory, and then select the directory.')}
              >
                <div className={styles['controlGroup']}>
                  <Button onClick={changeCustomFfPath}>{t('Choose…')}</Button>
                  {customFfPath && (
                    <Button variant="ghost" onClick={clearCustomFfPath} title={t('Use the built-in FFmpeg')} aria-label={t('Use the built-in FFmpeg')}>
                      <FiX aria-hidden />
                    </Button>
                  )}
                </div>
              </SettingRow>
            )}

            <SettingRow
              label={t('HEVC hardware decoding')}
              description={t('Turn off if H.265 recordings show problems.')}
            >
              <Switch checked={enableNativeHevc} onCheckedChange={setEnableNativeHevc} aria-label={t('HEVC hardware decoding')} />
            </SettingRow>

            <SettingRow
              label={t('FFmpeg hardware acceleration')}
              description={t('-hwaccel auto, for detection and assisted playback.')}
            >
              <Switch checked={ffmpegHwaccel === 'auto'} onCheckedChange={(v) => setFfmpegHwaccel(v ? 'auto' : 'none')} aria-label={t('FFmpeg hardware acceleration')} />
            </SettingRow>

            <SettingRow
              label={t('Allow several windows')}
              description={t('Run more than one ClipPress at a time (experimental).')}
            >
              <Switch checked={allowMultipleInstances} onCheckedChange={setAllowMultipleInstances} aria-label={t('Allow several windows')} />
            </SettingRow>
          </>
        );
      }

      default: {
        return null;
      }
    }
  }

  return (
    <div className={styles['layout']}>
      <nav className={styles['nav']} aria-label={t('Settings categories')}>
        <div className={styles['navList']} role="tablist" aria-orientation="vertical" onKeyDown={onTabListKeyDown}>
          {categories.map((c) => (
            <button
              key={c.id}
              id={getTabId(c.id)}
              type="button"
              role="tab"
              aria-selected={c.id === activeCategory}
              aria-controls={c.id === activeCategory ? panelId : undefined}
              tabIndex={c.id === activeCategory ? 0 : -1}
              className={[styles['navItem'], ...(c.id === activeCategory ? [styles['navItemActive']] : [])].join(' ')}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className={styles['advancedToggle']}>
          <Switch id={advancedToggleId} checked={showAdvancedSettings} onCheckedChange={setShowAdvancedSettings} />
          <label htmlFor={advancedToggleId}>{t('Show advanced options')}</label>
        </div>
      </nav>

      {/* Keyed by tab, so each one opens scrolled to the top. */}
      <div key={activeCategory} id={panelId} className={`consistent-scrollbar ${styles['content']}`} role="tabpanel" aria-labelledby={getTabId(activeCategory)}>
        <h2 className={styles['contentTitle']}>{activeLabel}</h2>
        {renderCategory()}
      </div>
    </div>
  );
}

export default memo(Settings);
