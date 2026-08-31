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
  Eye,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadZone from './components/UploadZone.jsx';
import VisualAnalysisPanel from './components/VisualAnalysisPanel.jsx';
import ExposureScorePanel from './components/ExposureScorePanel.jsx';
import AttackerSimulationPanel from './components/AttackerSimulationPanel.jsx';
import SafeComparisonPanel from './components/SafeComparisonPanel.jsx';
import SectionHeading from './components/SectionHeading.jsx';
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
      <header className="sticky top-0 z-50 border-b border-white/8 bg-zinc-950/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30">
              <Shield className="h-4.5 w-4.5 h-4 w-4 text-rose-300" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[13px] font-semibold tracking-[0.14em] text-white">
                SHADOW<span className="text-rose-400">SCAN</span>
                <span className="text-zinc-500"> AI</span>
              </p>
              <p className="hidden text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 sm:block">
                Visual security & privacy
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 md:flex">
            <span>01 Detect</span>
            <span className="text-zinc-700">/</span>
            <span>02 Protect</span>
            <span className="text-zinc-700">/</span>
            <span>03 Verify</span>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-[11px] font-mono text-emerald-300/90">
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">In-memory · not published</span>
            <span className="sm:hidden">Private</span>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
        <div className={`w-full space-y-10 ${currentAnalysis ? 'max-w-6xl' : 'max-w-3xl'}`}>
          {!currentAnalysis && (
            <div className="mx-auto max-w-2xl space-y-7 py-4 text-center sm:py-8">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="ss-kicker"
              >
                <span className="ss-live-dot" />
                Before you publish
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="ss-display text-[2.35rem] leading-[1.08] text-white sm:text-6xl"
              >
                See the leak
                <br />
                <span className="italic text-rose-300">before the post.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="mx-auto max-w-xl text-[15px] leading-relaxed text-zinc-400"
              >
                Every image can reveal more than you intended — through visible details, hidden metadata, and contextual clues. ShadowScan helps you detect that exposure before you share.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
              >
                {[
                  { icon: ScanLine, title: 'Detect', copy: 'Vision + EXIF + QR' },
                  { icon: Eye, title: 'Protect', copy: 'Blur secrets, keep faces' },
                  { icon: Sparkles, title: 'Verify', copy: 'Readable leftover scan' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5 text-left"
                    >
                      <Icon className="mb-2 h-4 w-4 text-rose-300" />
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{item.copy}</p>
                    </div>
                  );
                })}
              </motion.div>
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
            {!currentAnalysis && (
              <div className="mt-4 space-y-2.5 text-center">
                <p className="text-sm leading-relaxed text-zinc-400">
                  Upload an image and we'll inspect what it reveals before you share it.
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Upload → Detect → Protect → Verify
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  We check: Visible Details · Metadata · QR/Barcodes · Sensitive Text · Screens
                </p>
              </div>
            )}
          </motion.div>

          <AnimatePresence>
            {scanResult && (
              <motion.div
                key={scanResult.analysisId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-10"
              >
                {scanResult.visionError && findings.length === 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-100">
                    Visual AI could not finish this scan, so the exposure score is not a real all-clear.
                    Add OpenRouter credits or a working Gemini model, then scan again.
                  </div>
                )}
                <ExposureScorePanel
                  exposureScore={scanResult.exposureScore}
                  analysisIncomplete={Boolean(scanResult.visionError) && findings.length === 0}
                />

                <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-8">
                  <div className="space-y-4 lg:col-span-7">
                    <SectionHeading
                      icon={Activity}
                      kicker="Layer 01"
                      title="Risk heatmap"
                      hint="Hover a finding to light its region"
                    />
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
                    <div className="space-y-4">
                      <SectionHeading
                        icon={AlertTriangle}
                        kicker="Layer 02"
                        title="Key findings"
                        accent="orange"
                      />

                      <div className="space-y-2.5">
                        {findings.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
                            <p className="ss-display text-xl text-white">
                              {scanResult.visionError ? 'Scan incomplete' : 'Clean frame'}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              {scanResult.visionError
                                ? 'The vision provider did not return findings. This is not proof the photo is safe.'
                                : 'No sensitive visual regions were flagged.'}
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
                                className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                                  isSelected
                                    ? 'border-rose-400/40 bg-rose-500/8'
                                    : 'border-white/8 bg-white/[0.025] hover:border-white/16'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-semibold tracking-tight text-white">
                                    {String(idx + 1).padStart(2, '0')}  {finding.label}
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

                    <div className="space-y-4">
                      <SectionHeading
                        icon={Smartphone}
                        kicker="Layer 03"
                        title="File metadata"
                        hint="Hidden headers, not the vision model"
                      />

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {metadataRows.map((row) => {
                          const Icon = row.icon;
                          return (
                            <div
                              key={row.label}
                              className={`rounded-xl border px-3.5 py-3 ${
                                row.exposed
                                  ? 'border-red-500/25 bg-red-500/8'
                                  : 'border-white/8 bg-white/[0.03]'
                              }`}
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
                  <div className="space-y-4">
                    <SectionHeading icon={Wrench} kicker="Fix path" title="Remediation" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {recommendations.map((recommendation, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4"
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

      <footer className="border-t border-white/8 px-4 py-7 text-center sm:px-6">
        <p className="ss-display text-lg text-zinc-300">Inspect before you share.</p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
          © {new Date().getFullYear()} ShadowScan AI · Detect · Protect · Recheck
        </p>
      </footer>
    </div>
  );
}
