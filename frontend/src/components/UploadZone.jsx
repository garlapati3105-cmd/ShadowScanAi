import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  ScanSearch,
  CheckCircle,
  AlertTriangle,
  FileImage,
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
    'Scanning full image',
    'Checking QR codes',
    'Checking barcodes',
    'Inspecting visible screens',
    'Checking personal identifiers',
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
            className={`relative flex min-h-[260px] cursor-pointer select-none flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-200 sm:min-h-[300px] sm:p-12 ${
              dropzoneActive
                ? 'border-rose-400/70 bg-rose-950/20'
                : 'border-zinc-700 bg-zinc-900/25 hover:border-zinc-500 hover:bg-zinc-900/40'
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
              className={`mb-4 rounded-xl border p-3.5 transition-colors duration-200 ${
                dropzoneActive
                  ? 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
            >
              <Upload className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-white">
              {dropzoneActive ? 'Release to load image' : 'Drop an image to inspect'}
            </h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
              Each upload starts a new independent privacy analysis.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
              <FileImage className="h-3.5 w-3.5 text-rose-400" />
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
            className="ss-card overflow-hidden"
          >
            <div className="relative overflow-hidden border-b border-zinc-800">
              <img src={preview} alt="Analyzing" className="max-h-72 w-full bg-zinc-950 object-contain opacity-25" />
              <div className="absolute inset-0 bg-zinc-950/30" />
              <div className="ss-scan-line" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <ScanSearch className="h-6 w-6 text-rose-300" />
                <p className="font-mono text-xs text-zinc-200">Analyzing new image</p>
              </div>
            </div>
            <div className="space-y-3 bg-zinc-950/50 px-5 py-5 sm:px-7">
              <label className="mb-1 inline-flex cursor-pointer items-center gap-2 font-mono text-[11px] text-zinc-400 hover:text-zinc-200">
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                Replace image (starts a new analysis)
              </label>
              {loadingSteps.map((step, idx) => {
                const isCompleted = idx < activeStep;
                const isActive = idx === activeStep;
                return (
                  <div
                    key={step}
                    className={`flex items-center justify-between font-mono text-xs ${
                      isActive ? 'text-zinc-100' : isCompleted ? 'text-zinc-500' : 'text-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-400" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-zinc-700" />
                      )}
                      <span>{step}</span>
                    </div>
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
                Scan complete
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
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
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
            <h3 className="text-base font-semibold text-white">Scan could not complete</h3>
            <p className="max-w-sm text-sm text-red-300/90">{errorMsg}</p>
            <button
              onClick={removeFile}
              className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
            >
              Choose a different file
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
