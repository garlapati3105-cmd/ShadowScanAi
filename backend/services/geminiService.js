import { GoogleGenerativeAI } from '@google/generative-ai';
import { VisualAnalysisSchema } from '../validation/schema.js';
import { toTopLeftPercent } from '../lib/boxes.js';
import { SYSTEM_PROMPT, visionUserPrompt } from '../lib/visionPrompts.js';
import { parseModelJson } from '../lib/visionJson.js';
import { getGeminiKeys } from '../lib/visionProvider.js';

const EMPTY = { findings: [], recommendations: [] };

function clip(value, fallback) {
  const text = String(value ?? fallback);
  return text.slice(0, 500);
}

function normalizeVisualAnalysis(parsedData) {
  const findings = Array.isArray(parsedData?.findings) ? parsedData.findings.slice(0, 40) : [];
  const recommendations = Array.isArray(parsedData?.recommendations)
    ? parsedData.recommendations.map((item) => clip(item, '')).filter(Boolean).slice(0, 20)
    : [];

  const cleanedFindings = findings
    .map((finding) => {
      const severity = String(finding?.severity || 'medium').toLowerCase();
      const box = toTopLeftPercent(finding?.box || finding, 0, 0);
      const clampPct = (n, fallback) => {
        const value = Number(n);
        if (!Number.isFinite(value)) return fallback;
        return Math.min(100, Math.max(0, value));
      };

      return {
        type: clip(finding?.type || 'unknown', 'unknown').slice(0, 80),
        label: clip(finding?.label || 'Sensitive region'),
        severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium',
        description: clip(finding?.description, 'Sensitive content is visible in this region.'),
        reason: clip(finding?.reason, 'This region may leak private information if shared.'),
        potentialInference: clip(
          finding?.potentialInference,
          'Additional identity or context might be inferred from this region.'
        ),
        box: {
          x: clampPct(box.x, 0),
          y: clampPct(box.y, 0),
          width: clampPct(box.width, 10),
          height: clampPct(box.height, 10),
        },
        confidence: Number(finding?.confidence) > 0 ? Math.min(1, Number(finding.confidence)) : 0.7,
        evidence: clip(finding?.evidence || finding?.description || 'Vision localization'),
      };
    })
    .filter((finding) => finding.type && finding.label);

  return VisualAnalysisSchema.parse({
    findings: cleanedFindings,
    recommendations,
  });
}

async function generateWithRetry(model, payload, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await model.generateContent(payload);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (!/503|429|high demand|unavailable|overloaded|try again/i.test(msg) || attempt === attempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
    }
  }
  throw lastErr;
}

let currentKeyIndex = 0;

function geminiModelCandidates() {
  const preferred = String(process.env.GEMINI_MODEL || '').trim();
  return [...new Set([
    preferred,
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ].filter(Boolean))];
}

export async function analyzeImageVisuals(buffer, mimeType, { mode = 'detect' } = {}) {
  const apiKeys = getGeminiKeys();

  if (apiKeys.length === 0) {
    console.warn('[GeminiService] No valid Gemini API keys configured (expected AIza... keys from Google AI Studio).');
    return { ...EMPTY, error: 'Gemini is not configured. Add a free API key from https://aistudio.google.com/apikey' };
  }

  const models = geminiModelCandidates();
  let lastError = null;
  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (currentKeyIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of models) {
      try {
        console.log(`[GeminiService] Attempting visual analysis with API key index ${keyIndex} model ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const response = await generateWithRetry(model, {
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: buffer.toString('base64'), mimeType } },
                {
                  text: visionUserPrompt(mode),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
          systemInstruction: SYSTEM_PROMPT,
        });

        const textOutput = response.response.text();
        if (!textOutput) return { ...EMPTY, error: 'Gemini returned an empty response.' };

        const parsed = parseModelJson(textOutput);
        currentKeyIndex = (keyIndex + 1) % apiKeys.length;
        return { ...normalizeVisualAnalysis(parsed), truncated: Boolean(parsed.truncated) };
      } catch (err) {
        console.warn(`[GeminiService] API key index ${keyIndex} model ${modelName} failed:`, err.message);
        lastError = err;
      }
    }
  }

  console.error('[GeminiService] Visual analysis failed for all available keys. Last error:', lastError?.message);
  return { ...EMPTY, error: lastError?.message || 'Gemini visual analysis failed.' };
}
