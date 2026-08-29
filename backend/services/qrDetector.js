import jsQR from 'jsqr';
import { pixelBoxToPercent } from './imagePixels.js';

function padBox(box, width, height, pad = 0.08) {
  const dx = box.width * pad;
  const dy = box.height * pad;
  return {
    x: Math.max(0, box.x - dx),
    y: Math.max(0, box.y - dy),
    width: Math.min(width - Math.max(0, box.x - dx), box.width + dx * 2),
    height: Math.min(height - Math.max(0, box.y - dy), box.height + dy * 2),
  };
}

function scanRegion(data, width, height, originX, originY, regionW, regionH) {
  const slice = new Uint8ClampedArray(regionW * regionH * 4);
  for (let y = 0; y < regionH; y += 1) {
    const src = ((originY + y) * width + originX) * 4;
    slice.set(data.subarray(src, src + regionW * 4), y * regionW * 4);
  }
  return jsQR(slice, regionW, regionH, { inversionAttempts: 'attemptBoth' });
}

/**
 * Dedicated QR detector. Scans the full frame plus overlapping tiles so small codes are not missed.
 */
export function detectQrCodes(pixels) {
  const { data, width, height } = pixels;
  const found = [];

  const add = (code, offsetX = 0, offsetY = 0) => {
    if (!code?.location) return;
    const xs = [code.location.topLeftCorner.x, code.location.topRightCorner.x, code.location.bottomLeftCorner.x, code.location.bottomRightCorner.x];
    const ys = [code.location.topLeftCorner.y, code.location.topRightCorner.y, code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y];
    const x = Math.min(...xs) + offsetX;
    const y = Math.min(...ys) + offsetY;
    const box = padBox(
      {
        x,
        y,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      width,
      height
    );
    found.push({
      type: 'qr_code',
      label: 'QR code',
      payload: String(code.data || '').slice(0, 120),
      box: pixelBoxToPercent(box, width, height),
      pixelBox: box,
      confidence: 0.96,
      evidence: 'Dedicated QR detector decoded a valid QR payload.',
    });
  };

  add(jsQR(data, width, height, { inversionAttempts: 'attemptBoth' }));

  const cols = 3;
  const rows = 3;
  const overlap = 0.25;
  const tileW = Math.floor(width / (cols - overlap * (cols - 1)));
  const tileH = Math.floor(height / (rows - overlap * (rows - 1)));
  const stepX = Math.floor(tileW * (1 - overlap));
  const stepY = Math.floor(tileH * (1 - overlap));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const originX = Math.min(width - tileW, col * stepX);
      const originY = Math.min(height - tileH, row * stepY);
      const code = scanRegion(data, width, height, originX, originY, tileW, tileH);
      add(code, originX, originY);
    }
  }

  return dedupeByOverlap(found);
}

function iou(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

function dedupeByOverlap(items) {
  const kept = [];
  for (const item of items) {
    if (kept.some((k) => iou(k.box, item.box) > 0.45)) continue;
    kept.push(item);
  }
  return kept;
}

export function qrStillDecodable(pixels) {
  return detectQrCodes(pixels).length > 0;
}
