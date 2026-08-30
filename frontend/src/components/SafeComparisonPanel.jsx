import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Loader2,
  Image as ImageIcon,
  EyeOff,
  Download,
} from 'lucide-react';
import { sanitizeImage, downloadSafeImageFile } from '../services/api.js';

export default function SafeComparisonPanel({
  analysisId,
  originalFile,
  previewUrl,
  metadata,
  visualAnalysis,
  exposureScore,
  sanitizedScore,
  safeImage,
  validation,
}) {
  const findings = (visualAnalysis?.findings || []).filter(
    (item) => !item.analysisId || item.analysisId === analysisId
  );
  const [localSafe, setLocalSafe] = useState(safeImage || null);
  const [localAfter, setLocalAfter] = useState(sanitizedScore || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const handleRegenerate = async () => {
    if (!originalFile) return;
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const data = await sanitizeImage(
        originalFile,
        metadata,
        visualAnalysis,
        findings.map((_, idx) => idx),
        analysisId
      );
      if (data.analysisId && analysisId && data.analysisId !== analysisId) {
        console.warn('[STALE RESULT] DISCARD', { received: data.analysisId, current: analysisId });
        return;
      }
      setLocalSafe(data.sanitizedImage);
      setLocalAfter(data.exposureScore);
    } catch (err) {
      setErrorMessage(err?.response?.data?.error || err?.message || 'Sanitization failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!analysisId) {
      setDownloadError('Safe Image is not ready yet.');
      return;
    }
    setDownloadError('');
    try {
      await downloadSafeImageFile(analysisId);
    } catch (err) {
      console.error('[download failure]', err);
      setDownloadError(err?.message || 'Unable to download Safe Image. Please regenerate it.');
    }
  };

  const beforeScore = exposureScore?.overall ?? 0;
  const afterScore = localAfter?.overall ?? beforeScore;

  return (
    <motion.div
      key={analysisId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="ss-card overflow-hidden"
    >
      <div className="border-b border-zinc-800 bg-zinc-950/30 px-5 py-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Safe image
        </h2>
        <p className="mt-1 text-xs text-zinc-400">
          Local blur/pixelation on verified sensitive regions only. Faces, hands, and backgrounds stay clear.
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <span className="ss-label">Risk shift</span>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold text-red-400">{beforeScore}</span>
              <span className="text-xs text-zinc-500">→</span>
              <span className="font-mono text-2xl font-semibold text-emerald-400">{afterScore}</span>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:col-span-2">
            <span className="ss-label">Validation</span>
            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-zinc-400">
              <span>QR {validation?.qr || 'n/a'}</span>
              <span>Barcode {validation?.barcode || 'n/a'}</span>
              <span>Text {validation?.sensitiveText || 'n/a'}</span>
              <span>Blur recheck {validation?.visualResidual || 'n/a'}</span>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <EyeOff className="h-3.5 w-3.5" /> {findings.length} protected
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-zinc-500">
              <ImageIcon className="h-3.5 w-3.5" /> Original
            </span>
            <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/70 p-2">
              <img src={previewUrl} alt="Original" className="max-h-64 rounded object-contain" />
            </div>
          </div>
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Current safe image
            </span>
            <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/15 bg-zinc-950/70 p-2">
              {localSafe ? (
                <img src={localSafe} alt="Safe version" className="max-h-64 rounded object-contain" />
              ) : (
                <p className="text-xs text-zinc-500">Generating…</p>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-300">{errorMessage}</div>
        )}
        {downloadError && (
          <div className="rounded-xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-300">{downloadError}</div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleDownload}
            disabled={!analysisId}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Download safe image
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isProcessing || !originalFile}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Regenerate protection
          </button>
        </div>
      </div>
    </motion.div>
  );
}
