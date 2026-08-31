export function normalizeFindingType(type = '') {
  const t = String(type).toLowerCase().replace(/[^a-z0-9_]/g, '');
  // Email / phone
  if (t === 'email_address' || t === 'email') return 'email';
  if (t === 'phonenumber' || t === 'phone_number') return 'phone_number';
  // Logos / org identifiers
  if (t === 'brand_logo' || t === 'logo') return 'logo';
  // ID documents
  if (t === 'id_document' || t === 'identity_document' || t === 'id' || t === 'id_number') return 'id_card';
  if (t === 'driver_license' || t === 'license_card') return 'license';
  // Credentials / keys
  if (t === 'api_key_credentials' || t === 'key' || t === 'api_key') return 'api_key';
  if (t === 'password' || t === 'credentials') return 'credentials';
  // Whiteboards / screens
  if (t === 'whiteboard_exposure' || t === 'whiteboard' || t === 'calendar_information' || t === 'schedule_information') return 'whiteboard';
  if (t === 'laptop_screen' || t === 'screen' || t === 'computer_screen' || t === 'sensitive_screen') return 'screen';
  // QR / barcode
  if (t === 'qr_code_detected' || t === 'qrcode' || t === 'qr') return 'qr_code';
  if (t.includes('face')) return 'face';
  if (t === 'person' || t === 'human') return 'person';
  if (t.includes('background_person') || t.includes('person_background')) return 'person_background';
  // Institution / badge / lanyard
  if (
    t === 'institution_badge' ||
    t === 'lanyard' ||
    t === 'badge_text' ||
    t === 'name_tag' ||
    t === 'organization_identifier' ||
    t === 'organization_logo' ||
    t.includes('lanyard') ||
    t.includes('institution') ||
    t.includes('badge')
  ) return 'institution_badge';

  // Private chats
  if (
    t.includes('chat') ||
    t.includes('whatsapp') ||
    t.includes('telegram') ||
    t.includes('sms') ||
    t === 'privatescreen'
  ) return 'private_chat';
  // Payment identifiers
  if (t === 'upiid' || t === 'upi_id' || t === 'upi') return 'upi';
  // Aadhaar
  if (t === 'aadhar' || t === 'aadhaar_number' || t === 'aadhaar') return 'aadhaar';
  // Location
  if (t === 'location_clue' || t === 'visual_location' || t === 'visible_gps' || t === 'visible_timestamp') return 'location_text';
  // Vehicle
  if (t === 'vehicle_identifier' || t === 'license_plate' || t === 'vehicle_plate') return 'vehicle';
  // Financial
  if (t === 'financial_information' || t === 'financial_card' || t === 'credit_card') return 'financial_card';
  // Documents
  if (t === 'sensitive_document' || t === 'medical_information' || t === 'legal_information') return 'sensitive_document';
  if (t === 'other_sensitive' || t === 'othersensitive') return 'other_sensitive';
  return t;
}

export const IDENTITY_ONLY_TYPES = new Set([
  'face',
  'person',
  'person_background',
  'human_face',
  'human',
]);

export function isIdentityOnlyType(type = '') {
  return IDENTITY_ONLY_TYPES.has(normalizeFindingType(type));
}

export function visionLooksIncomplete(result) {
  if (!result) return true;
  if (result.truncated || result.error) return true;
  const findings = result.findings || [];
  if (!findings.length) return true;
  return findings.every((item) => isIdentityOnlyType(item.type));
}

