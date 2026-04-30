export interface CohortFilter {
  sex?: string | null
  min_age?: number | null
  max_age?: number | null
  race?: string | null
  min_wear?: number | null
}

export interface CohortFeatureMeta {
  id: string
  label: string
  unit: string | null
  description: string
  modality: string
}

export interface CohortStratifier {
  id: string
  label: string
}

export interface CohortCatalog {
  features: CohortFeatureMeta[]
  stratifiers: CohortStratifier[]
}

export interface StratumStats {
  label: string
  n: number
  mean: number | null
  sd: number | null
  p25: number | null
  p50: number | null
  p75: number | null
  min: number | null
  max: number | null
}

export interface CohortRollupRequest {
  filters: CohortFilter
  feature: string
  stratifier: string
}

export interface CohortRollupResponse {
  feature: string
  feature_label: string
  feature_unit: string | null
  stratifier: string
  n_subjects: number
  groups: StratumStats[]
}

export interface PerSubjectRequest {
  filters: CohortFilter
  feature_x: string
  feature_y?: string | null
  stratifier?: string | null
}

export interface PerSubjectPoint {
  usubjid: string
  sex: string | null
  age_at_enrollment: number | null
  race: string | null
  stratum: string | null
  x: number | null
  y: number | null
}

export interface PerSubjectResponse {
  feature_x: string
  feature_x_label: string
  feature_x_unit: string | null
  feature_y: string | null
  feature_y_label: string | null
  feature_y_unit: string | null
  stratifier: string | null
  n: number
  points: PerSubjectPoint[]
}
