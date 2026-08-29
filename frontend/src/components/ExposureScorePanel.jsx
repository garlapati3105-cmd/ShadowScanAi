import React, { useEffect, useState } from 'react';
import { motion, animate } from 'framer-motion';
import { ShieldAlert, Fingerprint, MapPin, Database } from 'lucide-react';

function getRiskTheme(score) {
  if (score >= 80) {
    return {
      text: 'text-red-400',
      border: 'border-red-500/25',
      stroke: 'stroke-red-500',
      bar: 'bg-red-500',
      label: 'Critical risk',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-red-400',
      border: 'border-red-500/20',
      stroke: 'stroke-red-500',
      bar: 'bg-red-500',
      label: 'High risk',
    };
  }
  if (score >= 25) {
    return {
      text: 'text-orange-400',
      border: 'border-orange-500/25',
      stroke: 'stroke-orange-400',
      bar: 'bg-orange-400',
      label: 'Medium risk',
    };
  }
  return {
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    stroke: 'stroke-emerald-500',
    bar: 'bg-emerald-500',
    label: 'Low risk',
  };
}

function AnimatedScoreValue({ value }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.15,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value]);

  return <span>{displayValue}</span>;
}

function CategoryBar({ icon: Icon, label, value, delay }) {
  const theme = getRiskTheme(value);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between font-mono text-xs">
        <span className="flex items-center gap-1.5 text-zinc-400">
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
          {label}
        </span>
        <span className="font-semibold text-zinc-100">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          className={`h-full ${theme.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.95, ease: 'easeOut', delay }}
        />
      </div>
    </div>
  );
}

export default function ExposureScorePanel({ exposureScore }) {
  if (!exposureScore) return null;

  const { overall = 0, identity = 0, location = 0, sensitiveData = 0 } = exposureScore;
  const theme = getRiskTheme(overall);
  const circumference = 2 * Math.PI * 68;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`ss-card flex flex-col items-center gap-7 p-5 sm:p-6 md:flex-row ${theme.border}`}
    >
      <div className="relative flex h-36 w-36 shrink-0 items-center justify-center sm:h-40 sm:w-40">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="68" className="fill-none stroke-zinc-800" strokeWidth="7" />
          <motion.circle
            cx="80"
            cy="80"
            r="68"
            className={`fill-none ${theme.stroke}`}
            strokeWidth="7"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (circumference * overall) / 100 }}
            transition={{ duration: 1.15, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="ss-label">Exposure</span>
          <h2 className="mt-0.5 font-mono text-4xl font-semibold tracking-tight text-white">
            <AnimatedScoreValue value={overall} />
          </h2>
          <span className="mt-0.5 border-t border-zinc-800 pt-0.5 font-mono text-[10px] text-zinc-500">
            / 100
          </span>
        </div>
      </div>

      <div className="w-full flex-1 space-y-4">
        <div>
          <span className="ss-label">Digital exposure assessment</span>
          <div className="mt-1 flex items-center gap-2">
            <h3 className={`text-lg font-semibold tracking-tight ${theme.text}`}>{theme.label}</h3>
            {overall >= 50 && (
              <span className={`inline-flex rounded-md border p-1 ${theme.border} text-red-400`}>
                <ShieldAlert className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <CategoryBar icon={Fingerprint} label="Identity" value={identity} delay={0.12} />
          <CategoryBar icon={MapPin} label="Location" value={location} delay={0.22} />
          <CategoryBar icon={Database} label="Sensitive data" value={sensitiveData} delay={0.32} />
        </div>

        <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
          Scores reflect peak exposure in each category: identity clues, location leakage, and recoverable secrets.
        </p>
      </div>
    </motion.div>
  );
}
