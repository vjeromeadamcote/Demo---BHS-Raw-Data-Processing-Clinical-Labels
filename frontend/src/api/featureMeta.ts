// Friendly display metadata for each feature's sub-metrics. Keyed by
// `<feature_id>.<metric_key>`. Falls back to the raw key when nothing matches.

export interface MetricMeta {
  label: string
  unit?: string
  description?: string
  format?: 'percent' | 'count' | 'number'
}

const METRIC_META: Record<string, MetricMeta> = {
  // ── hr.summary
  'hr.summary.mean': { label: 'Mean HR', unit: 'bpm' },
  'hr.summary.median': { label: 'Median HR', unit: 'bpm' },
  'hr.summary.sd': { label: 'HR standard deviation', unit: 'bpm' },
  'hr.summary.cv': {
    label: 'Coefficient of variation',
    description: 'Standard deviation divided by the mean — a unit-less spread measure.',
  },
  'hr.summary.min': { label: 'Min HR', unit: 'bpm' },
  'hr.summary.max': { label: 'Max HR', unit: 'bpm' },
  // ── hr.zones
  'hr.zones.pct_0_60':   { label: '% time 0–60 bpm',    format: 'percent' },
  'hr.zones.pct_60_90':  { label: '% time 60–90 bpm',   format: 'percent' },
  'hr.zones.pct_90_120': { label: '% time 90–120 bpm',  format: 'percent' },
  'hr.zones.pct_120_150':{ label: '% time 120–150 bpm', format: 'percent' },
  'hr.zones.pct_150_220':{ label: '% time 150–220 bpm', format: 'percent' },
  // ── hr.hrv_approx
  'hr.hrv_approx.rmssd_approx': {
    label: 'RMSSD (approx)',
    unit: 'ms',
    description:
      'RMS of successive-RR differences, approximated from bpm → 60000/bpm. Higher = more parasympathetic activity.',
  },
  'hr.hrv_approx.sdnn_approx': {
    label: 'SDNN (approx)',
    unit: 'ms',
    description: 'Standard deviation of reconstructed RR intervals.',
  },
  'hr.hrv_approx.n': { label: 'Samples used', format: 'count' },
  // ── spectral.*
  'spectral.psd_summary.peak_freq_hz': { label: 'Peak frequency', unit: 'Hz' },
  'spectral.psd_summary.peak_power_db': { label: 'Peak power', unit: 'dB/Hz' },
  'spectral.psd_summary.n_samples': { label: 'Spectrum samples', format: 'count' },
  'spectral.band_0_02_0_2.power_linear': { label: 'Band power (linear)' },
  'spectral.band_0_02_0_2.power_db': { label: 'Band power', unit: 'dB/Hz' },
  'spectral.band_0_02_0_2.n_samples': { label: 'Samples', format: 'count' },
  'spectral.band_0_2_0_5.power_linear': { label: 'Band power (linear)' },
  'spectral.band_0_2_0_5.power_db': { label: 'Band power', unit: 'dB/Hz' },
  'spectral.band_0_2_0_5.n_samples': { label: 'Samples', format: 'count' },
  // ── step.summary
  'step.summary.total_steps':     { label: 'Total steps', unit: 'steps' },
  'step.summary.active_events':   { label: 'Active events', format: 'count', description: 'Sample points with step_count > 0.' },
  'step.summary.mean_event_size': { label: 'Mean event size', unit: 'steps' },
  'step.summary.max_event':       { label: 'Largest event', unit: 'steps' },
  // ── step.cadence
  'step.cadence.cadence_spm': {
    label: 'Cadence',
    unit: 'steps/min',
    description: '60000 ÷ median inter-event interval, computed within bursts (<5 s gap).',
  },
  'step.cadence.n_events': { label: 'Step events', format: 'count' },
  // ── activity.transitions
  'activity.transitions.n_transitions': {
    label: 'Class transitions',
    format: 'count',
    description: 'Count of AMCLASS rows where the class label changed vs. the previous row.',
  },
  'activity.transitions.n_classes': { label: 'Distinct classes', format: 'count' },
  // ── sleep.metrics
  'sleep.metrics.sleep_efficiency': {
    label: 'Sleep efficiency',
    format: 'percent',
    description: 'Sleep time ÷ time in bed, averaged over nights in the window.',
  },
  'sleep.metrics.n_nights': { label: 'Nights', format: 'count' },
}

export function metricMeta(featureId: string, key: string): MetricMeta {
  const exact = METRIC_META[`${featureId}.${key}`]
  if (exact) return exact
  // Fallbacks for dynamically-named metrics (activity.fractions, sleep.stage_fractions).
  if (key.startsWith('pct_')) {
    const rest = key.slice(4).replace(/_/g, ' ')
    return {
      label: `% time — ${rest}`,
      format: 'percent',
    }
  }
  return { label: key }
}

export function formatMetric(v: number | null | undefined, meta: MetricMeta): string {
  if (v == null || !isFinite(v as number)) return '—'
  const n = v as number
  if (meta.format === 'percent') return `${(n * 100).toFixed(1)}%`
  if (meta.format === 'count') return Number.isInteger(n) ? String(n) : n.toFixed(0)
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 100) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(3)
  if (abs >= 0.01) return n.toFixed(4)
  return n.toExponential(2)
}
