/**
 * The ClipPress glyph: a play shape held between two trim brackets, for "clip" (the brackets
 * mark a clip's start and end, as on the timeline) and "press" (they close in on it).
 *
 * The same geometry as the application icon (`src/renderer/src/icon.svg`), minus the tile
 * background, drawn in `currentColor` so it takes the colour of whatever chrome it sits in.
 * Kept as a component rather than an imported SVG so it can inherit theming.
 */
export default function ClipPressMark({ size = '1em' }: { size?: string | number }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
        <path d="M190 124 H138 V388 H190" />
        <path d="M322 124 H374 V388 H322" />
      </g>
      <path d="M222 196 L306 256 L222 316 Z" fill="currentColor" stroke="currentColor" strokeWidth="26" strokeLinejoin="round" />
    </svg>
  );
}
