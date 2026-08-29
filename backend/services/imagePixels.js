import sharp from 'sharp';

/** Decode an upload to RGBA after EXIF orientation, optionally downscaled. */
export async function decodeRgba(buffer, maxEdge = 2400) {
  const oriented = sharp(buffer).rotate();
  const meta = await oriented.metadata();
  const originalWidth = meta.width || 1;
  const originalHeight = meta.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  const { data, info } = await oriented
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    originalWidth,
    originalHeight,
  };
}

export function pixelBoxToPercent(box, width, height) {
  return {
    x: (box.x / width) * 100,
    y: (box.y / height) * 100,
    width: (box.width / width) * 100,
    height: (box.height / height) * 100,
  };
}

export function clampPixelBox(box, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y)));
  const w = Math.max(4, Math.min(width - x, Math.round(box.width)));
  const h = Math.max(4, Math.min(height - y, Math.round(box.height)));
  return { x, y, width: w, height: h };
}
