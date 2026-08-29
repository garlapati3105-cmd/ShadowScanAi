import express from 'express';
import multer from 'multer';
import { sanitizeVerifiedRegions } from '../services/sanitizeService.js';
import { calculateSanitizedScore } from '../services/riskScoringService.js';
import { putSafeImage } from '../lib/analysisStore.js';
import { memoryUpload, MAX_FILE_SIZE_BYTES, sniffImageMime } from '../lib/upload.js';
import {
  FindingSchema,
  RedactedIndicesSchema,
  parseJsonField,
} from '../validation/schema.js';

const router = express.Router();

function clientError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

router.post('/', (req, res) => {
  memoryUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return clientError(
          res,
          413,
          `File too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
        );
      }
      return clientError(res, 400, err.message || 'File upload error.');
    }
    if (err) {
      return clientError(res, 400, 'File upload error.');
    }

    try {
      if (!req.file) {
        return clientError(res, 400, 'No image file was provided.');
      }

      const mimeType = sniffImageMime(req.file.buffer);
      if (!mimeType) {
        return clientError(res, 400, 'File content does not match a valid JPEG or PNG image.');
      }

      const parsedVisual = parseJsonField(req.body.visualAnalysis, { findings: [], recommendations: [] });
      const findings = [];
      if (Array.isArray(parsedVisual.findings)) {
        for (const item of parsedVisual.findings.slice(0, 40)) {
          const result = FindingSchema.safeParse(item);
          if (result.success) findings.push(result.data);
        }
      }
      const recommendations = Array.isArray(parsedVisual.recommendations)
        ? parsedVisual.recommendations.filter((item) => typeof item === 'string').slice(0, 20)
        : [];
      const originalVisualAnalysis = { findings, recommendations };

      const analysisId = String(req.body.analysisId || '').trim();
      const originalMetadata = parseJsonField(req.body.metadata, {});
      const indicesParse = RedactedIndicesSchema.safeParse(parseJsonField(req.body.redactedIndices, []));
      const redactedIndices = indicesParse.success ? indicesParse.data : findings.map((_, idx) => idx);
      const selected = (redactedIndices.length ? redactedIndices : findings.map((_, idx) => idx))
        .map((idx) => findings[idx])
        .filter(Boolean);

      const sanitized = await sanitizeVerifiedRegions(req.file.buffer, selected, mimeType, findings);
      if (analysisId) {
        putSafeImage(analysisId, { buffer: sanitized.buffer, mimeType, findings: selected });
      }
      const scoreResult = calculateSanitizedScore(originalMetadata, originalVisualAnalysis, redactedIndices);

      return res.status(200).json({
        success: true,
        analysisId,
        sanitizedImage: sanitized.dataUrl,
        exposureScore: scoreResult.scores,
        validation: sanitized.validation,
      });
    } catch (sanitizeErr) {
      if (sanitizeErr.status && sanitizeErr.publicMessage) {
        return clientError(res, sanitizeErr.status, sanitizeErr.publicMessage);
      }
      console.error('[Sanitize Error]', sanitizeErr.message);
      return clientError(res, 500, 'Image sanitization failed.');
    }
  });
});

export default router;
