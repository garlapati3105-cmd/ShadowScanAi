import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Loader2,
  Image as ImageIcon,
  EyeOff,
  Download,
} from 'lucide-react';
import { downloadSafeImageFile, sanitizeImage, buildSafeImageUrl } from '../services/api.js';
import { protectionTargets } from '../lib/protection.js';

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
  const blurTargets = protectionTargets(findings);
  const [localSafe, setLocalSafe] = useState(safeImage || buildSafeImageUrl(analysisId));
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
        findings
          .map((item, idx) => (protectionTargets([item]).length ? idx : -1))
          .filter((idx) => idx >= 0),
        analysisId
      );
      if (data.analysisId && analysisId && data.analysisId !== analysisId) {
        console.warn('[STALE RESULT] DISCARD', { received: data.analysisId, current: analysisId });
        return;
      }
      setLocalSafe(data.sanitizedImage || buildSafeImageUrl(analysisId));
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
      <div className="border-b border-white/8 bg-emerald-500/[0.05] px-5 py-6 sm:px-6">
        <p className="ss-label !text-emerald-400/90 flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          Layer 04
        </p>
        <h2 className="ss-display mt-1 text-[1.85rem] text-white">Safe image</h2>
        <p className="mt-1.5 max-w-xl text-sm text-zinc-400">
          Secrets are pixelated locally. Faces stay clear. A second vision pass checks leftover readable text.
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <span className="ss-label">Risk shift</span>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold text-red-400">{beforeScore}</span>
              <span className="text-xs text-zinc-500">→</span>
              <span className="font-mono text-3xl font-semibold text-emerald-400">{afterScore}</span>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-4 md:col-span-2">
            <span className="ss-label">Validation</span>
            <div className="flex flex-wrap gap-2">
              {[
                ['QR', validation?.qr],
                ['Barcode', validation?.barcode],
                ['Text', validation?.sensitiveText],
                ['Blur recheck', validation?.visualResidual],
              ].map(([label, value]) => (
                <span
                  key={label}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${
                    value === 'PASS' || value === 'PROTECTED'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      : value === 'FAIL'
                        ? 'border-red-500/25 bg-red-500/10 text-red-300'
                        : 'border-white/10 text-zinc-500'
                  }`}
                >
                  {label} {value || 'n/a'}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase text-zinc-400">
                <EyeOff className="h-3.5 w-3.5 text-emerald-400" /> {validation?.protectedRegions ?? blurTargets.length} protected
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
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Download safe image
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isProcessing || !originalFile}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm text-zinc-200 hover:border-white/25 disabled:opacity-40"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Regenerate protection
          </button>
        </div>
      </div>
    </motion.div>
  );
}
