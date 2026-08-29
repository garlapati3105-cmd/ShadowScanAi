const PATTERNS = [
  {
    type: 'email',
    label: 'Email address',
    severity: 'high',
    regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  },
  {
    type: 'phone_number',
    label: 'Phone number',
    severity: 'high',
    regex: /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/,
  },
  {
    type: 'upi',
    label: 'UPI ID',
    severity: 'critical',
    regex: /[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}/,
  },
  {
    type: 'aadhaar',
    label: 'Aadhaar / national ID number',
    severity: 'critical',
    regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
  },
  {
    type: 'transaction_id',
    label: 'Transaction / reference ID',
    severity: 'high',
    regex: /\b(?:TXN|UTR|RRN|REF|INV)[-_:]?[A-Z0-9]{6,}\b/i,
  },
  {
    type: 'otp',
    label: 'OTP / one-time code',
    severity: 'critical',
    regex: /\b(?:OTP|one[- ]time)\b.{0,12}\b\d{4,8}\b/i,
  },
];

function looksLikeEmail(text) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

export function detectSensitivePatterns(ocrWords = [], imageWidth, imageHeight) {
  const findings = [];

  for (const word of ocrWords) {
    const text = String(word.text || '').trim();
    if (text.length < 4) continue;

    for (const pattern of PATTERNS) {
      if (!pattern.regex.test(text) && !pattern.regex.test(word.lineText || '')) continue;
      if (pattern.type === 'upi' && looksLikeEmail(text)) continue;
      if (pattern.type === 'phone_number' && (word.lineText || text).replace(/\D/g, '').length < 10) continue;
      if (pattern.type === 'phone_number' && /\b\d{4}\s?\d{4}\s?\d{4}\b/.test(word.lineText || text)) continue;

      const box = word.box || {
        x: (word.x / imageWidth) * 100,
        y: (word.y / imageHeight) * 100,
        width: (word.w / imageWidth) * 100,
        height: (word.h / imageHeight) * 100,
      };

      findings.push({
        type: pattern.type,
        label: pattern.label,
        severity: pattern.severity,
        description: `Detected ${pattern.label.toLowerCase()} in visible text.`,
        reason: 'Readable personal or financial identifiers can be copied from a shared photo.',
        potentialInference: 'This identifier could be used to contact, impersonate, or track the owner.',
        box,
        confidence: 0.9,
        evidence: `OCR matched ${pattern.label}: "${text.slice(0, 80)}"`,
        validated: true,
      });
    }
  }

  return findings;
}

function unionBoxes(boxes) {
  let x1 = 100;
  let y1 = 100;
  let x2 = 0;
  let y2 = 0;
  for (const box of boxes) {
    if (!box) continue;
    x1 = Math.min(x1, box.x);
    y1 = Math.min(y1, box.y);
    x2 = Math.max(x2, box.x + box.width);
    y2 = Math.max(y2, box.y + box.height);
  }
  return {
    x: Math.max(0, x1 - 1.5),
    y: Math.max(0, y1 - 1.5),
    width: Math.min(100, x2 - x1 + 3),
    height: Math.min(100, y2 - y1 + 3),
  };
}

/** Readable message/document text on a phone or laptop screen, even when it is not an email/phone regex match. */
export function detectReadableScreenContent(ocrWords = []) {
  const words = ocrWords.filter((word) => String(word.text || '').trim().length >= 2 && word.box);
  if (words.length < 6) return [];

  const left = [];
  const right = [];
  for (const word of words) {
    const cx = word.box.x + word.box.width / 2;
    (cx >= 50 ? right : left).push(word);
  }

  const findings = [];

  const processCluster = (cluster) => {
    if (cluster.length < 6) return;
    const box = unionBoxes(cluster.map((word) => word.box));
    const area = (box.width * box.height) / 10000;
    if (area < 0.02 || area > 0.22) return;

    const cx = box.x + box.width / 2;
    if (box.width > 30 && cx > 32 && cx < 62 && box.y < 42) return;

    findings.push({
      type: 'private_chat',
      label: 'Readable screen content',
      severity: 'high',
      description: 'Readable private text is visible on a device screen.',
      reason: 'On-screen messages or documents can be copied from a shared photo.',
      potentialInference: 'Anyone who sees this photo could read the content on the screen.',
      box,
      confidence: 0.86,
      evidence: `OCR found ${cluster.length} readable words clustered on a screen-like region.`,
      validated: true,
    });
  };

  processCluster(left);
  processCluster(right);

  return findings;
}
