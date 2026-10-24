import type { ColorInstance } from 'color';

export const saveColor = 'var(--green-11)';
export const dangerColor = 'var(--red-11)';
export const warningColor = 'var(--orange-9)';
export const primaryColor = 'var(--accent-9)';
export const primaryTextColor = 'var(--accent-11)';
/** Text and icons on a solid `primaryColor` background. */
export const primaryContrastColor = 'var(--accent-contrast)';
export const controlsBackground = 'var(--gray-2)';
export const timelineBackground = 'var(--gray-3)';
export const darkModeTransition = 'background-color .25s ease, border-color .25s ease, color .25s ease, box-shadow .25s ease';

/**
 * A clip's number badge (Clips panel and timeline): the clip's hue at one tone in both themes, so the same clip
 * looks the same everywhere, with dark digits on the light hues (green, yellow, lime) and white on the others.
 */
export function getSegBadgeStyle(segColor: ColorInstance) {
  const background = segColor.saturationl(Math.min(segColor.saturationl(), 70)).lightness(46);
  return { background: background.string(), color: background.isLight() ? 'rgb(0 0 0 / 80%)' : '#fff' };
}

/**
 * The clip's colour for CSS (`--clip-color`, and `--clip-on-color` for marks drawn on it): the selected clip is
 * outlined and tinted with its own colour rather than the accent. The badge's tone, so it reads in both themes.
 */
export function getSegColorVars(segColor: ColorInstance) {
  const { background, color } = getSegBadgeStyle(segColor);
  return { '--clip-color': background, '--clip-on-color': color };
}
