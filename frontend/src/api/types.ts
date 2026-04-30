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
  'ANNOTATIONS',
]

export const MODALITY_LABEL: Record<Modality, string> = {
  PULSE: 'Heart rate',
  STEP: 'Steps',
  HEMET: 'HRV (daily)',
  AMCLASS: 'Activity class',
  SLPSTG: 'Sleep stage',
  SLPMET: 'Sleep metrics',
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
  STEP: 'Per-event step counts from the watch pedometer algorithm. Each point is one detected step or step burst.',
  HEMET:
    'Daily heart-rate-variability digest: resting HR, RMSSD, and SDNN index — one row per study day.',
  AMCLASS:
    'Algorithmically-classified activity state (e.g. walking, running, sedentary). Shown as a colored strip; each row is one detected segment.',
  SLPSTG:
    'Detected sleep stage (wake / light / deep / REM). One row per stage transition; duration is encoded in the data.',
  SLPMET:
    'Daily sleep summary: total sleep time, efficiency, WASO, awakenings, and stage fractions.',
  ANNOTATIONS:
    'Device wear segments with wear_fraction — used as a data-quality signal for every panel on this page.',
}
