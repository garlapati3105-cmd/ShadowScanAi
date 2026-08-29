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
      className="ss-card overflow-hidden border-red-500/15"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/90 bg-zinc-950/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Crosshair className="h-4 w-4 text-red-400" />
          <span className="ss-label !text-red-400/90">Attacker perspective</span>
        </div>
        <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">Awareness simulation</span>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-zinc-300">
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
