export const LABEL_OPTIONS = [
  'walking',
  'running',
  'rest',
  'sleep',
  'stress',
  'artifact',
  'custom',
] as const

export type LabelKind = (typeof LABEL_OPTIONS)[number]

export const LABEL_COLOR: Record<LabelKind, string> = {
  walking: '#087A6A',
  running: '#D35C65',
  rest: '#7AAD4E',
  sleep: '#4F7EE0',
  stress: '#E0A94F',
  artifact: '#7a7a7a',
  custom: '#A25BC5',
}

export interface LabelIn {
  usubjid: string
  study_day_start: number
  study_day_end: number
  label: LabelKind
  custom_label?: string | null
  notes?: string | null
}

export interface Label extends LabelIn {
  label_id: string
  user_email: string | null
  created_at: string
}

export interface LabelList {
  items: Label[]
}
