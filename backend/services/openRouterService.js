import { VisualAnalysisSchema } from '../validation/schema.js';
import { toTopLeftPercent } from '../lib/boxes.js';
import { SYSTEM_PROMPT, visionUserPrompt } from '../lib/visionPrompts.js';

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

function defaultMaxTokens() {
  const n = Number(process.env.OPENROUTER_MAX_TOKENS);
  if (Number.isFinite(n) && n >= 256) return Math.min(Math.floor(n), 2048);
  return 1024;
}

function affordedTokens(errText) {
  const match = String(errText).match(/can only afford (\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export async function analyzeImageVisualsOpenRouter(buffer, mimeType, { mode = 'detect' } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return { ...EMPTY, error: 'OpenRouter is not configured.' };
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  let maxTokens = defaultMaxTokens();

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[OpenRouterService] Routing visual ${mode} using model ${model} (max_tokens=${maxTokens})...`);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://shadowscanai.onrender.com',
          'X-Title': 'ShadowScan AI',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: visionUserPrompt(mode),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[OpenRouterService] OpenRouter API HTTP ${response.status}:`, errText.slice(0, 500));
        if (response.status === 402) {
          const afford = affordedTokens(errText);
          const nextTokens = afford != null ? Math.min(maxTokens, Math.max(256, afford - 16)) : Math.max(256, Math.floor(maxTokens * 0.6));
          if (nextTokens < maxTokens) {
            maxTokens = nextTokens;
            continue;
          }
        }
        throw new Error(`OpenRouter API HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const messageContent = data.choices?.[0]?.message?.content;
      if (!messageContent) {
        console.warn('[OpenRouterService] Empty response content from OpenRouter.');
        return { ...EMPTY, error: 'OpenRouter returned an empty response.' };
      }

      return normalizeVisualAnalysis(JSON.parse(messageContent));
    }

    throw new Error('OpenRouter request failed after token-budget retries.');
  } catch (err) {
    console.error('[OpenRouterService] OpenRouter Visual analysis failed:', err.message);
    return { ...EMPTY, error: err.message };
  }
}
