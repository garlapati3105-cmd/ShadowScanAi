/** Visual-only risk color mapping. Does not change scoring logic. */

export function severityBadgeClass(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical' || s === 'high') {
    return 'border-red-500/30 bg-red-500/10 text-red-400';
  }
  if (s === 'medium') {
    return 'border-orange-500/30 bg-orange-500/10 text-orange-400';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
}

export function heatmapBoxClass(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical' || s === 'high') {
    return 'border-red-500/80 bg-red-500/10';
  }
  if (s === 'medium') {
    return 'border-orange-400/80 bg-orange-500/10';
  }
  return 'border-emerald-500/80 bg-emerald-500/10';
}
