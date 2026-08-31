import { normalizeFindingType } from '../lib/findingTypes.js';
import { toTopLeftPercent, snapSensitiveBox, looksLikeFaceCover } from '../lib/boxes.js';

const REJECT_TYPES = new Set([
  'hand',
  'arm',
  'clothes',
  'chair',
  'table',
  'background',
  'phone',
  'mobile',
  'laptop',
  'tablet',
  'monitor',
  'projector',
  'device',
]);

const CONTENT_TYPES = new Set([
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
  'badge',
  'institution_badge',
  'face',
  'person_background',
  'financial_card',
  'credit_card',
  'address',
  'dob',
]);

function iou(a, b) {
  if (!a || !b) return 0;
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

function boxArea(box) {
  return (box?.width || 0) * (box?.height || 0);
}

function toFinding(raw, analysisId, extras = {}) {
  const type = normalizeFindingType(raw.type);
  const { imageWidth, imageHeight, ...rest } = extras;
  const box = toTopLeftPercent(raw.box || raw, imageWidth, imageHeight);
  return {
    analysisId,
    imageId: analysisId,
    type,
    label: raw.label || type,
    severity: raw.severity || 'high',
    description: raw.description || raw.evidence || raw.label,
    reason: raw.reason || 'Visible sensitive information may leak if this photo is shared.',
    potentialInference: raw.potentialInference || 'An observer could copy this information from the image.',
    box,
    boundingBox: box,
    confidence: Number(raw.confidence ?? 0.7),
    evidence: raw.evidence || '',
    validated: Boolean(raw.validated),
    requiredProtection: true,
    ...rest,
  };
}

export function mergeAndValidateFindings({
  analysisId,
  geminiFindings = [],
  qrFindings = [],
  barcodeFindings = [],
  patternFindings = [],
  imageWidth = 0,
  imageHeight = 0,
  screenHint = null,
}) {
  const accepted = [];
  const size = { imageWidth, imageHeight };

  const qrConfirmed = qrFindings.filter((item) => item.type === 'qr_code');
  const barcodeConfirmed = barcodeFindings.filter((item) => item.type === 'barcode');

  for (const item of [...qrConfirmed, ...barcodeConfirmed, ...patternFindings]) {
    accepted.push(
      toFinding(item, analysisId, {
        validated: true,
        source: item.type === 'qr_code' || item.type === 'barcode' ? 'detector' : 'ocr',
        ...size,
      })
    );
  }

  // Anti-hallucination: pattern of meta-descriptions about the tool/system itself
  const HALLUCINATION_PATTERNS = /shadowscan|privacy tool|analysis engine|privacy scanner|security tool|this image has been|meta.information about the tool|ai.powered|exposure assessment/i;

  for (const raw of geminiFindings) {
    let type = normalizeFindingType(raw.type);
    if (REJECT_TYPES.has(type)) continue;

    // Drop hallucinated findings that describe the tool itself instead of image content
    const rawBlob = `${raw.label || ''} ${raw.description || ''} ${raw.evidence || ''} ${raw.reason || ''}`;
    if (HALLUCINATION_PATTERNS.test(rawBlob)) continue;


    if (boxArea(raw.box) > 85 * 85) continue;

    if (type === 'qr_code') {
      if (!qrConfirmed.some((item) => iou(item.box, raw.box) > 0.2)) continue;
      continue;
    }
    if (type === 'barcode') {
      if (!barcodeConfirmed.some((item) => iou(item.box, raw.box) > 0.2)) continue;
      continue;
    }
    if (type === 'email' && !/email|@/.test(`${raw.evidence || ''} ${raw.description || ''}`)) {
      continue;
    }
    if (type === 'phone_number' && !/\d{6,}/.test(`${raw.evidence || ''} ${raw.description || ''}`)) {
      if (!patternFindings.some((item) => item.type === 'phone_number' && iou(item.box, raw.box) > 0.15)) {
        continue;
      }
    }

    const blob = `${raw.label || ''} ${raw.description || ''} ${raw.evidence || ''} ${raw.reason || ''}`.toLowerCase();
    if (type === 'screen' || type === 'laptopscreen') {
      if (/chat|whatsapp|telegram|instagram|sms|message|code|document|email|password|otp|text|readable/.test(blob)) {
        type = 'private_chat';
      } else {
        type = 'screen';
      }
    }

    if (accepted.some((item) => item.type === type && iou(item.box, raw.box) > 0.45)) continue;

    accepted.push(
      toFinding(
        {
          ...raw,
          type,
          confidence: raw.confidence ?? 0.72,
          evidence: raw.evidence || 'Vision model localized sensitive content in this region.',
        },
        analysisId,
        { source: 'gemini', validated: true, ...size }
      )
    );
  }

  const unique = [];
  for (const item of accepted) {
    if (unique.some((k) => k.type === item.type && iou(k.box, item.box) > 0.45)) continue;
    unique.push(item);
  }

  const adjusted = unique
    .map((item) => {
      if (item.type === 'qr_code' || item.type === 'barcode') return item;
      if (item.source === 'ocr') return item;
      if (item.type === 'private_chat') {
        const box = snapSensitiveBox(item.box, screenHint);
        return { ...item, box, boundingBox: box };
      }
      return item;
    })
    .filter((item) => {
      // Always keep these types
      if (item.type === 'qr_code' || item.type === 'barcode') return true;
      if (item.source === 'ocr') return true;
      if (item.type === 'face') return true;
      if (item.type === 'institution_badge') return true;
      if (item.type === 'person_background') return true;
      // Remove findings that look like face/body cover boxes only for private_chat type
      if (item.type === 'private_chat' && looksLikeFaceCover(item.box)) return false;
      return true;
    });

  const chats = adjusted.filter((item) => item.type === 'private_chat');
  const withoutNestedIds = adjusted.filter((item) => {
    if (item.type !== 'email' && item.type !== 'phone_number') return true;
    return !chats.some((chat) => iou(item.box, chat.box) > 0.25);
  });

  const oneChat = [];
  let keptChat = false;
  for (const item of withoutNestedIds) {
    if (item.type === 'private_chat') {
      if (keptChat) continue;
      keptChat = true;
    }
    oneChat.push(item);
  }

  return oneChat.slice(0, 40).map((item, index) => {
    const id = `finding-${String(index + 1).padStart(3, '0')}`;
    return { ...item, id, boundingBox: item.box };
  });
}

export function recommendationsFromFindings(findings) {
  if (!findings.length) {
    return ['No verified sensitive content was localized. Still strip EXIF before sharing.'];
  }
  const recs = ['Blur only the verified sensitive regions before sharing.', 'Strip GPS and device metadata from the export.'];
  if (findings.some((f) => f.type === 'qr_code' || f.type === 'barcode')) {
    recs.push('Confirm QR/barcodes are no longer scannable after sanitization.');
  }
  return recs;
}
