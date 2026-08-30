import React, { useRef, useState, useCallback } from 'react';
import {
  Shield,
  Lock,
  MapPin,
  Smartphone,
  Clock,
  User,
  Code2,
  Wrench,
  AlertTriangle,
  Activity,
  Camera,
  Aperture,
  Zap,
  Sun,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadZone from './components/UploadZone.jsx';
import VisualAnalysisPanel from './components/VisualAnalysisPanel.jsx';
import ExposureScorePanel from './components/ExposureScorePanel.jsx';
import AttackerSimulationPanel from './components/AttackerSimulationPanel.jsx';
import SafeComparisonPanel from './components/SafeComparisonPanel.jsx';
import { severityBadgeClass } from './lib/riskStyles.js';

export default function App() {
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const currentIdRef = useRef(null);

  const handleAnalysisStart = useCallback(({ analysisId, imageId, originalFile, previewUrl }) => {
    currentIdRef.current = analysisId;
    setHoveredId(null);
    setCurrentAnalysis({
      analysisId,
      imageId,
      status: 'analyzing',
      originalFile,
      previewUrl,
      visualAnalysis: { findings: [], recommendations: [] },
      findings: [],
      metadata: null,
      exposureScore: null,
      sanitizedScore: null,
      safeImage: null,
      validation: null,
      attackerSimulation: null,
    });
  }, []);

  const handleAnalysisError = useCallback((analysisId) => {
    if (analysisId && analysisId !== currentIdRef.current) return;
    setHoveredId(null);
    setCurrentAnalysis((prev) => (prev?.status === 'analyzing' ? null : prev));
  }, []);

  const handleResult = useCallback((data) => {
    if (data == null) {
      currentIdRef.current = null;
      setHoveredId(null);
      setCurrentAnalysis(null);
      return;
    }
    if (data.analysisId !== currentIdRef.current) {
      console.warn('[STALE RESULT] DISCARD', { received: data.analysisId, current: currentIdRef.current });
      return;
    }
    const findings = (data.findings || data.visualAnalysis?.findings || [])
      .filter((item) => !item.analysisId || item.analysisId === data.analysisId)
      .map((item, index) => ({
        ...item,
        id: item.id || `finding-${String(index + 1).padStart(3, '0')}`,
        box: item.box || item.boundingBox,
        boundingBox: item.boundingBox || item.box,
      }));
    console.log('[SYNC UI]', {
      analysisId: data.analysisId,
      findings: findings.length,
      ids: findings.map((item) => item.id),
    });
    setCurrentAnalysis({
      ...data,
      status: 'ready',
      previewUrl: data.orientedPreview || data.previewUrl,
      visualAnalysis: { ...data.visualAnalysis, findings },
      findings,
    });
  }, []);

  const scanResult = currentAnalysis?.status === 'ready' ? currentAnalysis : null;
  const isAnalyzing = currentAnalysis?.status === 'analyzing';

  const findings = scanResult?.visualAnalysis?.findings || [];

  const recommendations = scanResult?.visualAnalysis?.recommendations || [];

  const metadataRows = scanResult
    ? [
        {
          icon: MapPin,
          label: 'GPS Location',
          value: scanResult.metadata?.gps?.present
            ? (scanResult.metadata.gps.latitude != null && scanResult.metadata.gps.longitude != null
              ? `${scanResult.metadata.gps.latitude.toFixed(5)}, ${scanResult.metadata.gps.longitude.toFixed(5)}`
              : 'GPS headers present (coordinates not decoded)')
            : null,
          exposed: Boolean(scanResult.metadata?.gps?.present),
        },
        {
          icon: Smartphone,
          label: 'Device',
          value: [scanResult.metadata?.device?.make, scanResult.metadata?.device?.model]
            .filter(Boolean)
            .join(' ') || null,
        },
        {
          icon: Clock,
          label: 'Capture Date',
          value: scanResult.metadata?.timestamp?.value ?? null,
        },
        {
          icon: Code2,
          label: 'Software',
          value: scanResult.metadata?.software?.value ?? null,
        },
        {
          icon: User,
          label: 'Author / Copyright',
          value: scanResult.metadata?.author?.value ?? null,
        },
        {
          icon: Camera,
          label: 'ISO Speed',
          value: scanResult.metadata?.camera?.iso ?? null,
        },
        {
          icon: Aperture,
          label: 'Aperture',
          value: scanResult.metadata?.camera?.fNumber ?? null,
        },
        {
          icon: Zap,
          label: 'Shutter Speed',
          value: scanResult.metadata?.camera?.exposureTime ?? null,
        },
        {
          icon: Sun,
          label: 'Focal Length',
          value: scanResult.metadata?.camera?.focalLength ?? null,
        },
        {
          icon: Activity,
          label: 'Lens Model',
          value: scanResult.metadata?.camera?.lensModel ?? null,
        },
      ]
    : [];

  return (
    <div className="ss-shell min-h-screen text-zinc-100 flex flex-col font-sans antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 ring-1 ring-zinc-700/80">
              <Shield className="h-4.5 w-4.5 h-4 w-4 text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold tracking-wide text-white">
                SHADOW<span className="text-rose-400">SCAN</span>
                <span className="text-zinc-500"> AI</span>
              </p>
              <p className="hidden text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 sm:block">
                Visual privacy inspection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Local file · no public share</span>
            <span className="sm:hidden">Local scan</span>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
        <div className={`w-full space-y-8 ${currentAnalysis ? 'max-w-6xl' : 'max-w-2xl'}`}>
          {!currentAnalysis && (
            <div className="mx-auto max-w-xl space-y-5 py-6 text-center sm:py-10">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 font-mono text-[11px] text-zinc-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Image privacy before you publish
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-[1.75rem] font-semibold leading-tight tracking-tight text-white sm:text-4xl"
              >
                See what an attacker could learn{' '}
                <span className="bg-gradient-to-r from-rose-400 to-orange-300 bg-clip-text text-transparent">
                  before you share.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="mx-auto max-w-md text-sm leading-relaxed text-zinc-400"
              >
                Inspect visible sensitive content, hidden metadata, and exposure paths — then redact before the file leaves your machine.
              </motion.p>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={currentAnalysis ? 'mx-auto w-full max-w-2xl' : ''}
          >
            <UploadZone
              onAnalysisStart={handleAnalysisStart}
              onResult={handleResult}
              onAnalysisError={handleAnalysisError}
            />
          </motion.div>

          {isAnalyzing && (
            <div className="ss-card px-6 py-10 text-center">
              <p className="font-mono text-sm text-zinc-200">Analyzing new image</p>
              <p className="mt-2 text-xs text-zinc-500">Previous findings are cleared. Only this upload will be shown.</p>
            </div>
          )}

          <AnimatePresence>
            {scanResult && (
              <motion.div
                key={scanResult.analysisId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-7"
              >
                <ExposureScorePanel exposureScore={scanResult.exposureScore} />

                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
                  <div className="space-y-3 lg:col-span-7">
                    <h3 className="ss-label flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-rose-400" />
                      Risk heatmap
                    </h3>
                    <VisualAnalysisPanel
                      visualAnalysis={scanResult.visualAnalysis}
                      analysisId={scanResult.analysisId}
                      previewUrl={scanResult.previewUrl}
                      compact={true}
                      hoveredId={hoveredId}
                      setHoveredId={setHoveredId}
                    />
                  </div>

                  <div className="space-y-6 lg:col-span-5">
                    <div className="space-y-3">
                      <h3 className="ss-label flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                        Key findings
                      </h3>

                      <div className="space-y-2.5">
                        {findings.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-5 py-8 text-center">
                            <p className="text-sm font-medium text-zinc-200">No visual findings</p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              The scanner did not flag sensitive regions in this frame.
                            </p>
                          </div>
                        ) : (
                          findings.map((finding, idx) => {
                            const id = finding.id || `finding-${String(idx + 1).padStart(3, '0')}`;
                            const isSelected = hoveredId === id;
                            return (
                              <div
                                key={id}
                                onMouseEnter={() => setHoveredId(id)}
                                onMouseLeave={() => setHoveredId(null)}
                                className={`cursor-pointer rounded-2xl border p-4 transition-colors duration-200 ${
                                  isSelected
                                    ? 'border-zinc-600 bg-zinc-900/80'
                                    : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-medium text-white">
                                    [{idx + 1}] {finding.label}
                                  </span>
                                  <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${severityBadgeClass(finding.severity)}`}>
                                    {finding.severity}
                                  </span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                  {finding.description}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="ss-label flex items-center gap-2">
                        <Smartphone className="h-3.5 w-3.5 text-zinc-400" />
                        Embedded metadata
                      </h3>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {metadataRows.map((row) => {
                          const Icon = row.icon;
                          return (
                            <div
                              key={row.label}
                              className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 px-3.5 py-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                                  <Icon className={`h-3.5 w-3.5 ${row.exposed ? 'text-red-400' : 'text-zinc-500'}`} />
                                  {row.label}
                                </span>
                                {row.exposed && (
                                  <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-red-400">
                                    Exposed
                                  </span>
                                )}
                              </div>
                              <p className={`mt-1.5 truncate text-sm ${row.value ? 'text-zinc-100' : 'text-zinc-600'}`}>
                                {row.value ?? 'Not detected'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <AttackerSimulationPanel attackerSimulation={scanResult.attackerSimulation} />

                {recommendations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="ss-label flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 text-zinc-400" />
                      Remediation
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {recommendations.map((recommendation, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-300">
                            {idx + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-zinc-300">{recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <SafeComparisonPanel
                  key={scanResult.analysisId}
                  analysisId={scanResult.analysisId}
                  originalFile={scanResult.originalFile}
                  previewUrl={scanResult.previewUrl}
                  metadata={scanResult.metadata}
                  visualAnalysis={scanResult.visualAnalysis}
                  exposureScore={scanResult.exposureScore}
                  sanitizedScore={scanResult.sanitizedScore}
                  safeImage={scanResult.safeImage}
                  validation={scanResult.validation}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="border-t border-zinc-800/80 px-4 py-5 text-center font-mono text-[11px] text-zinc-600 sm:px-6">
        <p>© {new Date().getFullYear()} ShadowScan AI · Inspect before you share</p>
      </footer>
    </div>
  );
}
