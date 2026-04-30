export interface FeatureMeta {
  id: string
  label: string
  group: string
  modality: string
  description: string
}

export interface FeatureCatalog {
  items: FeatureMeta[]
}

export interface FeatureComputeRequest {
  usubjid: string
  day_min: number
  day_max: number
  window_day_start?: number | null
  window_day_end?: number | null
  feature_ids: string[]
}

export interface FeatureResult {
  feature_id: string
  modality: string
  label: string
  values: Record<string, number | null>
  n_source_points: number
  error: string | null
}

export interface FeatureComputeResponse {
  usubjid: string
  window_day_start: number
  window_day_end: number
  results: FeatureResult[]
}
