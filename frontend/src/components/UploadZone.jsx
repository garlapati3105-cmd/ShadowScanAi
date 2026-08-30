import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { uploadImage } from '../services/api.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const typeOk = !file.type || ACCEPTED_TYPES.includes(file.type);
  if (!typeOk) {
    return 'Only JPG, JPEG, and PNG files are supported.';
  }
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return 'File extension is not permitted.';
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File exceeds the ${MAX_SIZE_MB} MB size limit.`;
  }
  return null;
}

export default function UploadZone({ onAnalysisStart, onResult, onAnalysisError }) {
  const inputRef = useRef(null);
  const analysisIdRef = useRef(null);
  const abortRef = useRef(null);
  const [uiState, setUiState] = useState('idle');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeStep, setActiveStep] = useState(0);

  const loadingSteps = [
    'Lifting hidden EXIF ghosts',
    'Sweeping QR and barcodes',
    'Reading the visible scene',
    'Mapping identity leaks',
    'Staging the safe copy',
  ];

  React.useEffect(() => {
    let interval;
    if (uiState === 'uploading') {
      interval = setInterval(() => {
        setActiveStep((prev) => (prev < 4 ? prev + 1 : prev));
      }, 1400);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [uiState]);

  const beginIndependentAnalysis = useCallback(
    async (selected, previewUrl) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const analysisId = crypto.randomUUID();
      analysisIdRef.current = analysisId;
      setResult(null);
      setErrorMsg('');
      setActiveStep(0);
      setUiState('uploading');

      if (onAnalysisStart) {
        onAnalysisStart({
          analysisId,
          imageId: analysisId,
          originalFile: selected,
          previewUrl,
        });
      }

      console.log('[NEW IMAGE]', { analysisId, imageId: analysisId, name: selected.name });

      try {
        const data = await uploadImage(selected, { analysisId, signal: controller.signal });
        if (analysisIdRef.current !== analysisId) {
          console.warn('[STALE RESULT] DISCARD', { received: data.analysisId, current: analysisIdRef.current });
          return;
        }
        if (data.analysisId && data.analysisId !== analysisId) {
          console.warn('[STALE RESULT] DISCARD', { received: data.analysisId, current: analysisId });
          return;
        }
        setResult(data);
        setUiState('success');
        if (onResult) {
          onResult({
            ...data,
            analysisId,
            imageId: analysisId,
            previewUrl,
            originalFile: selected,
          });
        }
      } catch (err) {
        if (controller.signal.aborted || analysisIdRef.current !== analysisId) return;
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Upload failed. Please try again.';
        setErrorMsg(msg);
        setUiState('error');
        if (onAnalysisError) onAnalysisError(analysisId);
      }
    },
    [onAnalysisStart, onResult, onAnalysisError]
  );

  const applyFile = useCallback(
    (selected) => {
      const validationError = validateFile(selected);
      if (validationError) {
        setErrorMsg(validationError);
        setUiState('error');
        return;
      }

      setFile(selected);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const url = URL.createObjectURL(selected);
      previewRef.current = url;
      setPreview(url);
      beginIndependentAnalysis(selected, url);
    },
    [beginIndependentAnalysis]
  );

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) applyFile(selected);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (uiState !== 'uploading') setUiState('dragging');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (uiState === 'dragging') setUiState('idle');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) applyFile(dropped);
    else setUiState('idle');
  };

  const removeFile = () => {
    if (abortRef.current) abortRef.current.abort();
    analysisIdRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(null);
    setPreview(null);
    setResult(null);
    setErrorMsg('');
    setUiState('idle');
    if (onResult) onResult(null);
  };

  const dropzoneActive = uiState === 'dragging';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <AnimatePresence mode="wait">
        {(uiState === 'idle' || uiState === 'dragging') && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative flex min-h-[280px] cursor-pointer select-none flex-col items-center justify-center rounded-[1.4rem] border border-dashed px-6 py-12 text-center transition-all duration-200 sm:min-h-[320px] sm:p-14 ${
              dropzoneActive
                ? 'border-rose-400/80 bg-rose-500/10 shadow-[0_0_80px_rgba(244,63,94,0.12)]'
                : 'border-white/15 bg-white/[0.03] hover:border-rose-400/40 hover:bg-rose-500/[0.04]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileChange}
            />
            <div
              className={`mb-5 rounded-2xl border p-4 transition-colors duration-200 ${
                dropzoneActive
                  ? 'border-rose-400/50 bg-rose-500/15 text-rose-200'
                  : 'border-white/10 bg-zinc-950 text-zinc-300'
              }`}
            >
              <Upload className="h-8 w-8" />
            </div>
            <h3 className="ss-display text-[1.7rem] text-white sm:text-3xl">
              {dropzoneActive ? 'Release to inspect' : 'Drop a photograph'}
            </h3>
            <span className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
              JPG · JPEG · PNG · Max {MAX_SIZE_MB} MB
            </span>
          </motion.div>
        )}

        {uiState === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="ss-card overflow-hidden ring-1 ring-rose-500/20"
          >
            <div className="relative overflow-hidden bg-zinc-950">
              <img src={preview} alt="Analyzing" className="max-h-[22rem] w-full object-contain opacity-40 sm:max-h-[26rem]" />
              <div className="absolute inset-0 bg-gradient-to-b from-rose-950/30 via-zinc-950/25 to-zinc-950/80" />
              <div className="ss-scan-grid" />
              <div className="ss-radar" />
              <div className="ss-radar-beam" />
              <div className="ss-scan-line" />
              <span className="ss-hud-corner ss-hud-tl" />
              <span className="ss-hud-corner ss-hud-tr" />
              <span className="ss-hud-corner ss-hud-bl" />
              <span className="ss-hud-corner ss-hud-br" />

              <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-zinc-950/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-rose-200">
                <span className="ss-live-dot !bg-rose-400" />
                Live inspection
              </div>
              <div className="absolute right-4 top-4 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {String(activeStep + 1).padStart(2, '0')} / 05
              </div>

              <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-16">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-rose-300/90">Now hunting</p>
                <p className="ss-display mt-1 text-3xl text-white sm:text-4xl">{loadingSteps[activeStep]}</p>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full bg-rose-400"
                    initial={false}
                    animate={{ width: `${((activeStep + 1) / loadingSteps.length) * 100}%` }}
                    transition={{ duration: 0.45 }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 bg-zinc-950/70 px-5 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Pipeline</p>
                <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200">
                  <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                  Swap frame
                </label>
              </div>
              {loadingSteps.map((step, idx) => {
                const isCompleted = idx < activeStep;
                const isActive = idx === activeStep;
                return (
                  <div
                    key={step}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      isActive
                        ? 'border-rose-400/35 bg-rose-500/10 text-white'
                        : isCompleted
                          ? 'border-white/6 bg-white/[0.03] text-zinc-400'
                          : 'border-transparent text-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-zinc-700" />
                      )}
                      <span className={`text-sm ${isActive ? 'font-medium' : 'font-mono text-xs'}`}>{step}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-600">{String(idx + 1).padStart(2, '0')}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {uiState === 'success' && result && (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ss-card overflow-hidden">
            <div className="relative">
              <img src={preview} alt="Uploaded preview" className="max-h-72 w-full bg-zinc-950 object-contain" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-zinc-950/90 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Inspection complete
              </div>
              <button
                onClick={removeFile}
                className="absolute right-3 top-3 rounded-lg border border-zinc-700 bg-zinc-950/85 p-1.5 text-zinc-400 hover:text-white"
                title="Scan another image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-white">{file?.name}</p>
                <p className="font-mono text-[11px] text-zinc-500">
                  {formatBytes(result.file?.size ?? file?.size)} · {result.analysisId?.slice(0, 8)}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm text-zinc-200 hover:border-rose-400/40">
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                New image
              </label>
            </div>
          </motion.div>
        )}

        {uiState === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/25 bg-red-950/10 px-6 py-8 text-center"
          >
            <AlertTriangle className="h-7 w-7 text-red-400" />
            <h3 className="ss-display text-2xl text-white">Could not finish</h3>
            <p className="max-w-sm text-sm text-red-300/90">{errorMsg}</p>
            <button
              onClick={removeFile}
              className="rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400"
            >
              Choose a different file
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
