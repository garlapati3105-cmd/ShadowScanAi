import { VisualAnalysisSchema } from '../validation/schema.js';
import { toTopLeftPercent } from '../lib/boxes.js';
import { parseModelJson } from '../lib/visionJson.js';
import { SYSTEM_PROMPT, visionUserPrompt } from '../lib/visionPrompts.js';
import { getGroqKeys } from '../lib/visionProvider.js';

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

async function callGroq(apiKey, model, dataUrl, mode, { jsonMode = true } = {}) {
  const body = {
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
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: mode === 'verify' ? 768 : 2048,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const errText = response.ok ? '' : await response.text();
  return { response, errText };
}

export async function analyzeImageVisualsGroq(buffer, mimeType, { mode = 'detect' } = {}) {
  const apiKeys = getGroqKeys();
  if (apiKeys.length === 0) {
    return { ...EMPTY, error: 'Groq is not configured. Set GROQ_API_KEY from https://console.groq.com/' };
  }

  const preferred = String(process.env.GROQ_MODEL || 'qwen/qwen3.6-27b').trim();
  const models = [...new Set([preferred, 'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'].filter(Boolean))];
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  let lastError = null;

  for (let i = 0; i < apiKeys.length; i += 1) {
    const apiKey = apiKeys[i];
    for (const model of models) {
      for (const jsonMode of [true, false]) {
        try {
          console.log(
            `[GroqService] Routing visual ${mode} to ${model} (key ${i + 1}/${apiKeys.length}, jsonMode=${jsonMode})...`
          );
          const { response, errText } = await callGroq(apiKey, model, dataUrl, mode, { jsonMode });

          if (!response.ok) {
            console.error(`[GroqService] HTTP ${response.status}:`, errText.slice(0, 500));
            lastError = new Error(`Groq API HTTP ${response.status}: ${errText.slice(0, 200)}`);
            const retryWithoutJson =
              response.status === 400 && /json_validate_failed|invalid_request_error/i.test(errText);
            if (retryWithoutJson && jsonMode) continue;
            if ([401, 402, 403, 429].includes(response.status)) break;
            continue;
          }

          const data = await response.json();
          const messageContent = data.choices?.[0]?.message?.content;
          if (!messageContent) {
            lastError = new Error('Groq returned an empty response.');
            continue;
          }

          const parsed = parseModelJson(messageContent);
          return { ...normalizeVisualAnalysis(parsed), truncated: Boolean(parsed.truncated) };
        } catch (err) {
          lastError = err;
          console.error(`[GroqService] ${model} failed:`, err.message);
          if (jsonMode) continue;
        }
      }
    }
  }

  console.error('[GroqService] All Groq attempts failed. Last error:', lastError?.message);
  return { ...EMPTY, error: lastError?.message || 'Groq visual analysis failed.' };
}
