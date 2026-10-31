export interface SegmentCrop {
  x: number,
  y: number,
  width: number,
  height: number,
}

export type CropCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/** Up to 1600%: enough for one camera at the top of a video-call recording (6.1; it was 400%). */
export const minCropSize = 1 / 16;
const maxCropZoom = 1 / minCropSize;
export const fullFrameCrop: SegmentCrop = { x: 0, y: 0, width: 1, height: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Equal normalized sides preserve the source aspect ratio. */
export function clampSegmentCrop(crop: SegmentCrop): SegmentCrop {
  const size = clamp(crop.width, minCropSize, 1);
  return { x: clamp(crop.x, 0, 1 - size), y: clamp(crop.y, 0, 1 - size), width: size, height: size };
}

export function getSegmentCrop(segment: { crop?: SegmentCrop | undefined }) {
  return segment.crop != null ? clampSegmentCrop(segment.crop) : fullFrameCrop;
}

export function isSameSegmentCrop(a: SegmentCrop, b: SegmentCrop) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function hasSegmentCrop(segment: { crop?: SegmentCrop | undefined }) {
  return getSegmentCrop(segment).width < 1;
}

export function moveSegmentCrop(crop: SegmentCrop, deltaX: number, deltaY: number) {
  return clampSegmentCrop({ ...crop, x: crop.x + deltaX, y: crop.y + deltaY });
}

export function zoomSegmentCrop(crop: SegmentCrop, zoom: number) {
  const size = 1 / clamp(zoom, 1, 1 / minCropSize);
  return clampSegmentCrop({ x: crop.x + (crop.width - size) / 2, y: crop.y + (crop.height - size) / 2, width: size, height: size });
}

/** The zoom − / + buttons step through round numbers, a little further each time. */
const cropZoomStops = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, maxCropZoom];

export function stepCropZoom(zoom: number, direction: 1 | -1) {
  if (direction > 0) return cropZoomStops.find((stop) => stop > zoom + 0.001) ?? maxCropZoom;
  return cropZoomStops.findLast((stop) => stop < zoom - 0.001) ?? 1;
}

/** The zoom slider is logarithmic, so 100–400% keeps half of it however far it goes. */
export const cropZoomSliderSteps = 1000;
export const cropZoomToSlider = (zoom: number) => Math.round((Math.log(clamp(zoom, 1, maxCropZoom)) / Math.log(maxCropZoom)) * cropZoomSliderSteps);
export const sliderToCropZoom = (value: number) => maxCropZoom ** (clamp(value, 0, cropZoomSliderSteps) / cropZoomSliderSteps);

export function resizeSegmentCrop(crop: SegmentCrop, corner: CropCorner, deltaX: number, deltaY: number) {
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  const anchorX = right ? crop.x : crop.x + crop.width;
  const anchorY = bottom ? crop.y : crop.y + crop.height;
  const maxSize = Math.min(right ? 1 - anchorX : anchorX, bottom ? 1 - anchorY : anchorY);
  const size = clamp(crop.width + ((right ? deltaX : -deltaX) + (bottom ? deltaY : -deltaY)) / 2, minCropSize, maxSize);
  return { x: right ? anchorX : anchorX - size, y: bottom ? anchorY : anchorY - size, width: size, height: size };
}

/** Preview and FFmpeg share even pixel boundaries required by H.264's chroma grid. */
export function getSegmentCropPixels(crop: SegmentCrop, videoWidth: number, videoHeight: number) {
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const frameWidth = even(videoWidth);
  const frameHeight = even(videoHeight);
  const width = even(frameWidth * crop.width);
  const height = even(frameHeight * crop.height);
  const x = Math.min(frameWidth - width, Math.max(0, Math.round((frameWidth * crop.x) / 2) * 2));
  const y = Math.min(frameHeight - height, Math.max(0, Math.round((frameHeight * crop.y) / 2) * 2));
  return { x, y, width, height, frameWidth, frameHeight };
}

export function getSegmentCropFilter(segment: { crop?: SegmentCrop | undefined }, videoWidth: number, videoHeight: number) {
  if (!hasSegmentCrop(segment)) return undefined;
  const { x, y, width, height, frameWidth, frameHeight } = getSegmentCropPixels(getSegmentCrop(segment), videoWidth, videoHeight);
  return `crop=${width}:${height}:${x}:${y},scale=${frameWidth}:${frameHeight},setsar=1`;
}
