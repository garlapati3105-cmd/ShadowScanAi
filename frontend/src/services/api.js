import axios from 'axios';

function resolveApiBase() {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host}:5000/api`;
}

const apiClient = axios.create({
  baseURL: resolveApiBase(),
  timeout: 180_000,
});

export async function uploadImage(file, { onProgress, analysisId, signal } = {}) {
  const formData = new FormData();
  formData.append('image', file);
  if (analysisId) formData.append('analysisId', analysisId);

  const response = await apiClient.post('/scan', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
  });

  if (response.data?.success === false) {
    throw new Error(response.data.error || 'Scan failed.');
  }

  return response.data;
}

export async function sanitizeImage(file, metadata, visualAnalysis, redactedIndices, analysisId) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('metadata', JSON.stringify(metadata || {}));
  formData.append('visualAnalysis', JSON.stringify(visualAnalysis || {}));
  formData.append('redactedIndices', JSON.stringify(redactedIndices || []));
  if (analysisId) formData.append('analysisId', analysisId);

  const response = await apiClient.post('/sanitize', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (response.data?.success === false) {
    throw new Error(response.data.error || 'Sanitization failed.');
  }

  return response.data;
}

export async function downloadSafeImageFile(analysisId) {
  const url = `${resolveApiBase()}/analysis/${encodeURIComponent(analysisId)}/safe-image`;
  console.log('[download started]', { analysisId, url });
  const response = await fetch(url, { method: 'GET' });
  const contentType = response.headers.get('content-type') || '';
  console.log('[download response]', { status: response.status, contentType });
  if (!response.ok) {
    throw new Error('Safe Image is not ready yet.');
  }
  const blob = await response.blob();
  if (!blob.size || !contentType.startsWith('image/')) {
    throw new Error('Unable to download Safe Image. Please regenerate it.');
  }
  const objectUrl = URL.createObjectURL(blob);
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'ShadowScan_Safe_Image.' + ext;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  console.log('[download success]', { analysisId });
}

export default apiClient;
