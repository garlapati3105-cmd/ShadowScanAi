import React from 'react';

export default function SectionHeading({ icon: Icon, kicker, title, hint, accent = 'rose' }) {
  const iconColor =
    accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'orange'
        ? 'text-orange-400'
        : accent === 'red'
          ? 'text-red-400'
          : 'text-rose-400';

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1.5">
        {kicker && (
          <p className="ss-label flex items-center gap-2">
            {Icon ? <Icon className={`h-3.5 w-3.5 ${iconColor}`} /> : null}
            {kicker}
          </p>
        )}
        <h2 className="ss-display text-[1.65rem] leading-none text-white sm:text-[1.85rem]">{title}</h2>
      </div>
      {hint ? <p className="max-w-xs text-right font-mono text-[10px] leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}
