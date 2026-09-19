/**
 * The ClipPress glyph: a play shape held between two press bars.
 *
 * The same geometry as the application icon (`src/renderer/src/icon.svg`), minus the
 * tile background, drawn in `currentColor` so it takes the colour of whatever chrome it
 * sits in. Kept as a component rather than an imported SVG so it can inherit theming.
 */
export default function ClipPressMark({ size = '1em' }: { size?: string | number }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <rect x="146" y="112" width="220" height="34" rx="17" />
      <rect x="146" y="366" width="220" height="34" rx="17" />
      <path
        d="M202 200 L324 256 L202 312 Z"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinejoin="round"
      />
    </svg>
  );
}
