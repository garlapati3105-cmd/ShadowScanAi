import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { extractMetadata } from './metadataService.js';
import { analyzeImageVisualsOpenRouter } from './openRouterService.js';
import { analyzeImageVisuals } from './geminiService.js';
import { analyzeImageVisualsGroq } from './groqService.js';
import { analyzeImageVisualsGrok } from './grokService.js';
import { resolveVisionProvider, isOpenRouterConfigured } from '../lib/visionProvider.js';
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

    if (provider === 'groq') {
      const groqResult = await analyzeImageVisualsGroq(imageBuffer, 'image/jpeg', { mode });
      if (mode === 'verify') return groqResult;
      if (!visionLooksIncomplete(groqResult)) return groqResult;
      if (!isOpenRouterConfigured()) return groqResult;
      console.warn('[analysisPipeline] Groq result incomplete or failed. Trying OpenRouter fallback.');
      const openRouterResult = await analyzeImageVisualsOpenRouter(imageBuffer, 'image/jpeg', { mode });
      if (!visionLooksIncomplete(openRouterResult)) return mergeVision(groqResult, openRouterResult);
      return mergeVision(groqResult, openRouterResult);
    }

    if (provider === 'grok') {
      const grokResult = await analyzeImageVisualsGrok(imageBuffer, 'image/jpeg', { mode });
      if (mode === 'verify') return grokResult;
      if (!visionLooksIncomplete(grokResult)) return grokResult;
      if (!isOpenRouterConfigured()) return grokResult;
      console.warn('[analysisPipeline] Grok result incomplete or failed. Trying OpenRouter fallback.');
      const openRouterResult = await analyzeImageVisualsOpenRouter(imageBuffer, 'image/jpeg', { mode });
      if (!visionLooksIncomplete(openRouterResult)) return mergeVision(grokResult, openRouterResult);
      return mergeVision(grokResult, openRouterResult);
    }

    if (provider === 'openrouter') {
      return analyzeImageVisualsOpenRouter(imageBuffer, 'image/jpeg', { mode });
    }

    if (provider === 'gemini') {
      return analyzeImageVisuals(imageBuffer, 'image/jpeg', { mode });
    }

    console.warn('[analysisPipeline] No visual AI provider configured.');
    return { findings: [], recommendations: [], error: 'No visual AI provider configured.' };
  };

  const [metadata, visionResult, qrFindings, barcodeAll] = await Promise.all([
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
        return detectBarcodes(pixels, { tiles: true });
      } catch (err) {
        console.error('[BARCODE] failed:', err.message);
        return [];
      }
    }),
  ]);

  let ocrWords = [];
  const onRender = Boolean(process.env.RENDER);
  const allowOcr = process.env.DISABLE_OCR !== '1' && !onRender;
  if (allowOcr && (!visionResult || !visionResult.findings || visionResult.findings.length === 0)) {
    console.log('[analysisPipeline] Vision returned 0 findings (or failed). Running local Tesseract OCR...');
    ocrWords = await withTimeout(extractOcrWords(canonical), 60000, [], 'ocr');
  } else if (!visionResult?.findings?.length) {
    console.log('[analysisPipeline] Skipping Tesseract OCR to stay within Render memory limits.');
  } else {
    console.log('[analysisPipeline] Vision returned findings. Skipping local Tesseract OCR to conserve memory.');
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
    geminiFindings: visionResult.findings || [],
    qrFindings: qrMerged,
    barcodeFindings,
    patternFindings,
    imageWidth: pixels.originalWidth,
    imageHeight: pixels.originalHeight,
    screenHint,
    visionIncomplete: visionLooksIncomplete(visionResult),
  });

  console.log('[DETECTION]', {
    analysisId: id,
    gemini: visionResult.findings?.length || 0,
    ocr: ocrWords.length,
    qr: qrMerged.length,
    barcodes: barcodeFindings.length,
    patterns: patternFindings.length,
    final: findings.length,
  });

  const visualAnalysis = {
    findings,
    recommendations: [...(visionResult.recommendations || []), ...recommendationsFromFindings(findings)].slice(0, 12),
  };

  const beforeScore = calculateExposureScore(metadata, visualAnalysis);
  const attackerSimulation = generateAttackerScenario(metadata, visualAnalysis);
  const sanitized = await sanitizeVerifiedRegions(canonical, findings, 'image/jpeg', findings, {
    alreadyOriented: true,
    includeDataUrl: false,
  });
  const afterScore = calculateSanitizedScore(metadata, visualAnalysis, findings.map((_, idx) => idx));

  const needsVerify = sanitized.validation.protectedRegions > 0;
  const verifyPromise = needsVerify
    ? (async () => {
        const verifyBuffer = await sharp(sanitized.buffer)
          .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        return withTimeout(
          runVision(verifyBuffer, 'verify'),
          30000,
          { findings: [], recommendations: [] },
          'vision-verify'
        );
      })()
    : Promise.resolve({ findings: [], recommendations: [] });

  const previewPromise = (async () => {
    const [orientedPreview, safePreview] = await Promise.all([
      sharp(canonical).resize(1100, 1100, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer(),
      sharp(sanitized.buffer).resize(720, 720, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer(),
    ]);
    return {
      orientedPreview: `data:image/jpeg;base64,${orientedPreview.toString('base64')}`,
      safeImage: `data:image/jpeg;base64,${safePreview.toString('base64')}`,
    };
  })();

  if (!needsVerify) {
    console.log('[analysisPipeline] Skipping verify pass because no regions were protected.');
  }

  const [residualVision, previews] = await Promise.all([verifyPromise, previewPromise]);
  const residualSensitive = needsVerify
    ? (residualVision.findings || []).filter((item) => {
        const type = String(item.type || '').toLowerCase();
        return !['face', 'person', 'person_background', 'human_face', 'human'].includes(type);
      })
    : [];
  const validation = {
    ...sanitized.validation,
    visualResidual: !needsVerify
      ? (visionResult.error ? 'SKIPPED' : 'PASS')
      : residualSensitive.length === 0 ? 'PASS' : 'FAIL',
  };

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
    safeImage: previews.safeImage,
    safeBuffer: sanitized.buffer,
    safeMimeType: 'image/jpeg',
    orientedPreview: previews.orientedPreview,
    validation,
    attackerSimulation,
    visionError: visionResult.error || null,
  };
}
