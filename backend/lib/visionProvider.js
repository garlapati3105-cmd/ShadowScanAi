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

export function isGeminiConfigured() {
  const keys = String(process.env.GEMINI_API_KEY || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item !== 'YOUR_GEMINI_API_KEY');
  return keys.length > 0;
}

export function isGrokConfigured() {
  return nonEmptyKey(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
}

export function resolveVisionProvider() {
  if (isOpenRouterConfigured()) return 'openrouter';
  if (isGeminiConfigured()) return 'gemini';
  if (isGrokConfigured()) return 'grok';
  return 'none';
}
