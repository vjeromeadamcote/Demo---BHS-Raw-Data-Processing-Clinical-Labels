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
  // ── hr.hrv_approx
  'hr.hrv_approx.rmssd_mean': {
    label: 'RMSSD',
    unit: 'ms',
    description: 'Root mean square of successive RR differences from HEMET table. Higher values indicate greater parasympathetic activity.',
  },
  'hr.hrv_approx.sdnn_index': {
    label: 'SDNN index',
    unit: 'ms',
    description: 'Mean of 5-minute standard deviations of RR intervals from HEMET table.',
  },
  'hr.hrv_approx.rhr_mean': {
    label: 'Resting HR (mean)',
    unit: 'bpm',
    description: 'Mean resting heart rate across days in the window.',
  },
  'hr.hrv_approx.n_days': { label: 'Days', format: 'count', description: 'Number of days with HEMET data in the window.' },
  // ── step.walking_suite (WSM comprehensive features)
  'step.walking_suite.total_steps': { label: 'Total steps', unit: 'steps', format: 'count' },
  'step.walking_suite.ambulatory_minutes': {
    label: 'Ambulatory time',
    unit: 'min',
    description: 'Time spent in walking bouts (cadence ≥ 0.6 steps/sec).'
  },
  'step.walking_suite.representation_hours': {
    label: 'Data coverage',
    unit: 'hours',
    description: 'Total time represented by step data in the window.'
  },
  'step.walking_suite.top_15min_cadence_sps': {
    label: 'Top 15-min cadence',
    unit: 'steps/sec',
    description: 'Mean cadence of the highest 15 minutes of walking.'
  },
  'step.walking_suite.top_30min_cadence_sps': {
    label: 'Top 30-min cadence',
    unit: 'steps/sec',
    description: 'Mean cadence of the highest 30 minutes of walking.'
  },
  'step.walking_suite.top_60min_cadence_sps': {
    label: 'Top 60-min cadence',
    unit: 'steps/sec',
    description: 'Mean cadence of the highest 60 minutes of walking.'
  },
  'step.walking_suite.num_bouts': {
    label: 'Walking bouts',
    format: 'count',
    description: 'Number of continuous walking periods (≥28s duration, ≥0.6 steps/sec cadence).'
  },
  'step.walking_suite.total_bout_time_sec': {
    label: 'Total bout time',
    unit: 'sec',
    description: 'Cumulative duration of all walking bouts.'
  },
  'step.walking_suite.mean_bout_duration_sec': {
    label: 'Mean bout duration',
    unit: 'sec',
    description: 'Average duration of walking bouts.'
  },
  'step.walking_suite.median_bout_duration_sec': {
    label: 'Median bout duration',
    unit: 'sec',
    description: 'Median duration of walking bouts.'
  },
  'step.walking_suite.max_bout_duration_sec': {
    label: 'Longest bout',
    unit: 'sec',
    description: 'Duration of the longest walking bout.'
  },
  'step.walking_suite.num_long_bouts': {
    label: 'Long bouts (≥118s)',
    format: 'count',
    description: 'Number of walking bouts lasting at least 118 seconds.'
  },
  'step.walking_suite.mean_long_bout_cadence': {
    label: 'Mean long-bout cadence',
    unit: 'steps/sec',
    description: 'Average cadence during long bouts (≥118s).'
  },
  'step.walking_suite.num_bouts_30s_1min': {
    label: 'Bouts 30s–1min',
    format: 'count',
    description: 'Number of bouts between 30 seconds and 1 minute.'
  },
  'step.walking_suite.num_bouts_1min': {
    label: 'Bouts ≥1min',
    format: 'count',
    description: 'Number of bouts at least 1 minute long.'
  },
  'step.walking_suite.num_bouts_2min': {
    label: 'Bouts ≥2min',
    format: 'count',
    description: 'Number of bouts at least 2 minutes long.'
  },
  'step.walking_suite.num_bouts_5min': {
    label: 'Bouts ≥5min',
    format: 'count',
    description: 'Number of bouts at least 5 minutes long.'
  },
  'step.walking_suite.n_samples': {
    label: 'Total samples',
    format: 'count',
    description: 'Number of raw step data points in the window.'
  },
  'step.walking_suite.n_valid_samples': {
    label: 'Valid samples',
    format: 'count',
    description: 'Number of samples with step_count > 0 and step_interval > 0.'
  },
  // ── step.cadence
  'step.cadence.cadence_spm': {
    label: 'Mean cadence',
    unit: 'steps/min',
    description: 'Mean cadence using validated WSM calculation: step_count / (step_interval × 0.001). Applies bout threshold (≥0.6 steps/sec) and doubling correction (≥3.0 steps/sec).',
  },
  'step.cadence.cadence_mean_sps': {
    label: 'Mean cadence',
    unit: 'steps/sec',
    description: 'Mean cadence in steps per second.'
  },
  'step.cadence.n_events': { label: 'Step events', format: 'count' },
  'step.cadence.n_valid_events': { label: 'Valid events', format: 'count', description: 'Events after applying bout threshold filter.' },
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
