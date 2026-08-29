import zxing from '@zxing/library';
const {
  MultiFormatReader,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  BarcodeFormat,
} = zxing;
import { pixelBoxToPercent } from './imagePixels.js';

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

function makeReader(tryHarder) {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, tryHarder);
  const instance = new MultiFormatReader();
  instance.setHints(hints);
  return instance;
}

const quickReader = makeReader(false);
const hardReader = makeReader(true);

function toBitmap(data, width, height) {
  const luminances = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luminances[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)));
}

function decodeOnce(data, width, height, useHard = false) {
  try {
    return (useHard ? hardReader : quickReader).decode(toBitmap(data, width, height));
  } catch {
    return null;
  }
}

function resultToFinding(result, width, height) {
  if (!result) return null;
  const points = result.getResultPoints?.() || [];
  const xs = points.map((p) => p.getX());
  const ys = points.map((p) => p.getY());
  if (!xs.length) return null;
  const pad = 8;
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad);
  const box = {
    x,
    y,
    width: Math.min(width - x, Math.max(...xs) - Math.min(...xs) + pad * 2),
    height: Math.min(height - y, Math.max(...ys) - Math.min(...ys) + pad * 2),
  };
  const format = String(result.getBarcodeFormat?.() || '');
  const isQr = /QR/i.test(format);
  return {
    type: isQr ? 'qr_code' : 'barcode',
    label: isQr ? 'QR code' : `Barcode (${format || '1D'})`,
    payload: String(result.getText?.() || '').slice(0, 120),
    box: pixelBoxToPercent(box, width, height),
    confidence: 0.93,
    evidence: `Dedicated barcode detector decoded format ${format || 'unknown'}.`,
  };
}

export function detectBarcodes(pixels, { tiles = false } = {}) {
  const { data, width, height } = pixels;
  const findings = [];
  const full = resultToFinding(decodeOnce(data, width, height, false), width, height);
  if (full) findings.push(full);
  if (!tiles) return dedupe(findings);

  const cols = 2;
  const rows = 2;
  const tileW = Math.floor(width / cols);
  const tileH = Math.floor(height / rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * tileW;
      const y = row * tileH;
      const w = col === cols - 1 ? width - x : tileW;
      const h = row === rows - 1 ? height - y : tileH;
      const slice = new Uint8ClampedArray(w * h * 4);
      for (let line = 0; line < h; line += 1) {
        const src = ((y + line) * width + x) * 4;
        slice.set(data.subarray(src, src + w * 4), line * w * 4);
      }
      const hit = resultToFinding(decodeOnce(slice, w, h, false), w, h);
      if (!hit) continue;
      findings.push({
        ...hit,
        box: {
          x: hit.box.x * (w / width) + (x / width) * 100,
          y: hit.box.y * (h / height) + (y / height) * 100,
          width: hit.box.width * (w / width),
          height: hit.box.height * (h / height),
        },
      });
    }
  }

  return dedupe(findings);
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

function dedupe(items) {
  const kept = [];
  for (const item of items) {
    if (kept.some((k) => k.type === item.type && iou(k.box, item.box) > 0.45)) continue;
    kept.push(item);
  }
  return kept;
}

export function barcodeStillDecodable(pixels) {
  return detectBarcodes(pixels, { tiles: false }).some((item) => item.type === 'barcode');
}
