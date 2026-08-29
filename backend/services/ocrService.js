import { createWorker } from 'tesseract.js';
import { pixelBoxToPercent } from './imagePixels.js';
import sharp from 'sharp';

let workerPromise = null;
let ocrQueue = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { logger: () => {} });
  }
  return workerPromise;
}

function runExclusive(task) {
  const next = ocrQueue.then(task, task);
  ocrQueue = next.catch(() => {});
  return next;
}

export async function extractOcrWords(encodedBuffer) {
  try {
    const prepared = await sharp(encodedBuffer)
      .rotate()
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const ocrMeta = await sharp(prepared).metadata();
    const width = ocrMeta.width || 1;
    const height = ocrMeta.height || 1;
    const worker = await getWorker();
    const result = await runExclusive(() => worker.recognize(prepared));
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
  }
}
