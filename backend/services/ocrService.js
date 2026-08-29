import { createWorker } from 'tesseract.js';
import { pixelBoxToPercent } from './imagePixels.js';
import sharp from 'sharp';

export async function extractOcrWords(encodedBuffer) {
  let worker = null;
  try {
    const prepared = await sharp(encodedBuffer)
      .rotate()
      .resize(850, 850, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const ocrMeta = await sharp(prepared).metadata();
    const width = ocrMeta.width || 1;
    const height = ocrMeta.height || 1;

    console.log('[OCR] Initializing Tesseract worker...');
    worker = await createWorker('eng', 1, { logger: () => {} });
    console.log('[OCR] Running text recognition...');
    const result = await worker.recognize(prepared);
    const words = result?.data?.words || [];
    const lines = result?.data?.lines || [];

    return words
      .filter((word) => word.text && Number(word.confidence) >= 55)
      .map((word) => {
        const bbox = word.bbox || {};
        const x = bbox.x0 ?? 0;
        const y = bbox.y0 ?? 0;
        const w = Math.max(4, (bbox.x1 ?? x + 8) - x);
        const h = Math.max(4, (bbox.y1 ?? y + 8) - y);
        const line = lines.find((entry) => entry.text && entry.text.includes(word.text));
        return {
          text: word.text,
          lineText: line?.text || word.text,
          confidence: Number(word.confidence) / 100,
          box: pixelBoxToPercent({ x, y, width: w, height: h }, width, height),
        };
      });
  } catch (err) {
    console.error('[OCR] failed:', err.message);
    return [];
  } finally {
    if (worker) {
      console.log('[OCR] Terminating Tesseract worker to free memory...');
      try {
        await worker.terminate();
      } catch (termErr) {
        console.error('[OCR] Failed to terminate worker:', termErr.message);
      }
    }
  }
}
