const IDENTITY_ONLY = new Set([
  'face',
  'person',
  'person_background',
  'human_face',
  'human',
]);

function normalizeType(type = '') {
  const t = String(type).toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (t.includes('face')) return 'face';
  if (t.includes('background_person') || t.includes('person_background')) return 'person_background';
  return t;
}

export function isIdentityFinding(finding) {
  return IDENTITY_ONLY.has(normalizeType(finding?.type));
}

export function protectionTargets(findings = []) {
  return findings.filter((item) => item && !isIdentityFinding(item));
}
