import type { ChangeEventHandler, KeyboardEvent } from 'react';
import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDebounce } from 'use-debounce';
import { useTranslation } from 'react-i18next';
import { IoIosHelpCircle } from 'react-icons/io';
import { motion, AnimatePresence } from 'motion/react';
import { FaCaretUp, FaEdit, FaExclamationTriangle, FaEye, FaFile, FaUndo } from 'react-icons/fa';

import HighlightedText from './HighlightedText';
import type { GenerateOutFileNames, GeneratedOutFileNames } from '../util/outputNameTemplate';
import { segNumVariable, segSuffixVariable, extVariable, segTagsVariable, segNumIntVariable, selectedSegNumVariable, selectedSegNumIntVariable } from '../util/outputNameTemplate';
import useUserSettings from '../hooks/useUserSettings';
import Switch from './Switch';
import Select from './Select';
import TextInput from './TextInput';
import Button from './Button';
import * as Dialog from './Dialog';
import { dangerColor, warningColor } from '../colors';
import { exportedFileNameTemplateHelpUrl } from '../../../common/constants';

const electron = window.require('electron');
const { parse: parsePath } = window.require('path');


const formatVariable = (variable: string) => `\${${variable}}`;

const extVariableFormatted = formatVariable(extVariable);
const segTagsExample = `${segTagsVariable}.XX`;

function FileNameTemplateEditor(opts: {
  template: string,
  setTemplate: (text: string) => void,
  defaultTemplate: string,
  generateFileNames: GenerateOutFileNames,
  ignoreMissingExtensionWarning?: boolean,
  onReset?: (() => void) | undefined,
  resetLabel?: string | undefined,
} & ({
  currentSegIndexSafe: number,
  mode: 'separate'
} | {
  mode: 'merge-segments' | 'merge-files'
})) {
  const { template: templateIn, setTemplate, defaultTemplate, generateFileNames, mode, onReset, resetLabel } = opts;
  const { currentSegIndexSafe } = 'currentSegIndexSafe' in opts ? opts : { currentSegIndexSafe: undefined };

  const { safeOutputFileName, toggleSafeOutputFileName, outputFileNameMinZeroPadding, setOutputFileNameMinZeroPadding, simpleMode } = useUserSettings();

  const [text, setText] = useState(templateIn);
  const [simpleDraft, setSimpleDraft] = useState('');
  const [debouncedText] = useDebounce(text, 500);
  const [generated, setGenerated] = useState<GeneratedOutFileNames>();

  const haveImportantMessage = generated != null && (generated.problems.error != null || generated.problems.sameAsInputFileNameWarning);
  const [open, setOpen] = useState(haveImportantMessage || simpleMode);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // if an important message appears, make sure we don't auto-close after it's resolved
    // https://github.com/mifi/lossless-cut/issues/2567
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (haveImportantMessage) setOpen(true);
  }, [haveImportantMessage]);

  useEffect(() => {
    if (simpleMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(templateIn);
  }, [simpleMode, templateIn]);

  const inputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslation();

  const hasTextNumericPaddedValue = useMemo(() => [segNumVariable, selectedSegNumVariable, segSuffixVariable].some((v) => debouncedText.includes(formatVariable(v))), [debouncedText]);

  useEffect(() => {
    if (debouncedText == null) {
      return undefined;
    }

    const abortController = new AbortController();

    (async () => {
      try {
        // console.time('generateFileNames')
        const newGenerated = await generateFileNames(debouncedText);
        // console.timeEnd('generateCutFileNames')
        if (abortController.signal.aborted) return;
        setGenerated(newGenerated);
      } catch (err) {
        console.error(err); // shouldn't really happen
      }
    })();

    return () => abortController.abort();
  }, [debouncedText, generateFileNames, t]);

  const availableVariables = useMemo(() => {
    const common = ['FILENAME', extVariable, 'EPOCH_MS', 'SEG_LABEL', 'EXPORT_COUNT'];
    if (mode === 'merge-segments') {
      return [...common, 'FILE_EXPORT_COUNT'];
    }
    if (mode === 'separate') {
      return [
        ...common,
        'CUT_FROM',
        ...(!simpleMode ? ['CUT_FROM_NUM'] : []),
        'CUT_TO',
        ...(!simpleMode ? ['CUT_TO_NUM'] : []),
        'CUT_DURATION',
        segNumVariable,
        ...(!simpleMode ? [segNumIntVariable] : []),
        selectedSegNumVariable,
        ...(!simpleMode ? [selectedSegNumIntVariable] : []),
        segSuffixVariable, segTagsExample,
      ];
    }
    // merge-files
    return common;
  }, [mode, simpleMode]);

  const isMissingExtension = !debouncedText.endsWith(extVariableFormatted);

  useEffect(() => {
    if (simpleMode) return;
    setTemplate(debouncedText);
  }, [debouncedText, setTemplate, simpleMode]);

  useEffect(() => {
    if (simpleMode) return;
    if (open) inputRef.current?.focus();
  }, [open, simpleMode]);

  const reset = useCallback(() => {
    if (onReset != null) {
      onReset();
      return;
    }
    setTemplate(defaultTemplate);
    setText(defaultTemplate);
  }, [defaultTemplate, onReset, setTemplate]);

  const handleSampleClick = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const onTextChange = useCallback<ChangeEventHandler<HTMLInputElement>>((e) => setText(e.target.value), []);

  const onVariableClick = useCallback((variable: string) => {
    const input = inputRef.current;
    const startPos = input!.selectionStart;
    const endPos = input!.selectionEnd;
    if (startPos == null || endPos == null) return;

    const toInsert = variable === segTagsExample ? `${segTagsExample} ?? ''` : variable;

    const newValue = `${text.slice(0, startPos)}${`${formatVariable(toInsert)}${text.slice(endPos)}`}`;
    setText(newValue);
  }, [text]);

  // In simple mode for merge-files, we auto generate file name, so there will be no ${EXT} variable
  const shouldIgnoreMissingExtension = useMemo(() => simpleMode && mode === 'merge-files', [simpleMode, mode]);
  const shouldShowAdvancedTemplateControls = !simpleMode;

  const currentSeparateSegIndex = mode === 'separate' ? currentSegIndexSafe : undefined;

  const formatCurrentSegFileOrFirst = useCallback((names: string[]) => {
    if (mode === 'separate' && currentSeparateSegIndex != null) {
      const fileName = names[currentSeparateSegIndex];
      if (fileName != null) {
        return fileName;
      }
    }

    return names[0];
  }, [currentSeparateSegIndex, mode]);

  const previewFileName = useMemo(
    () => (generated != null ? formatCurrentSegFileOrFirst(generated.fileNames) ?? '' : ''),
    [formatCurrentSegFileOrFirst, generated],
  );

  useEffect(() => {
    if (!simpleMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSimpleDraft(previewFileName);
  }, [previewFileName, simpleMode]);

  const commitSimpleRename = useCallback(() => {
    if (!simpleMode) return;

    const trimmed = simpleDraft.trim();
    const fallbackName = previewFileName;
    const effectiveName = trimmed === '' ? fallbackName : trimmed;
    const { ext: previewExt } = parsePath(fallbackName);
    let baseName = effectiveName;

    if (previewExt !== '' && effectiveName.toLowerCase().endsWith(previewExt.toLowerCase())) {
      baseName = effectiveName.slice(0, -previewExt.length);
    }

    const suffixTemplate = mode === 'separate' && generated != null && generated.fileNames.length > 1
      ? formatVariable(segSuffixVariable)
      : '';

    const nextTemplate = `${baseName}${suffixTemplate}${formatVariable(extVariable)}`;
    setSimpleDraft(effectiveName);
    setTemplate(nextTemplate);
  }, [generated, mode, previewFileName, setTemplate, simpleDraft, simpleMode]);

  const resetSimpleRename = useCallback(() => {
    onReset?.();
  }, [onReset]);

  const onSimpleInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSimpleRename();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSimpleDraft(previewFileName);
      event.currentTarget.blur();
    }
  }, [commitSimpleRename, previewFileName]);

  if (simpleMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', width: '100%', minWidth: 0 }}>
        <div style={{ color: 'var(--gray-10)', fontSize: '.76rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {(mode === 'merge-files' || mode === 'merge-segments') ? t('Merged filename') : t('Filename')}
        </div>

        <TextInput
          ref={inputRef}
          value={simpleDraft}
          onChange={(event) => setSimpleDraft(event.target.value)}
          onBlur={commitSimpleRename}
          onKeyDown={onSimpleInputKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          style={{
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '.95rem 1rem',
            fontSize: '1.02rem',
            fontWeight: 600,
            borderRadius: '1rem',
            background: 'color-mix(in srgb, var(--gray-1) 88%, transparent)',
            border: '1px solid color-mix(in srgb, var(--gray-8) 32%, transparent)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
          }}
        />

        {onReset != null && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={resetSimpleRename} style={{ padding: '.35rem .7rem' }}>
              {resetLabel ?? t('Reset')}
            </Button>
          </div>
        )}

        {generated?.problems.error != null ? (
          <div style={{ marginBottom: '.2rem' }}>
            <FaExclamationTriangle color={dangerColor} style={{ verticalAlign: 'middle', marginRight: '.3rem' }} />
            {generated.problems.error}
          </div>
        ) : (
          <>
            {generated?.problems.sameAsInputFileNameWarning && (
              <div style={{ marginBottom: '.2rem' }}>
                <FaExclamationTriangle style={{ verticalAlign: 'middle', marginRight: '.3rem' }} color={warningColor} />
                {t('Output file name is the same as the source file name. This increases the risk of accidentally overwriting or deleting source files!')}
              </div>
            )}

            {!shouldIgnoreMissingExtension && isMissingExtension && (
              <div style={{ marginBottom: '.2rem' }}>
                <FaExclamationTriangle style={{ verticalAlign: 'middle', marginRight: '.3rem' }} color={warningColor} />
                {t('The file name template is missing {{ext}} and will result in a file without the suggested extension. This may result in an unplayable output file.', { ext: extVariableFormatted })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {generated != null && (
        <div style={{ color: 'var(--gray-10)', fontSize: '.76rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '.45rem' }}>{
          (mode === 'merge-files' || mode === 'merge-segments')
            ? t('Merged filename')
            : t('Filename')
          }
        </div>
      )}

      <div>
        {generated != null && (
          <div style={{ marginBottom: '.35rem' }}>
            <HighlightedText
              title={open ? t('Close') : t('Edit')}
              role="button"
              onClick={handleSampleClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '.75rem',
                padding: '.85rem .95rem',
                borderRadius: '1rem',
                border: '1px solid color-mix(in srgb, var(--gray-8) 30%, transparent)',
                background: 'color-mix(in srgb, var(--gray-1) 86%, transparent)',
                wordBreak: 'break-word',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {generated.problems.error != null && <FaExclamationTriangle style={{ color: dangerColor, marginRight: '.2em', verticalAlign: 'middle' }} />}
                {generated.originalFileNames != null && formatCurrentSegFileOrFirst(generated.fileNames)}
                <span style={generated.originalFileNames != null ? { textDecoration: 'line-through', marginLeft: '.3em', color: dangerColor } : undefined}>
                  {formatCurrentSegFileOrFirst(generated.originalFileNames ?? generated.fileNames)}
                </span>
              </span>
              {open ? (
                <FaCaretUp style={{ fontSize: '.9em', marginLeft: '.4em', verticalAlign: 'middle' }} />
              ) : (
                <FaEdit style={{ fontSize: '.9em', marginLeft: '.4em', verticalAlign: 'middle' }} />
              )}
            </HighlightedText>
          </div>
        )}

        <AnimatePresence>
          {open && (
            <motion.div
              key="1"
              style={{ border: '1px solid color-mix(in srgb, var(--gray-8) 30%, transparent)', padding: '.9rem', borderRadius: '1rem', background: 'color-mix(in srgb, var(--gray-2) 82%, transparent)' }}
              initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: '.7em', marginBottom: '1em' }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
            >
              <div style={{ color: 'var(--gray-10)', fontSize: '.76rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '.45rem' }}>
                {simpleMode ? t('Edit filename') : t('Output file name template')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', marginBottom: '.35rem', gap: '.55rem' }}>
                <TextInput ref={inputRef} onChange={onTextChange} value={text} autoComplete="off" autoCapitalize="off" autoCorrect="off" style={{ width: '100%', padding: '.72rem .8rem', fontSize: '.96rem', borderRadius: '.9rem' }} />

                {generated != null && generated.fileNames.length > 1 && (
                  <Dialog.Root>
                    <Dialog.Trigger asChild>
                      <Button style={{ padding: '.5rem .7rem' }} title={t('Preview')}><FaEye /></Button>
                    </Dialog.Trigger>

                    <Dialog.Portal>
                      <Dialog.Overlay />
                      <Dialog.Content aria-describedby={undefined}>
                        <Dialog.Title>{t('Resulting segment file names', { count: generated.fileNames.length })}</Dialog.Title>

                        <div style={{ overflowY: 'auto', maxHeight: 400 }}>
                          {generated.fileNames.map((f) => <div key={f} style={{ marginBottom: '.5em' }}><FaFile style={{ verticalAlign: 'middle', marginRight: '.5em' }} />{f}</div>)}
                        </div>

                        <Dialog.CloseButton />
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                )}

                <Button onClick={reset} style={{ padding: '.5rem .8rem' }}><FaUndo style={{ fontSize: '.8em', color: dangerColor, marginRight: '.45em' }} />{resetLabel ?? t('Reset')}</Button>
              </div>

              {shouldShowAdvancedTemplateControls && (
                <div style={{ fontSize: '.9em', color: 'var(--gray-11)', display: 'flex', gap: '.3em', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7em' }}>
                  {`${t('Variables')}:`}

                  <IoIosHelpCircle fontSize="1.3em" color="var(--gray-12)" role="button" cursor="pointer" onClick={() => electron.shell.openExternal(exportedFileNameTemplateHelpUrl)} />
                  {availableVariables.map((variable) => (
                    <span key={variable} role="button" style={{ cursor: 'copy', marginRight: '.2em', textDecoration: 'underline', textDecorationStyle: 'dashed', fontSize: '.9em' }} onClick={() => onVariableClick(variable)}>{variable}</span>
                  ))}
                </div>
              )}

              {shouldShowAdvancedTemplateControls && hasTextNumericPaddedValue && (
                <div style={{ marginBottom: '.3em' }}>
                  <Select value={outputFileNameMinZeroPadding} onChange={(e) => setOutputFileNameMinZeroPadding(parseInt(e.target.value, 10))} style={{ marginRight: '.5em', fontSize: '1em' }}>
                    {Array.from({ length: 10 }).map((_v, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                  {t('Minimum numeric padded length')}
                </div>
              )}

              {shouldShowAdvancedTemplateControls && (
                <div title={t('Whether or not to sanitize output file names (sanitizing removes special characters)')} style={{ marginBottom: '.3em' }}>
                  <Switch checked={safeOutputFileName} onCheckedChange={toggleSafeOutputFileName} style={{ verticalAlign: 'middle', marginRight: '.5em' }} />
                  <span>{t('Sanitize file names')}</span>

                  {!safeOutputFileName && <FaExclamationTriangle color={warningColor} style={{ marginLeft: '.5em', verticalAlign: 'middle' }} />}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {generated?.problems.error != null ? (
          <div style={{ marginBottom: '1em' }}>
            <FaExclamationTriangle color={dangerColor} style={{ verticalAlign: 'middle', marginRight: '.3em' }} />{generated.problems.error}
          </div>
        ) : (
          generated != null && (
            <>
              {generated.problems.sameAsInputFileNameWarning && (
                <div style={{ marginBottom: '1em' }}>
                  <FaExclamationTriangle style={{ verticalAlign: 'middle', marginRight: '.3em' }} color={warningColor} />
                  {t('Output file name is the same as the source file name. This increases the risk of accidentally overwriting or deleting source files!')}
                </div>
              )}

              {!shouldIgnoreMissingExtension && isMissingExtension && (
                <div style={{ marginBottom: '1em' }}>
                  <FaExclamationTriangle style={{ verticalAlign: 'middle', marginRight: '.3em' }} color={warningColor} />
                  {t('The file name template is missing {{ext}} and will result in a file without the suggested extension. This may result in an unplayable output file.', { ext: extVariableFormatted })}
                </div>
              )}
            </>
          )
        )}
      </div>
    </>
  );
}

export default memo(FileNameTemplateEditor);
