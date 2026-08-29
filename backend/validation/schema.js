import { z } from 'zod';

const MAX_FINDINGS = 40;
const MAX_TEXT = 500;

export const BoundingBoxSchema = z.object({
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
  width: z.coerce.number().min(0).max(100),
  height: z.coerce.number().min(0).max(100),
});

export const FindingSchema = z.object({
  type: z.string().min(1).max(80),
  label: z.string().min(1).max(MAX_TEXT),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().max(MAX_TEXT),
  reason: z.string().max(MAX_TEXT),
  potentialInference: z.string().max(MAX_TEXT),
  box: BoundingBoxSchema,
  id: z.string().optional(),
  analysisId: z.string().optional(),
  imageId: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  evidence: z.string().max(MAX_TEXT).optional(),
  validated: z.boolean().optional(),
  source: z.string().optional(),
});

export const VisualAnalysisSchema = z.object({
  findings: z.array(FindingSchema).max(MAX_FINDINGS),
  recommendations: z.array(z.string().max(MAX_TEXT)).max(20),
});

export const RedactedIndicesSchema = z
  .array(z.coerce.number().int().min(0).max(MAX_FINDINGS - 1))
  .max(MAX_FINDINGS);

const MAX_JSON_CHARS = 80_000;

export function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return fallback;
  if (raw.length > MAX_JSON_CHARS) {
    throw Object.assign(new Error('Payload too large.'), { status: 413, publicMessage: 'Payload too large.' });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON payload.'), { status: 400, publicMessage: 'Invalid request payload.' });
  }
}

export function clampPercent(n, fallback = 0) {
  const value = Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}
