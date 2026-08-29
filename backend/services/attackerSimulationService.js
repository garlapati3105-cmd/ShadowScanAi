/**
 * Deterministic Attacker Simulation Service.
 * Generates a defensive awareness simulation narrative based on detected findings.
 * Includes cautious security phrasing (could potentially, might allow, etc.).
 */

import { normalizeFindingType } from '../lib/findingTypes.js';

/**
 * Generates a 1-2 sentence plausible misuse scenario based on the threat footprint.
 * 
 * @param {Object} metadata - EXIF metadata
 * @param {Object} visualAnalysis - Gemini findings listing
 * @returns {Object} { summary: string }
 */
export function generateAttackerScenario(metadata = {}, visualAnalysis = {}) {
  const findings = visualAnalysis?.findings || [];

  const hasGps = Boolean(metadata?.gps?.present);
  const hasAuthor = Boolean(metadata?.author?.present);
  const hasCredentials = findings.some((f) => ['credentials', 'api_key', 'secret'].includes(normalizeFindingType(f.type)));
  const hasIdentity = findings.some((f) => ['passport', 'license', 'id_card', 'badge', 'student_id'].includes(normalizeFindingType(f.type)));
  const hasScreen = findings.some((f) => ['screen', 'code_editor', 'whiteboard'].includes(normalizeFindingType(f.type)));
  const hasContact = findings.some((f) => ['email', 'phone_number'].includes(normalizeFindingType(f.type)));
  const hasQr = findings.some((f) => ['qr_code', 'barcode'].includes(normalizeFindingType(f.type)));

  let summary = '';

  // Prioritize critical threat scenario templates
  if (hasCredentials) {
    summary = "An attacker could potentially discover the exposed plain-text security keys or credentials, which might support unauthorized service access.";
  } else if (hasIdentity && hasGps) {
    summary = "An attacker could potentially correlate the visible personal attributes with embedded GPS geolocation data to compile a targeted profile, which may support convincing social-engineering or offline tracking vector attempts.";
  } else if (hasIdentity) {
    summary = "The exposure of official identification features could potentially support spear-phishing or impersonation activities, which might allow malicious targets to request access changes under your identity.";
  } else if (hasGps) {
    summary = "An attacker could potentially map the coordinate headers inside your metadata history, which might expose habit structures or help pinpoint private workspace geolocations.";
  } else if (hasScreen) {
    summary = "An observer could study the displayed workplace environments, chat windows, or editor code, which might reveal internal tooling context.";
  } else if (hasContact && hasAuthor) {
    summary = "An attacker could potentially combine your metadata operator name and visible email or phone records, which could support targeted social-engineering campaigns.";
  } else if (hasContact) {
    summary = "Exposed contact details could potentially allow spoofing campaigns or phishing attempts, which could support unauthorized contact vectors.";
  } else if (hasQr) {
    summary = "Scanning the exposed QR layout could potentially support session hijacking or credential phishing if the payload references administrative configurations or login links.";
  } else if (findings.length > 0) {
    summary = "An attacker could potentially inspect these scanned visual references to build a target profile, which might support credential scanning on secondary platforms.";
  } else {
    summary = "No high-exposure indicators or EXIF location metrics were found in this file, which could support a low-threat assessment with minimal initial entry vectors for attackers.";
  }

  return { summary };
}
