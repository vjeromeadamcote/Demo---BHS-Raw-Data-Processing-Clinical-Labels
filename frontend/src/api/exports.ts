export type ExportKind = 'labels' | 'subjects' | 'cohort_rollup' | 'feature_run' | 'scatter' | 'other'

export interface ExportRowsIn {
  kind: ExportKind
  filename_hint: string
  format: 'csv' | 'parquet'
  rows: Record<string, unknown>[]
  source_ids?: Record<string, unknown> | null
  params?: Record<string, unknown> | null
}

export interface ExportRecord {
  export_id: string
  kind: string
  gcs_path: string
  format: string
  row_count: number | null
  size_bytes: number | null
  params_json: string | null
  source_ids: string | null
  user_email: string | null
  created_at: string
}

export interface ExportList {
  items: ExportRecord[]
}

export interface SignedUrl {
  export_id: string
  gcs_path: string
  url: string
  expires_in: number
}
