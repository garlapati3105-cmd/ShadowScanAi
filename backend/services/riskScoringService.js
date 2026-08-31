import { normalizeFindingType } from '../lib/findingTypes.js';

/**
 * Deterministic Digital Exposure Score Engine.
 * Converts security findings and image metadata into scores from 0 to 100.
 */

// ─── Score Weights Matrix ────────────────────────────────────────────────────

const RISK_WEIGHTS = {
  // ── Identity Triggers ──
  identity: {
    passport: {
      weight: 65,
      reason: 'Biometric passports are governments-issued credentials that uniquely identify human targets.',
    },
    license: {
      weight: 55,
      reason: 'Driver licenses contain full names, dates of birth, and home addresses.',
    },
    id_card: {
      weight: 50,
      reason: 'National or corporate ID cards offer identification context that can be used in phishing attacks.',
    },
    student_id: {
      weight: 40,
      reason: 'Student identifiers leak institutional enrollment and identity details.',
    },
    badge: {
      weight: 45,
      reason: 'Corporate badges show employee identity and access levels, allowing social engineering.',
    },
    institution_badge: {
      weight: 35,
      reason: 'Lanyards and institution badges reveal the person\'s college, company, or organization, enabling targeted social engineering.',
    },
    face: {
      weight: 35,
      reason: 'A visible, identifiable face links the photo to a specific person and can be used for facial recognition or identity-based targeting.',
    },
    person_background: {
      weight: 20,
      reason: 'Non-consenting persons in the background may have their presence, location, or associations revealed without permission.',
    },
    email: {
      weight: 15,
      reason: 'Visible email addresses invite targeted spam and credential phishing.',
    },
    phone_number: {
      weight: 25,
      reason: 'Phone numbers can be leveraged for SMS swapping, spamming, or visual SIM hijack vectors.',
    },
    phone: {
      weight: 25,
      reason: 'Alias trigger for phone numbers.',
    },
    logo: {
      weight: 10,
      reason: 'Brand or organization logos expose employee work locations and structures.',
    },
    metadata_author: {
      weight: 20,
      reason: 'Author metadata headers pinpoint the exact device operator or creator name.',
    },
    signature: {
      weight: 45,
      reason: 'A visible handwritten signature can be copied and misused as identity proof.',
    },
  },

  // ── Location Triggers ──
  location: {
    gps: {
      weight: 75,
      reason: 'Embedded latitude/longitude coordinate headers pinpoint exact geolocation captures.',
    },
    altitude: {
      weight: 10,
      reason: 'Altitude coordinates add elevation details to exact pin locations.',
    },
    timestamp: {
      weight: 20,
      reason: 'Precise capture timestamps leak time-of-day and habits, exposing schedules.',
    },
    visual_location: {
      weight: 40,
      reason: 'Landmarks, signs, or boarding passes in images expose travel origins or current whereabouts.',
    },
    location_text: {
      weight: 40,
      reason: 'Visible location clues such as street signs, addresses, or labels reveal the whereabouts of the subject.',
    },
    vehicle: {
      weight: 30,
      reason: 'Vehicle license plates can uniquely identify a person\'s vehicle and trace their movements.',
    },
  },

  // ── Sensitive Data Triggers ──
  sensitiveData: {
    credentials: {
      weight: 90,
      reason: 'Exposed plain-text passwords or API keys give direct, unauthorized system access.',
    },
    api_key: {
      weight: 90,
      reason: 'API key exposures lead to system compromise and immediate data leakage.',
    },
    secret: {
      weight: 90,
      reason: 'Secret tokens and cryptokeys compromise entire system infrastructure.',
    },
    financial_card: {
      weight: 85,
      reason: 'Payment cards expose credit/debit card numbers and financial accounts.',
    },
    credit_card: {
      weight: 85,
      reason: 'Credit card layouts expose cardholder names, numbers, and expiry data.',
    },
    whiteboard: {
      weight: 50,
      reason: 'Meeting whiteboards often capture unredacted architecture notes, charts, or blueprints.',
    },
    screen: {
      weight: 0,
      reason: 'A visible device screen is not sensitive unless private content is confirmed.',
    },
    code_editor: {
      weight: 50,
      reason: 'Code editors display structural source logic, file systems, and internal structures.',
    },
    qr_code: {
      weight: 55,
      reason: 'QR codes can encode payment, login, or identity payloads.',
    },
    barcode: {
      weight: 40,
      reason: 'Barcodes can map to tickets, parcels, or identity records.',
    },
    private_chat: {
      weight: 80,
      reason: 'Readable private messages leak conversations and contacts.',
    },
    otp: {
      weight: 90,
      reason: 'Visible OTPs can be used to take over accounts.',
    },
    upi: {
      weight: 75,
      reason: 'UPI handles can be used for payment fraud or harassment.',
    },
    aadhaar: {
      weight: 85,
      reason: 'National ID numbers uniquely identify a person.',
    },
    transaction_id: {
      weight: 35,
      reason: 'Transaction IDs can be correlated with financial activity.',
    },
    metadata_software: {
      weight: 10,
      reason: 'Software tool signatures (Photoshop, Lightroom) leak editor details and digital footprint.',
    },
  },
};


/**
 * Calculates the Digital Exposure Score.
 * 
 * @param {Object} metadata - Normalized metadata object
 * @param {Object} visualAnalysis - Gemini target findings object
 * @returns {Object} Score details, sub-categories, and debugging evidence
 */
export function calculateExposureScore(metadata = {}, visualAnalysis = {}) {
  const findings = visualAnalysis.findings || [];
  
  let identityScore = 0;
  let locationScore = 0;
  let sensitiveDataScore = 0;

  const evidence = [];

  // 1. Process Metadata Contributions
  if (metadata.author?.present) {
    const cost = RISK_WEIGHTS.identity.metadata_author.weight;
    identityScore += cost;
    evidence.push({
      category: 'Identity',
      trigger: 'metadata.author',
      weight: cost,
      reason: RISK_WEIGHTS.identity.metadata_author.reason,
    });
  }

  if (metadata.gps?.present) {
    const cost = RISK_WEIGHTS.location.gps.weight;
    locationScore += cost;
    evidence.push({
      category: 'Location',
      trigger: 'metadata.gps',
      weight: cost,
      reason: RISK_WEIGHTS.location.gps.reason,
    });
  }

  if (metadata.gps?.present && metadata.gps.altitude !== null) {
    const cost = RISK_WEIGHTS.location.altitude.weight;
    locationScore += cost;
    evidence.push({
      category: 'Location',
      trigger: 'metadata.altitude',
      weight: cost,
      reason: RISK_WEIGHTS.location.altitude.reason,
    });
  }

  if (metadata.timestamp?.present) {
    const cost = RISK_WEIGHTS.location.timestamp.weight;
    locationScore += cost;
    evidence.push({
      category: 'Location',
      trigger: 'metadata.timestamp',
      weight: cost,
      reason: RISK_WEIGHTS.location.timestamp.reason,
    });
  }

  if (metadata.software?.present) {
    const cost = RISK_WEIGHTS.sensitiveData.metadata_software.weight;
    sensitiveDataScore += cost;
    evidence.push({
      category: 'Sensitive Data',
      trigger: 'metadata.software',
      weight: cost,
      reason: RISK_WEIGHTS.sensitiveData.metadata_software.reason,
    });
  }

  // 2. Process Gemini Visual Findings Contributions
  findings.forEach((finding) => {
    const normType = normalizeFindingType(finding.type);

    // Identify if the type belongs to Identity weights
    if (RISK_WEIGHTS.identity[normType]) {
      const weightData = RISK_WEIGHTS.identity[normType];
      identityScore += weightData.weight;
      evidence.push({
        category: 'Identity',
        trigger: `visual.${finding.type}`,
        weight: weightData.weight,
        reason: finding.reason || weightData.reason,
      });
    }

    // Identify if type belongs to Location weights
    if (normType === 'location_text' || normType === 'boarding_pass' || normType === 'vehicle') {
      const weightKey = normType === 'vehicle' ? 'vehicle' : (RISK_WEIGHTS.location[normType] ? normType : 'location_text');
      const weightData = RISK_WEIGHTS.location[weightKey] || RISK_WEIGHTS.location.visual_location;
      locationScore += weightData.weight;
      evidence.push({
        category: 'Location',
        trigger: `visual.${finding.type}`,
        weight: weightData.weight,
        reason: finding.reason || weightData.reason,
      });
    }

    // Identify if type belongs to Sensitive Data weights
    if (RISK_WEIGHTS.sensitiveData[normType]) {
      const weightData = RISK_WEIGHTS.sensitiveData[normType];
      sensitiveDataScore += weightData.weight;
      evidence.push({
        category: 'Sensitive Data',
        trigger: `visual.${finding.type}`,
        weight: weightData.weight,
        reason: finding.reason || weightData.reason,
      });
    }
  });

  // Cap sub-category scores strictly between 0 and 100
  const finalIdentity = Math.min(100, Math.max(0, identityScore));
  const finalLocation = Math.min(100, Math.max(0, locationScore));
  const finalSensitiveData = Math.min(100, Math.max(0, sensitiveDataScore));

  // Compute overall using the formula:
  // Math.round(maxCategoryScore * 0.7 + averageCategoryScore * 0.3)
  // This ensures that single high-exposure categories pull the score up significantly,
  // representing threat peaks accurately while still factoring in secondary risks.
  const categories = [finalIdentity, finalLocation, finalSensitiveData];
  const maxCategory = Math.max(...categories);
  const avgCategory = categories.reduce((sum, score) => sum + score, 0) / 3;
  const rawOverall = maxCategory * 0.7 + avgCategory * 0.3;
  const finalOverall = Math.min(100, Math.max(0, Math.round(rawOverall)));

  return {
    scores: {
      overall: finalOverall,
      identity: finalIdentity,
      location: finalLocation,
      sensitiveData: finalSensitiveData,
    },
    evidence,
  };
}

/**
 * Calculates a reduced risk profile representation for sanitized images.
 * Wipes metadata footprint (simulating stripping EXIF) and filters out findings at index markers.
 */
export function calculateSanitizedScore(originalMetadata = {}, originalVisualAnalysis = {}, redactedIndices = []) {
  const strippedMetadata = {
    gps: { present: false, latitude: null, longitude: null, altitude: null },
    timestamp: { present: false, value: null },
    device: { present: false, make: null, model: null, software: null },
    author: { present: false, value: null }
  };

  const originalFindings = originalVisualAnalysis.findings || [];
  const remainingFindings = originalFindings.filter((_, idx) => !redactedIndices.includes(idx));

  const visualAnalysis = {
    findings: remainingFindings,
    recommendations: originalVisualAnalysis.recommendations || []
  };

  return calculateExposureScore(strippedMetadata, visualAnalysis);
}
