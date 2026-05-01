// Types mirror the FastAPI Pydantic schemas in backend/app/schemas/*.

export interface SubjectSummary {
  usubjid: string
  subjid: string | null
  age_at_enrollment: number | null
  sex: string | null
  race: string | null
  hispanic_ancestry: string | null
  wear_fraction_avg: number | null
  n_wear_segments: number | null
  study_day_min: number | null
  study_day_max: number | null
}

export interface SubjectDetail extends SubjectSummary {
  modalities: Record<string, boolean>
}

export interface SubjectListResponse {
  items: SubjectSummary[]
  total: number
  limit: number
  offset: number
}

export interface SignalPoint {
  t_ms: number
  study_day: number | null
  value: number | null
  label: string | null
}

export interface SignalSeries {
  modality: Modality
  usubjid: string
  study_day_min: number
  study_day_max: number
  downsampled_from: number | null
  points: SignalPoint[]
  units: string | null
  extra_values: Record<string, Array<number | null>> | null
}

export interface SignalsResponse {
  usubjid: string
  study_day_min: number
  study_day_max: number
  series: SignalSeries[]
}

export type Modality =
  | 'PULSE'
  | 'STEP'
  | 'HEMET'
  | 'AMCLASS'
  | 'SLPSTG'
  | 'SLPMET'
  | 'ANNOTATIONS'

export const ALL_MODALITIES: Modality[] = [
  'PULSE',
  'STEP',
  'HEMET',
  'AMCLASS',
  'SLPSTG',
  'SLPMET',
  'ANNOTATIONS',
]

export const MODALITY_LABEL: Record<Modality, string> = {
  PULSE: 'Heart rate',
  STEP: 'Steps',
  HEMET: 'Autonomic Health',
  AMCLASS: 'Activity class',
  SLPSTG: 'Sleep stage',
  SLPMET: 'Sleep efficiency',
  ANNOTATIONS: 'Wear fraction',
}

export const MODALITY_COLOR: Record<Modality, string> = {
  PULSE: '#087A6A',
  STEP: '#A25BC5',
  HEMET: '#D35C65',
  AMCLASS: '#E0A94F',
  SLPSTG: '#4F7EE0',
  SLPMET: '#4F7EE0',
  ANNOTATIONS: '#7a7a7a',
}

export const MODALITY_DESCRIPTION: Record<Modality, string> = {
  PULSE:
    'Heart rate (beats per minute) sampled sub-second by the wearable. Shown as a continuous line after bucket-averaging for the view.',
  STEP: 'Per-event step counts from the watch pedometer algorithm. Features calculated using validated Walking Suite Measures (WSM) with bout detection and cadence thresholds.',
  HEMET:
    'Autonomic health metrics: Resting heart rate (RHR), heart rate variability RMSSD, and SDNN index — one measurement per study day.',
  AMCLASS:
    'Algorithmically-classified activity state (e.g. walking, running, sedentary). Shown as a colored strip; each row is one detected segment.',
  SLPSTG:
    'Detected sleep stage (wake / light / deep / REM). One row per stage transition; duration is encoded in the data.',
  SLPMET:
    'Daily sleep summary: total sleep time, efficiency, WASO, awakenings, and stage fractions.',
  ANNOTATIONS:
    'Device wear segments with wear_fraction — used as a data-quality signal for every panel on this page.',
}

// Walking Suite Measures (WSM) constants
export const WSM_CONSTANTS = {
  BOUT_CADENCE_THRESHOLD: 0.6, // steps/second - minimum cadence for walking bout
  CADENCE_DOUBLING_THRESHOLD: 3.0, // steps/second - threshold for resonant doubling correction
  MINIMUM_BOUT_DURATION_SEC: 28, // seconds - minimum valid bout duration (30s - 2s buffer)
  MAXIMUM_BOUT_GAP_SEC: 22, // seconds - maximum gap to bridge bouts (20s + 2s buffer)
  LONG_BOUT_THRESHOLD_SEC: 118, // seconds - long bout definition (120s - 2s buffer)
  STEP_COUNT_SAMPLE_TIME_SEC: 10, // seconds - time representation per data point
}

export interface WSMDailyPoint {
  study_day: number
  total_steps: number
  ambulatory_minutes: number | null
  top_15min_cadence_sps: number | null
  top_30min_cadence_sps: number | null
  top_60min_cadence_sps: number | null
}

export interface WSMDailyResponse {
  usubjid: string
  study_day_min: number
  study_day_max: number
  daily_metrics: WSMDailyPoint[]
}
