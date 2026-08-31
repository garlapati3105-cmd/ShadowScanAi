const MAX_ENTRIES = 4;
const MAX_AGE_MS = 8 * 60 * 1000;
const store = new Map();

function prune() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > MAX_AGE_MS) store.delete(id);
  }
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function putSafeImage(analysisId, payload) {
  if (!analysisId || !payload?.buffer) return;
  prune();
  if (store.has(analysisId)) store.delete(analysisId);
  else if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(analysisId, {
    buffer: payload.buffer,
    mimeType: payload.mimeType || 'image/jpeg',
    createdAt: Date.now(),
  });
}

export function getSafeImage(analysisId) {
  prune();
  return store.get(analysisId) || null;
}
