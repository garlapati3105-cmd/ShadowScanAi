import React from 'react';
import { motion } from 'framer-motion';
import { Crosshair, AlertCircle } from 'lucide-react';

export default function AttackerSimulationPanel({ attackerSimulation }) {
  if (!attackerSimulation || !attackerSimulation.summary) return null;

  const { summary } = attackerSimulation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="ss-card overflow-hidden border-red-500/20"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-red-500/[0.06] px-5 py-4 sm:px-6">
        <div className="space-y-1">
          <p className="ss-label !text-red-400/90 flex items-center gap-2">
            <Crosshair className="h-3.5 w-3.5" />
            Awareness
          </p>
          <h2 className="ss-display text-2xl text-white">Observer view</h2>
        </div>
        <span className="hidden rounded-full border border-red-500/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-red-300/80 sm:inline">
          Not a prediction
        </span>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-[15px] leading-relaxed text-zinc-200">
          {summary}
        </p>
        <div className="flex items-start gap-2 border-t border-zinc-800/70 pt-3 font-mono text-[10px] leading-relaxed text-zinc-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Potential misuse scenario — not a prediction. For privacy awareness only.</span>
        </div>
      </div>
    </motion.div>
  );
}
