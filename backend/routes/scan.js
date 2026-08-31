import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { memoryUpload, MAX_FILE_SIZE_BYTES, sanitizeFilename, sniffImageMime } from '../lib/upload.js';
import { runPrivacyAnalysis } from '../services/analysisPipeline.js';
import { putSafeImage, getSafeImage } from '../lib/analysisStore.js';

const router = express.Router();
let scanGate = Promise.resolve();

router.post('/scan', (req, res, next) => {
  memoryUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload error.',
      });
    }

    if (err) return next(err);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file was provided. Please upload a JPG, JPEG, or PNG.',
      });
    }

    const { originalname, size, buffer } = req.file;
    const mimeType = sniffImageMime(buffer);
    if (!mimeType) {
      return res.status(400).json({
        success: false,
        error: 'File content does not match a valid JPEG or PNG image.',
      });
    }

    const analysisId = String(req.body.analysisId || '').trim() || randomUUID();
    const safeFilename = sanitizeFilename(originalname);

    try {
      const run = async () =>
        runPrivacyAnalysis({
          buffer,
          mimeType,
          filename: safeFilename,
          analysisId,
        });
      const queued = scanGate.then(run, run);
      scanGate = queued.then(
        () => undefined,
        () => undefined
      );
      const result = await queued;

      putSafeImage(result.analysisId, {
        buffer: result.safeBuffer,
        mimeType: result.safeMimeType || 'image/jpeg',
        findings: result.findings,
      });

      console.log('[SYNC]', {
        analysisId: result.analysisId,
        findings: result.findings.length,
        keyHighlights: result.findings.length,
        markers: result.findings.length,
        sanitizationRegions: result.findings.length,
        ids: result.findings.map((item) => item.id),
        safeImage: 'GENERATED',
        download: 'READY',
      });

      return res.status(200).json({
        success: true,
        analysisId: result.analysisId,
        imageId: result.imageId,
        file: {
          filename: safeFilename,
          mimeType,
          size,
        },
        metadata: result.metadata,
        visualAnalysis: result.visualAnalysis,
        findings: result.findings,
        exposureScore: result.exposureScore,
        sanitizedScore: result.sanitizedScore,
        safeImage: result.safeImage,
        orientedPreview: result.orientedPreview,
        validation: result.validation,
        attackerSimulation: result.attackerSimulation,
      });
    } catch (scanErr) {
      console.error('[Scan Error]', scanErr.message);
      return res.status(500).json({
        success: false,
        analysisId,
        error: 'Inspection engine encountered a service exception.',
      });
    }
  });
});

router.get('/analysis/:analysisId/safe-image', (req, res) => {
  const analysisId = String(req.params.analysisId || '').trim();
  const stored = getSafeImage(analysisId);
  if (!stored?.buffer) {
    return res.status(404).json({
      success: false,
      error: 'Safe Image is not ready yet.',
    });
  }
  const ext = stored.mimeType === 'image/png' ? 'png' : 'jpg';
  res.setHeader('Content-Type', stored.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="ShadowScan_Safe_Image.${ext}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(stored.buffer);
});

export default router;
