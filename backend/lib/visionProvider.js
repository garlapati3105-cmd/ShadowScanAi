function nonEmptyKey(value, placeholders = []) {
  const key = String(value || '').trim();
  if (!key) return false;
  return !placeholders.includes(key);
}

export function getOpenRouterKeys() {
  return String(process.env.OPENROUTER_API_KEY || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => nonEmptyKey(item));
}

export function isOpenRouterConfigured() {
  return getOpenRouterKeys().length > 0;
}

function isValidGeminiKey(key) {
  const value = String(key || '').trim();
  return value.length > 0 && value !== 'YOUR_GEMINI_API_KEY' && value.startsWith('AIza');
}

export function getGeminiKeys() {
  return String(process.env.GEMINI_API_KEY || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => isValidGeminiKey(item));
}

export function isGeminiConfigured() {
  return getGeminiKeys().length > 0;
}

export function isGrokConfigured() {
  return getGrokKeys().length > 0;
}

export function getGrokKeys() {
  const raw = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => nonEmptyKey(item) && item.startsWith('xai-'));
}

export function getGroqKeys() {
  const raw = process.env.GROQ_API_KEY || '';
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => nonEmptyKey(item) && item.startsWith('gsk_'));
}

export function isGroqConfigured() {
  return getGroqKeys().length > 0;
}

export function resolveVisionProvider() {
  const forced = String(process.env.VISION_PROVIDER || '').trim().toLowerCase();
  if (forced === 'groq' && isGroqConfigured()) return 'groq';
  if (forced === 'grok' && isGrokConfigured()) return 'grok';
  if (forced === 'openrouter' && isOpenRouterConfigured()) return 'openrouter';
  if (forced === 'gemini' && isGeminiConfigured()) return 'gemini';

  // Default: Groq (gsk_) or xAI Grok (xai-), then OpenRouter fallback.
  if (isGroqConfigured()) return 'groq';
  if (isGrokConfigured()) return 'grok';
  if (isOpenRouterConfigured()) return 'openrouter';
  if (isGeminiConfigured()) return 'gemini';
  return 'none';
}
