import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { extractMetadata } from './metadataService.js';
import { analyzeImageVisualsOpenRouter } from './openRouterService.js';
import { analyzeImageVisuals } from './geminiService.js';
import { analyzeImageVisualsGrok } from './grokService.js';
import { resolveVisionProvider } from '../lib/visionProvider.js';
import { visionLooksIncomplete } from '../lib/findingTypes.js';
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
  const canonical = await sharp(buffer)
    .rotate()
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const pixels = await decodeRgba(canonical, 960);

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

  const mergeVision = (...parts) => {
    const findings = [];
    const recommendations = [];
    const errors = [];
    let truncated = false;
    for (const part of parts) {
      if (!part) continue;
      if (part.truncated) truncated = true;
      if (part.error) errors.push(part.error);
      findings.push(...(part.findings || []));
      recommendations.push(...(part.recommendations || []));
    }
    return {
      findings,
      recommendations,
      truncated,
      error: findings.length ? null : errors[0] || null,
    };
  };

  const runVision = async (imageBuffer, mode = 'detect') => {
    const provider = resolveVisionProvider();
    console.log(`[analysisPipeline] Routing visual ${mode} to ${provider} provider.`);
    if (provider === 'openrouter') {
      const result = await analyzeImageVisualsOpenRouter(imageBuffer, 'image/jpeg', { mode });
      if (mode === 'verify') return result;
      if (!visionLooksIncomplete(result)) return result;
      console.warn('[analysisPipeline] OpenRouter result incomplete (truncated, empty, or faces only). Trying Gemini fallback.');
      const geminiResult = await analyzeImageVisuals(imageBuffer, 'image/jpeg', { mode });
      if (!visionLooksIncomplete(geminiResult)) return mergeVision(result, geminiResult);
      const grokResult = await analyzeImageVisualsGrok(imageBuffer, 'image/jpeg');
      return mergeVision(result, geminiResult, grokResult);
    }
    if (provider === 'gemini') {
      return analyzeImageVisuals(imageBuffer, 'image/jpeg', { mode });
    }
    if (provider === 'grok') {
      return analyzeImageVisualsGrok(imageBuffer, 'image/jpeg');
    }
    console.warn('[analysisPipeline] No visual AI provider configured.');
    return { findings: [], recommendations: [], error: 'No visual AI provider configured.' };
  };

  const [metadata, gemini, qrFindings, barcodeAll] = await Promise.all([
    Promise.resolve().then(() => extractMetadata(buffer)),
    withTimeout(runVision(geminiBuffer, 'detect'), 90000, { findings: [], recommendations: [], error: 'Vision timed out.' }, 'vision'),
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
  const onRender = Boolean(process.env.RENDER);
  const allowOcr = process.env.DISABLE_OCR !== '1' && !onRender;
  if (allowOcr && (!gemini || !gemini.findings || gemini.findings.length === 0)) {
    console.log('[analysisPipeline] Gemini returned 0 visual findings (or failed). Running local Tesseract OCR...');
    ocrWords = await withTimeout(extractOcrWords(canonical), 60000, [], 'ocr');
  } else if (!gemini?.findings?.length) {
    console.log('[analysisPipeline] Skipping Tesseract OCR to stay within Render memory limits.');
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

  let residualSensitive = [];
  if (findings.length > 0) {
    const verifyBuffer = await sharp(sanitized.buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const residualVision = await withTimeout(
      runVision(verifyBuffer, 'verify'),
      60000,
      { findings: [], recommendations: [] },
      'vision-verify'
    );
    residualSensitive = (residualVision.findings || []).filter((item) => {
      const type = String(item.type || '').toLowerCase();
      return !['face', 'person', 'person_background', 'human_face', 'human'].includes(type);
    });
  } else {
    console.log('[analysisPipeline] Skipping verify pass because detect returned no findings.');
  }
  const validation = {
    ...sanitized.validation,
    visualResidual: findings.length === 0
      ? (gemini.error ? 'SKIPPED' : 'PASS')
      : residualSensitive.length === 0 ? 'PASS' : 'FAIL',
  };

  const orientedPreview = `data:image/jpeg;base64,${(
    await sharp(canonical).resize(1100, 1100, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()
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
  console.log('[VALIDATION]', { analysisId: id, ...validation, residual: residualSensitive.length });

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
    safeMimeType: 'image/jpeg',
    orientedPreview,
    validation,
    attackerSimulation,
    visionError: gemini.error || null,
  };
}
