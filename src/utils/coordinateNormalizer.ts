import { TextBlock } from '../types';

export interface NaturalImageDimensions {
  width: number;
  height: number;
}

export type NaturalBox = {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
};

export type DocumentBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Canonical coordinate conversion: Transforms a NaturalBox (0-1000 scale relative to natural image dimensions)
 * into absolute DocumentBox coordinates (pixels from top/left of the continuous document container).
 * Strictly coordinate conversion — knows nothing about scrolling or viewports.
 */
export function naturalBoxToDocumentBox(
  box: [number, number, number, number],
  pageOffsetTop: number,
  renderedImageWidth: number,
  renderedImageHeight: number
): DocumentBox {
  if (!Array.isArray(box) || box.length !== 4) {
    return { top: pageOffsetTop, left: 0, width: renderedImageWidth, height: 20 };
  }

  const [ymin, xmin, ymax, xmax] = box;
  
  // Convert 0-1000 scale to pixels relative to the rendered image dimensions
  const top = pageOffsetTop + (ymin / 1000) * renderedImageHeight;
  const left = (xmin / 1000) * renderedImageWidth;
  const width = Math.max(10, ((xmax - xmin) / 1000) * renderedImageWidth);
  const height = Math.max(10, ((ymax - ymin) / 1000) * renderedImageHeight);

  return { top, left, width, height };
}

/**
 * Normalizes a bounding box [ymin, xmin, ymax, xmax] from a composite batch or resized canvas
 * back to the original image's natural coordinate space (0-1000 scale).
 */
export function normalizeBoxToNaturalDimensions(
  box: [number, number, number, number],
  sliceYStart: number,
  sliceHeight: number,
  totalCompositeHeight: number,
  naturalImageDims: NaturalImageDimensions
): [number, number, number, number] {
  if (!Array.isArray(box) || box.length !== 4) {
    return [0, 0, 1000, 1000];
  }

  // Convert composite 0-1000 box[0] and box[2] to pixels on composite canvas
  const yMinPx = (box[0] / 1000) * totalCompositeHeight;
  const yMaxPx = (box[2] / 1000) * totalCompositeHeight;

  // Remap to local slice pixel coordinates
  const localYMinPx = Math.max(0, yMinPx - sliceYStart);
  const localYMaxPx = Math.min(sliceHeight, yMaxPx - sliceYStart);

  // Normalize to 0-1000 scale relative to slice height
  const normalizedYmin = Math.max(0, Math.min(1000, Math.round((localYMinPx / Math.max(1, sliceHeight)) * 1000)));
  const normalizedYmax = Math.max(0, Math.min(1000, Math.round((localYMaxPx / Math.max(1, sliceHeight)) * 1000)));

  // Horizontal coordinates are already scaled to target composite width (e.g. 768px),
  // which maintains exact proportional aspect ratio matching the natural image width.
  const xMin = Math.max(0, Math.min(1000, Math.round(box[1])));
  const xMax = Math.max(0, Math.min(1000, Math.round(box[3])));

  const output: [number, number, number, number] = [
    normalizedYmin,
    xMin,
    Math.max(normalizedYmin + 10, normalizedYmax),
    Math.max(xMin + 10, xMax),
  ];

  if (typeof window !== 'undefined' && (window as any).__DEV_COORD_LOGGING__ !== false) {
    console.log('[COORD DEBUG]', {
      inputBox: box,
      sliceYStart,
      sliceHeight,
      totalCompositeHeight,
      yMinPx,
      yMaxPx,
      localYMinPx,
      localYMaxPx,
      output,
    });
  }

  return output;
}

/**
 * Validates and clamps text box coordinates to ensure they are within valid 0-1000 percentage bounds
 * and do not cause overflow or visual distortion during CSS display.
 */
export function sanitizeTextBlockCoordinates(block: TextBlock): TextBlock {
  if (!block.box_2d || block.box_2d.length !== 4) {
    return block;
  }

  const [ymin, xmin, ymax, xmax] = block.box_2d;
  const clampedYmin = Math.max(0, Math.min(990, ymin));
  const clampedXmin = Math.max(0, Math.min(990, xmin));
  const clampedYmax = Math.max(clampedYmin + 10, Math.min(1000, ymax));
  const clampedXmax = Math.max(clampedXmin + 10, Math.min(1000, xmax));

  return {
    ...block,
    box_2d: [clampedYmin, clampedXmin, clampedYmax, clampedXmax],
  };
}
