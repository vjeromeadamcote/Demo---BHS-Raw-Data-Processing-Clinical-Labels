import type { CohortFilter } from './cohorts'

// ── Saved cohorts ────────────────────────────────────────────────────────────

export interface SavedCohortIn {
  name: string
  description?: string | null
  filters: CohortFilter
}

export interface SavedCohort {
  cohort_id: string
  name: string
  description: string | null
  filter_json: string
  member_count: number
  user_email: string | null
  created_at: string
}

export interface SavedCohortDetail extends SavedCohort {
  members: string[]
}

export interface SavedCohortList {
  items: SavedCohort[]
}

// ── Feature runs ─────────────────────────────────────────────────────────────

export interface SaveFeatureRunIn {
  name: string
  description?: string | null
  usubjid: string
  day_min: number
  day_max: number
  window_day_start?: number | null
  window_day_end?: number | null
  feature_ids: string[]
}

export interface FeatureRunSummary {
  run_id: string
  name: string | null
  description: string | null
  usubjid: string
  study_day_start: number | null
  study_day_end: number | null
  n_features: number
  n_rows: number
  user_email: string | null
  created_at: string
}

export interface FeatureRunList {
  items: FeatureRunSummary[]
}

export interface FeatureRunValue {
  feature_id: string
  value_key: string
  value: number | null
}

export interface FeatureRunDetail extends FeatureRunSummary {
  values: FeatureRunValue[]
  params_json: string | null
  gcs_paths: string[]
}

// ── Feature sets ─────────────────────────────────────────────────────────────

export interface FeatureSetIn {
  name: string
  description?: string | null
  feature_ids: string[]
  params_json?: string | null
}

export interface FeatureSet {
  feature_set_id: string
  name: string
  description: string | null
  feature_ids: string[]
  params_json: string | null
  user_email: string | null
  created_at: string
}

export interface FeatureSetList {
  items: FeatureSet[]
}
