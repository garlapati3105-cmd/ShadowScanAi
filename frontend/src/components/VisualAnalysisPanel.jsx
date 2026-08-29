import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Shield,
  Eye,
  CheckCircle,
  Wrench,
  HelpCircle,
  Focus,
} from 'lucide-react';
import { heatmapBoxClass, severityBadgeClass } from '../lib/riskStyles.js';

const SEVERITY_THEMES = {
  critical: {
    bg: 'border-red-500/25 bg-red-950/20 hover:bg-red-950/30',
    text: 'text-red-400',
  },
  high: {
    bg: 'border-red-500/25 bg-red-950/20 hover:bg-red-950/30',
    text: 'text-red-400',
  },
  medium: {
    bg: 'border-orange-500/25 bg-orange-950/15 hover:bg-orange-950/25',
    text: 'text-orange-400',
  },
  low: {
    bg: 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/60',
    text: 'text-emerald-400',
  },
};

function FindingMarkers({ findings, hoveredId, onHover }) {
  return findings.map((finding, idx) => {
    const box = finding.box || finding.boundingBox;
    if (!box) return null;
    const id = finding.id || `finding-${String(idx + 1).padStart(3, '0')}`;
    const isHovered = hoveredId === id;

    return (
      <div
        key={id}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        className={`absolute box-border cursor-pointer border-2 ${heatmapBoxClass(finding.severity)}`}
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          zIndex: isHovered ? 10 : 1,
          boxShadow: isHovered ? '0 0 0 2px rgba(255,255,255,0.35)' : 'none',
        }}
      >
        <span className="pointer-events-none absolute left-0 top-0 z-10 max-w-[min(100%,14rem)] -translate-y-full truncate rounded-t-md bg-zinc-950/90 px-1.5 py-0.5 font-mono text-[9px] leading-none text-white">
          [{idx + 1}] {finding.label} — {String(finding.severity || '').toUpperCase()}
        </span>
      </div>
    );
  });
}

function HeatmapLegend() {
  return (
    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-lg border border-zinc-800/90 bg-zinc-950/80 px-2.5 py-2 font-mono text-[9px] text-zinc-400 backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        High / critical
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-orange-400" />
        Medium
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Low
      </div>
    </div>
  );
}

export default function VisualAnalysisPanel({
  visualAnalysis,
  previewUrl,
  analysisId,
  compact = false,
  hoveredId = null,
  setHoveredId = () => {},
}) {
  if (!visualAnalysis) return null;

  const recommendations = visualAnalysis.recommendations || [];
  const findings = (visualAnalysis.findings || []).filter(
    (item) => !item.analysisId || !analysisId || item.analysisId === analysisId
  );
  const [localHoveredId, setLocalHoveredId] = useState(null);

  const currentHoveredId = hoveredId ?? localHoveredId;
  const changeHoveredId = (val) => {
    setLocalHoveredId(val);
    if (typeof setHoveredId === 'function') {
      setHoveredId(val);
    }
  };

  const markedImage = (
    <div className="pt-5">
      <div className="relative inline-block max-w-full">
        <img
          src={previewUrl}
          alt="Visual sandbox"
          className={`block h-auto w-auto max-w-full select-none rounded animate-fade-in ${
            compact ? 'max-h-[280px] sm:max-h-[350px]' : 'max-h-80'
          }`}
        />
        <FindingMarkers findings={findings} hoveredId={currentHoveredId} onHover={changeHoveredId} />
        <HeatmapLegend />
      </div>
    </div>
  );

  const severities = findings.map((f) => f.severity);
  let overallRisk = 'low';
  if (severities.includes('critical')) overallRisk = 'critical';
  else if (severities.includes('high')) overallRisk = 'high';
  else if (severities.includes('medium')) overallRisk = 'medium';

  if (compact) {
    return (
      <div className="ss-card relative flex min-h-[280px] items-center justify-center overflow-hidden p-2 sm:min-h-[350px]">
        {previewUrl ? (
          markedImage
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-zinc-300">No image loaded</p>
            <p className="mt-1 text-xs text-zinc-500">Upload a file to map risk regions.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="ss-card space-y-6 overflow-hidden"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-800 bg-zinc-950/20 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <Shield className="h-5 w-5 text-rose-400" />
              Visual security inspection
            </h2>
            <span className="rounded-md border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
              Gemini 2.5 Flash
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Scanning for credentials, badges, screens, and identity leakage
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">Risk:</span>
          <span className={`rounded-lg border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${severityBadgeClass(overallRisk)}`}>
            {overallRisk}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-12 md:p-6">
        <div className="flex flex-col justify-between space-y-4 md:col-span-5">
          <div className="space-y-2">
            <h3 className="ss-label flex items-center gap-1.5">
              <Focus className="h-3.5 w-3.5" /> Bounding overlay
            </h3>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Hover findings or boxes to highlight the matching region.
            </p>
          </div>

          <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 p-2">
            {previewUrl ? (
              markedImage
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-zinc-300">No image loaded</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 md:col-span-7">
          <h3 className="ss-label flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Findings ({findings.length})
          </h3>

          <div className="ss-scrollbar max-h-96 space-y-3 overflow-y-auto pr-1">
            {findings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 p-8 text-center">
                <CheckCircle className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
                <p className="text-sm font-semibold text-white">No threats detected</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  The visual scanner did not flag high-exposure triggers in this image.
                </p>
              </div>
            ) : (
              findings.map((finding, idx) => {
                const theme = SEVERITY_THEMES[finding.severity] || SEVERITY_THEMES.low;
                const id = finding.id || `finding-${String(idx + 1).padStart(3, '0')}`;
                const isHovered = currentHoveredId === id;

                return (
                  <div
                    key={id}
                    onMouseEnter={() => changeHoveredId(id)}
                    onMouseLeave={() => changeHoveredId(null)}
                    className={`cursor-default rounded-2xl border p-4 transition-colors duration-200 ${theme.bg} ${
                      isHovered ? 'border-zinc-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <span className="text-sm font-medium text-white">
                          [{idx + 1}] {finding.label}
                        </span>
                        <p className="font-mono text-[10px] text-zinc-500">{finding.type}</p>
                      </div>
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${severityBadgeClass(finding.severity)}`}>
                        {finding.severity}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-zinc-300">{finding.description}</p>

                    <div className="mt-3 space-y-2 border-t border-zinc-800/50 pt-3 text-[11px]">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.text}`} />
                        <p className="leading-normal text-zinc-400">
                          <span className="font-mono text-[10px] font-semibold uppercase text-zinc-500">Risk: </span>
                          {finding.reason}
                        </p>
                      </div>
                      {finding.potentialInference && (
                        <div className="flex items-start gap-2">
                          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          <p className="leading-normal text-zinc-400">
                            <span className="font-mono text-[10px] font-semibold uppercase text-zinc-500">Inference: </span>
                            {finding.potentialInference}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3 border-t border-zinc-800 bg-zinc-950/40 px-5 py-5 sm:px-6"
          >
            <h3 className="ss-label flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-zinc-400" /> Remediation
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recommendations.map((recommendation, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl border border-zinc-800/70 bg-zinc-900/20 px-3.5 py-2.5"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-zinc-700 font-mono text-[10px] text-zinc-300">
                    {idx + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-zinc-300">{recommendation}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
