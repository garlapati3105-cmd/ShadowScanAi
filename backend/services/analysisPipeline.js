import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { extractMetadata } from './metadataService.js';
import { analyzeImageVisuals } from './geminiService.js';
import { analyzeImageVisualsGrok } from './grokService.js';
import { calculateExposureScore, calculateSanitizedScore } from './riskScoringService.js';
import { generateAttackerScenario } from './attackerSimulationService.js';
import { decodeRgba } from './imagePixels.js';
import { detectQrCodes } from './qrDetector.js';
import { detectBarcodes } from './barcodeDetector.js';
import { extractOcrWords } from './ocrService.js';
import { detectSensitivePatterns, detectReadableScreenContent } from './patternDetector.js';
import { mergeAndValidateFindings, recommendationsFromFindings } from './findingMerger.js';
import { sanitizeVerifiedRegions } from './sanitizeService.js';
import { findLikelyScreenBox } from './screenLocalizer.js';

function withTimeout(promise, ms, fallback, label) {
  let settled = false;
  const wrapped = Promise.resolve(promise).then(
    (value) => {
      settled = true;
      return value;
    },
    (err) => {
      settled = true;
      console.error(`[${label}] failed:`, err.message);
      return fallback;
    }
  );
  const timer = new Promise((resolve) => {
    setTimeout(() => {
      if (!settled) {
        console.warn(`[TIMEOUT] ${label} after ${ms}ms — continuing without it`);
        resolve(fallback);
      }
    }, ms);
  });
  return Promise.race([wrapped, timer]);
}

export async function runPrivacyAnalysis({ buffer, mimeType, filename, analysisId }) {
  const id = analysisId || randomUUID();
  const canonical = await sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();
  const pixels = await decodeRgba(canonical, 1200);

  const geminiBuffer = await sharp(canonical)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  console.log('[NEW IMAGE]', {
    analysisId: id,
    imageId: id,
    filename,
    size: `${pixels.originalWidth}x${pixels.originalHeight}`,
  });

  const getVisionService = async () => {
    const hasGrok = Boolean(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY' && process.env.GEMINI_API_KEY.trim() !== '');

    if (hasGrok) {
      console.log('[analysisPipeline] Routing visual checking to xAI Grok provider.');
      try {
        const result = await analyzeImageVisualsGrok(geminiBuffer, 'image/jpeg');
        if (result.findings && result.findings.length > 0) return result;
        console.warn('[analysisPipeline] Grok returned 0 findings.');
      } catch (err) {
        console.error('[analysisPipeline] Grok provider failed:', err.message);
      }
      // Fallback to Gemini if available
      if (hasGemini) {
        console.log('[analysisPipeline] Falling back to Gemini provider.');
        return analyzeImageVisuals(geminiBuffer, 'image/jpeg');
      }
      return { findings: [], recommendations: [] };
    }
    return analyzeImageVisuals(geminiBuffer, 'image/jpeg');
  };

  const [metadata, gemini, qrFindings, barcodeAll] = await Promise.all([
    Promise.resolve().then(() => extractMetadata(buffer)),
    withTimeout(getVisionService(), 90000, { findings: [], recommendations: [] }, 'vision'),
    Promise.resolve().then(() => {
      try {
        return detectQrCodes(pixels);
      } catch (err) {
        console.error('[QR] failed:', err.message);
        return [];
      }
    }),
    Promise.resolve().then(() => {
      try {
        return detectBarcodes(pixels);
      } catch (err) {
        console.error('[BARCODE] failed:', err.message);
        return [];
      }
    }),
  ]);

  let ocrWords = [];
  if (!gemini || !gemini.findings || gemini.findings.length === 0) {
    console.log('[analysisPipeline] Gemini returned 0 visual findings (or failed). Running local Tesseract OCR...');
    ocrWords = await withTimeout(extractOcrWords(canonical), 60000, [], 'ocr');
  } else {
    console.log('[analysisPipeline] Gemini returned findings. Skipping local Tesseract OCR to conserve memory.');
  }

  const barcodeFindings = barcodeAll.filter((item) => item.type === 'barcode');
  const qrFromZxing = barcodeAll.filter((item) => item.type === 'qr_code');
  const qrMerged = [...qrFindings, ...qrFromZxing];

  const patternFindings = [
    ...detectSensitivePatterns(ocrWords, pixels.width, pixels.height),
    ...detectReadableScreenContent(ocrWords),
  ];

  const screenHint = findLikelyScreenBox(pixels);

  const findings = mergeAndValidateFindings({
    analysisId: id,
    geminiFindings: gemini.findings || [],
    qrFindings: qrMerged,
    barcodeFindings,
    patternFindings,
    imageWidth: pixels.originalWidth,
    imageHeight: pixels.originalHeight,
    screenHint,
  });

  console.log('[DETECTION]', {
    analysisId: id,
    gemini: gemini.findings?.length || 0,
    ocr: ocrWords.length,
    qr: qrMerged.length,
    barcodes: barcodeFindings.length,
    patterns: patternFindings.length,
    final: findings.length,
  });

  const visualAnalysis = {
    findings,
    recommendations: [...(gemini.recommendations || []), ...recommendationsFromFindings(findings)].slice(0, 12),
  };

  const beforeScore = calculateExposureScore(metadata, visualAnalysis);
  const sanitized = await sanitizeVerifiedRegions(canonical, findings, 'image/jpeg');
  const afterScore = calculateSanitizedScore(metadata, visualAnalysis, findings.map((_, idx) => idx));
  const attackerSimulation = generateAttackerScenario(metadata, visualAnalysis);
  const orientedPreview = `data:image/jpeg;base64,${(
    await sharp(canonical).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  ).toString('base64')}`;

  findings.forEach((finding, idx) => {
    console.log('[SANITIZATION]', {
      analysisId: id,
      index: idx + 1,
      type: finding.type,
      box: finding.box,
      confidence: finding.confidence,
      status: 'protected',
    });
  });
  console.log('[VALIDATION]', { analysisId: id, ...sanitized.validation });

  return {
    analysisId: id,
    imageId: id,
    metadata,
    visualAnalysis,
    findings,
    exposureScore: beforeScore.scores,
    sanitizedScore: afterScore.scores,
    safeImage: sanitized.dataUrl,
    safeBuffer: sanitized.buffer,
    orientedPreview,
    validation: sanitized.validation,
    attackerSimulation,
  };
}
