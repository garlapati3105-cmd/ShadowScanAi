const MAX_ENTRIES = 8;
const store = new Map();

export function putSafeImage(analysisId, payload) {
  if (!analysisId || !payload?.buffer) return;
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(analysisId, {
    buffer: payload.buffer,
    mimeType: payload.mimeType || 'image/jpeg',
    findings: payload.findings || [],
    createdAt: Date.now(),
  });
}

export function getSafeImage(analysisId) {
  return store.get(analysisId) || null;
}
