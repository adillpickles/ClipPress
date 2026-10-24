/**
 * Advanced mode (the classic editor) is unfinished, so it is opt-in: until the user turns it on in Settings, the app
 * always runs the new editor. The last picked mode stays saved, so turning it back on brings that mode back.
 */
export default function getEffectiveSimpleMode({ enableAdvancedMode, simpleMode }: { enableAdvancedMode: boolean, simpleMode: boolean }) {
  return !enableAdvancedMode || simpleMode;
}
