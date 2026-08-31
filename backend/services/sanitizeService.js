import sharp from 'sharp';
import { decodeRgba } from './imagePixels.js';
import { detectQrCodes } from './qrDetector.js';
import { detectBarcodes } from './barcodeDetector.js';
import { clampPercent } from '../validation/schema.js';
import { isIdentityOnlyType, normalizeFindingType } from '../lib/findingTypes.js';

const SENSITIVE_TYPES = new Set([
  'qr_code',
  'barcode',
  'email',
  'phone_number',
  'upi',
  'aadhaar',
  'transaction_id',
  'otp',
  'credentials',
  'api_key',
  'password',
  'private_chat',
  'id_card',
  'student_id',
  'passport',
  'license',
  'financial_card',
  'credit_card',
  'address',
  'dob',
  'screen',
  'institution_badge',
  'whiteboard',
  'sensitive_document',
  'id_document',
  'vehicle',
  'location_text',
  'upi_id',
  'other_sensitive',
  'logo',
  'calendar_information',
  'organization_identifier',
]);

function boxAreaFraction(box) {
  return ((box?.width || 0) * (box?.height || 0)) / 10000;
}

function maxAreaForType(type) {
  if (type === 'qr_code' || type === 'barcode') return 0.95;
  if (type === 'private_chat' || type === 'screen') return 0.88;
  if (
    type === 'id_card' ||
    type === 'student_id' ||
    type === 'passport' ||
    type === 'license' ||
    type === 'id_document' ||
    type === 'sensitive_document' ||
    type === 'whiteboard'
  ) {
    return 0.82;
  }
  if (type === 'institution_badge' || type === 'vehicle' || type === 'other_sensitive') return 0.70;
  return 0.55;
}

function shouldBlurFinding(finding) {
  if (!finding?.box || finding.requiredProtection === false) return false;
  const type = normalizeFindingType(finding.type);
  if (isIdentityOnlyType(type)) {
    console.log('[SANITIZE SKIP]', { id: finding.id, type, reason: 'face/person – detection only' });
    return false;
  }
  if (!SENSITIVE_TYPES.has(type)) {
    console.log('[SANITIZE APPLY]', { id: finding.id, type, reason: 'unknown type with box – protecting' });
  }
  const area = boxAreaFraction(finding.box);
  if (area > maxAreaForType(SENSITIVE_TYPES.has(type) ? type : 'other_sensitive')) {
    console.log('[SANITIZE SKIP]', { id: finding.id, type, area: area.toFixed(4), reason: 'box too large for type' });
    return false;
  }
  return true;
}

function regionFromBox(box, width, height) {
  const left = Math.max(0, Math.round((clampPercent(box.x) / 100) * width));
  const top = Math.max(0, Math.round((clampPercent(box.y) / 100) * height));
  const rawW = Math.round((clampPercent(box.width, 8) / 100) * width);
  const rawH = Math.round((clampPercent(box.height, 8) / 100) * height);
  const w = Math.max(12, Math.min(width - left, rawW));
  const h = Math.max(12, Math.min(height - top, rawH));
  return { left, top, width: w, height: h };
}

/** Validate a pixel region before passing to Sharp. Returns false if invalid. */
function isValidRegion(region, imageWidth, imageHeight) {
  const { left, top, width, height } = region;
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (left < 0 || top < 0 || width <= 0 || height <= 0) return false;
  if (left + width > imageWidth || top + height > imageHeight) return false;
  // Reject any region that covers more than 70% of total image area
  const regionArea = width * height;
  const imageArea = imageWidth * imageHeight;
  if (regionArea / imageArea > 0.92) {
    console.warn('[SANITIZE REJECT] Region covers >70% of image area – skipping', { left, top, width, height, imageWidth, imageHeight });
    return false;
  }
  return true;
}

function protectionFor(type) {
  if (type === 'qr_code' || type === 'barcode') {
    return { factor: 6, sigma: 42 };
  }
  if (['private_chat', 'otp', 'credentials', 'api_key', 'password', 'aadhaar'].includes(type)) {
    return { factor: 5, sigma: 48 };
  }
  return { factor: 7, sigma: 40 };
}

async function protectRegion(imageBuffer, region, type) {
  const { factor, sigma } = protectionFor(type);
  const tinyW = Math.max(4, Math.round(region.width / factor));
  const tinyH = Math.max(4, Math.round(region.height / factor));
  const protectedPatch = await sharp(imageBuffer)
    .extract(region)
    .resize(tinyW, tinyH)
    .resize(region.width, region.height, { kernel: 'nearest' })
    .blur(sigma)
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: protectedPatch, left: region.left, top: region.top }])
    .toBuffer();
}

function subtractBox(S, F) {
  const ix1 = Math.max(S.x, F.x);
  const iy1 = Math.max(S.y, F.y);
  const ix2 = Math.min(S.x + S.width, F.x + F.width);
  const iy2 = Math.min(S.y + S.height, F.y + F.height);

  if (ix1 >= ix2 || iy1 >= iy2) {
    return [S]; // No intersection
  }

  const result = [];
  const Sx2 = S.x + S.width;
  const Sy2 = S.y + S.height;

  // Top
  if (iy1 > S.y) {
    result.push({ x: S.x, y: S.y, width: S.width, height: iy1 - S.y });
  }
  // Bottom
  if (iy2 < Sy2) {
    result.push({ x: S.x, y: iy2, width: S.width, height: Sy2 - iy2 });
  }
  // Left
  if (ix1 > S.x) {
    result.push({ x: S.x, y: iy1, width: ix1 - S.x, height: iy2 - iy1 });
  }
  // Right
  if (ix2 < Sx2) {
    result.push({ x: ix2, y: iy1, width: Sx2 - ix2, height: iy2 - iy1 });
  }

  return result;
}

function subtractFaceBoxes(sensitiveBox, faceBoxes) {
  let currentBoxes = [sensitiveBox];
  for (const F of faceBoxes) {
    const nextBoxes = [];
    for (const S of currentBoxes) {
      nextBoxes.push(...subtractBox(S, F));
    }
    // Filter out boxes that are tiny (e.g. less than 1% height or width)
    currentBoxes = nextBoxes.filter((box) => box.width >= 1 && box.height >= 1);
  }
  return currentBoxes;
}

export async function sanitizeVerifiedRegions(buffer, findings, mimeType = 'image/jpeg', allFindings = []) {
  const base = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(base).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  const referenceFindings = allFindings && allFindings.length > 0 ? allFindings : findings;
  const faceBoxes = referenceFindings
    .filter((f) => isIdentityOnlyType(f.type))
    .map((f) => f.box)
    .filter((box) => box && typeof box.x === 'number' && typeof box.y === 'number' && typeof box.width === 'number' && typeof box.height === 'number');

  const applied = [];
  let output = base;
  for (const finding of findings) {
    if (!shouldBlurFinding(finding)) continue;
    const type = normalizeFindingType(finding.type);

    // Subtract all faces from the sensitive finding's box
    const clippedBoxes = subtractFaceBoxes(finding.box, faceBoxes);

    for (const clBox of clippedBoxes) {
      const region = regionFromBox(clBox, width, height);
      // Safety: reject invalid regions or boxes that cover almost the entire image
      if (!isValidRegion(region, width, height)) continue;
      const duplicate = applied.some((prev) => {
        const dx = Math.abs(prev.left - region.left);
        const dy = Math.abs(prev.top - region.top);
        const dw = Math.abs(prev.width - region.width);
        const dh = Math.abs(prev.height - region.height);
        return dx < 12 && dy < 12 && dw < 12 && dh < 12;
      });
      if (duplicate) continue;
      applied.push(region);
      console.log('[SANITIZING FINDING]', {
        id: finding.id,
        type,
        originalBox: finding.box,
        clippedBox: clBox,
        pixels: region,
        blur: 'APPLIED',
      });
      output = await protectRegion(output, region, type);
    }
  }

  const countCodes = async (imageBuffer) => {
    try {
      const pixels = await decodeRgba(imageBuffer, 1600);
      return {
        qrHits: detectQrCodes(pixels).length,
        barcodeHits: detectBarcodes(pixels, { tiles: false }).filter((item) => item.type === 'barcode').length,
      };
    } catch (err) {
      console.error('[VALIDATION] code rescan failed:', err.message);
      return { qrHits: 0, barcodeHits: 0 };
    }
  };

  let { qrHits, barcodeHits } = await countCodes(output);

  if (qrHits || barcodeHits) {
    for (const finding of findings.filter((item) => (item.type === 'qr_code' || item.type === 'barcode') && shouldBlurFinding(item))) {
      const region = regionFromBox(finding.box, width, height);
      output = await protectRegion(output, region, finding.type);
    }
    ({ qrHits, barcodeHits } = await countCodes(output));
  }

  const format = mimeType === 'image/png' ? 'png' : 'jpeg';
  const encoded = format === 'png' ? await sharp(output).png().toBuffer() : await sharp(output).jpeg({ quality: 90 }).toBuffer();

  console.log('[SAFE IMAGE GENERATED]', { findings: findings.length, blurred: applied.length, bytes: encoded.length });

  return {
    buffer: encoded,
    dataUrl: `data:${mimeType};base64,${encoded.toString('base64')}`,
    validation: {
      qr: qrHits === 0 ? 'PASS' : 'FAIL',
      barcode: barcodeHits === 0 ? 'PASS' : 'FAIL',
      sensitiveText: applied.length ? 'PROTECTED' : 'PASS',
      protectedRegions: applied.length,
    },
  };
}
