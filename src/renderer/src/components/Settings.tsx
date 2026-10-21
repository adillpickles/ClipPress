import type { ChangeEventHandler } from 'react';
import { memo, useCallback, useId, useMemo, useState } from 'react';
import { FiFolder, FiX } from 'react-icons/fi';
import { FaRegKeyboard } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';

import CaptureFormatButton from './CaptureFormatButton';
import AutoExportToggler from './AutoExportToggler';
import Switch from './Switch';
import UpdateSettings from './UpdateSettings';
import useUserSettings from '../hooks/useUserSettings';
import { askForFfPath } from '../dialogs';
import { getEnableImportChaptersOptions, isMasBuild, isStoreBuild } from '../util';
import type { SupportedLanguage } from '../../../common/i18n';
import { langNames } from '../../../common/i18n';
import type { Config, EnableImportChapters, ModifierKey, TimecodeFormat } from '../../../common/types.js';
import styles from './Settings.module.css';
import Select from './Select';
import Button from './Button';
import { getModifierKeyNames } from '../hooks/useTimelineScroll';
import type { TunerType } from '../types';
import OutDirSelector from './OutDirSelector.js';
import SettingRow from './SettingRow';

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
  toggleStoreProjectInWorkingDir,
  showAdvancedSettings,
  setShowAdvancedSettings,
}: {
  onTunerRequested: (type: TunerType) => void,
  onKeyboardShortcutsDialogRequested: () => void,
  askForCleanupChoices: () => Promise<unknown>,
  toggleStoreProjectInWorkingDir: () => Promise<void>,
  showAdvancedSettings: boolean,
  setShowAdvancedSettings: (v: boolean) => void,
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category>('general');

  const { customOutDir, keyframeCut, toggleKeyframeCut, timecodeFormat, setTimecodeFormat, invertCutSegments, setInvertCutSegments, askBeforeClose, setAskBeforeClose, enableImportChapters, setEnableImportChapters, enableAskForFileOpenAction, setEnableAskForFileOpenAction, autoSaveProjectFile, setAutoSaveProjectFile, invertTimelineScroll, setInvertTimelineScroll, language, setLanguage, hideNotifications, setHideNotifications, hideOsNotifications, setHideOsNotifications, autoLoadTimecode, setAutoLoadTimecode, enableAutoHtml5ify, setEnableAutoHtml5ify, customFfPath, setCustomFfPath, storeProjectInWorkingDir, mouseWheelZoomModifierKey, setMouseWheelZoomModifierKey, mouseWheelFrameSeekModifierKey, setMouseWheelFrameSeekModifierKey, mouseWheelKeyframeSeekModifierKey, setMouseWheelKeyframeSeekModifierKey, segmentMouseModifierKey, setSegmentMouseModifierKey, captureFrameMethod, setCaptureFrameMethod, captureFrameQuality, setCaptureFrameQuality, captureFrameFileNameFormat, setCaptureFrameFileNameFormat, enableNativeHevc, setEnableNativeHevc, allowMultipleInstances, setAllowMultipleInstances, preferStrongColors, setPreferStrongColors, treatInputFileModifiedTimeAsStart, setTreatInputFileModifiedTimeAsStart, treatOutputFileModifiedTimeAsStart, setTreatOutputFileModifiedTimeAsStart, exportConfirmEnabled, toggleExportConfirmEnabled, storeWindowBounds, setStoreWindowBounds, reducedMotion, setReducedMotion, ffmpegHwaccel, setFfmpegHwaccel, exportGpuAcceleration, setExportGpuAcceleration } = useUserSettings();

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
  const advancedToggleId = useId();

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

            <SettingRow label={t('Time format')} description={t('How times are shown in advanced mode.')} controlId={timecodeId}>
              <Select id={timecodeId} value={timecodeFormat} onChange={(e) => setTimecodeFormat(e.target.value as TimecodeFormat)}>
                {Object.entries(timecodeFormatOptions).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </Select>
            </SettingRow>

            {showAdvancedSettings && (
              <SettingRow label={t('Waveform height')}>
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
              description={invertCutSegments ? t('Removed: the export keeps everything except the clips.') : t('Kept: the export contains only the clips.')}
              details={t('"Keep" is the usual way to make clips. "Remove" cuts the marked parts out of the recording instead, for example to drop a pause or a loading screen.')}
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
              details={t('Decodes video on the graphics card (NVIDIA, AMD or Intel) and re-encodes regular exports with its H.264 encoder. ClipPress switches to the CPU automatically if the GPU fails. Size-limited exports pick their encoder from the preset.')}
            >
              <Switch checked={exportGpuAcceleration} onCheckedChange={setExportGpuAcceleration} aria-label={t('Use the GPU')} />
            </SettingRow>

            <SettingRow
              label={t('Save exports to')}
              description={customOutDir ?? t('The same folder as the recording.')}
            >
              <OutDirSelector>
                <Button>
                  <FiFolder aria-hidden />
                  {t('Change…')}
                </Button>
              </OutDirSelector>
            </SettingRow>

            <SettingRow
              label={t('After exporting')}
              description={t('Close the recording, or move files to the trash.')}
            >
              <Button onClick={askForCleanupChoices}>{t('Change…')}</Button>
            </SettingRow>

            {showAdvancedSettings && (
              <SettingRow
                label={t('Keyframe cut')}
                description={keyframeCut ? t('Cut at the keyframe before the start (lossless exports).') : t('Cut at the exact time (lossless exports).')}
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
                  <option value="true">{t('Source file\'s time plus segment start cut time')}</option>
                  <option value="false">{t('Source file\'s time minus segment end cut time')}</option>
                </Select>
              </SettingRow>
            )}

            {showAdvancedSettings && (
              <SettingRow label={t('Treat source file modification date/time as:')} controlId={sourceDateId}>
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
            <SettingRow label={t('Image format')} description={t('For frames captured from the video.')}>
              <CaptureFormatButton showIcon />
            </SettingRow>

            <SettingRow label={t('Image quality')} description={`${Math.round(captureFrameQuality * 100)}%`}>
              <input
                type="range"
                className={styles['range']}
                aria-label={t('Image quality')}
                min={1}
                max={1000}
                value={Math.round(captureFrameQuality * 1000)}
                onChange={(e) => setCaptureFrameQuality(Math.max(Math.min(1, parseInt(e.target.value, 10) / 1000), 0))}
              />
            </SettingRow>

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
            <ModifierKeySetting label={t('Jump keyframes with the wheel')} value={mouseWheelKeyframeSeekModifierKey} setValue={setMouseWheelKeyframeSeekModifierKey} />

            <SettingRow label={t('Reverse wheel direction')} description={t('On the timeline.')}>
              <Switch checked={invertTimelineScroll ?? false} onCheckedChange={setInvertTimelineScroll} aria-label={t('Reverse wheel direction')} />
            </SettingRow>

            <SettingRow label={t('Wheel and trackpad sensitivity')}>
              <Button onClick={() => onTunerRequested('wheelSensitivity')}>{t('Adjust')}</Button>
            </SettingRow>

            <SettingRow label={t('Arrow key seek step')} description={t('How far the arrow keys move.')}>
              <Button onClick={() => onTunerRequested('keyboardNormalSeekSpeed')}>{t('Adjust')}</Button>
            </SettingRow>

            <SettingRow label={t('Longer seek step')}>
              <Button onClick={() => onTunerRequested('keyboardSeekSpeed2')}>{t('Adjust')}</Button>
            </SettingRow>

            <SettingRow label={t('Longest seek step')}>
              <Button onClick={() => onTunerRequested('keyboardSeekSpeed3')}>{t('Adjust')}</Button>
            </SettingRow>

            <SettingRow label={t('Seek acceleration')} description={t('How quickly holding a seek key speeds up.')}>
              <Button onClick={() => onTunerRequested('keyboardSeekAccFactor')}>{t('Adjust')}</Button>
            </SettingRow>
          </>
        );
      }

      case 'projects': {
        return (
          <>
            <SettingRow
              label={t('Save edits automatically')}
              description={t('Your clips, text and settings are kept in a project file (.llc).')}
              details={t('Opening the same recording again brings your edits back. The project file is named after the recording, with "-proj.llc" at the end.')}
            >
              <Switch checked={autoSaveProjectFile} onCheckedChange={setAutoSaveProjectFile} aria-label={t('Save edits automatically')} />
            </SettingRow>

            <SettingRow
              label={t('Project file location')}
              description={storeProjectInWorkingDir ? t('In the export folder.') : t('Next to the recording.')}
            >
              <Button disabled={!autoSaveProjectFile} onClick={toggleStoreProjectInWorkingDir}>
                {storeProjectInWorkingDir ? t('Store next to the recording') : t('Store in the export folder')}
              </Button>
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
                description={customFfPath ?? t('Using the FFmpeg that comes with ClipPress.')}
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
        <div className={styles['navList']} role="tablist" aria-orientation="vertical">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === activeCategory}
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

      <div className={`consistent-scrollbar ${styles['content']}`} role="tabpanel" aria-label={activeLabel}>
        <h2 className={styles['contentTitle']}>{activeLabel}</h2>
        {renderCategory()}
      </div>
    </div>
  );
}

export default memo(Settings);
