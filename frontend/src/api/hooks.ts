import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  CohortCatalog,
  CohortRollupRequest,
  CohortRollupResponse,
  PerSubjectRequest,
  PerSubjectResponse,
} from './cohorts'
import type { Label, LabelIn, LabelList } from './labels'
import type {
  ExportList,
  ExportRecord,
  ExportRowsIn,
  SignedUrl,
} from './exports'
import type {
  FeatureRunDetail,
  FeatureRunList,
  FeatureRunSummary,
  FeatureSet,
  FeatureSetIn,
  FeatureSetList,
  SaveFeatureRunIn,
  SavedCohort,
  SavedCohortDetail,
  SavedCohortIn,
  SavedCohortList,
} from './saved'
import type {
  FeatureCatalog,
  FeatureComputeRequest,
  FeatureComputeResponse,
} from './features'
import type {
  Modality,
  SignalsResponse,
  SubjectDetail,
  SubjectListResponse,
  WSMDailyResponse,
} from './types'

export function useSubjects(params: {
  limit?: number
  sex?: string
  minAge?: number
  maxAge?: number
  minWear?: number
}) {
  return useQuery({
    queryKey: ['subjects', params],
    queryFn: async () => {
      const r = await api.get<SubjectListResponse>('subjects', {
        params: {
          limit: params.limit ?? 50,
          sex: params.sex || undefined,
          min_age: params.minAge,
          max_age: params.maxAge,
          min_wear: params.minWear,
        },
      })
      return r.data
    },
    staleTime: 60_000,
  })
}

export function useSubject(usubjid: string | null) {
  return useQuery({
    queryKey: ['subject', usubjid],
    enabled: !!usubjid,
    queryFn: async () => {
      const r = await api.get<SubjectDetail>(`subjects/${usubjid}`)
      return r.data
    },
    staleTime: 60_000,
  })
}

export interface DaySummary {
  study_day: number
  wear_fraction: number | null
  step_total: number | null
  amclass_n_classes: number | null
  pulse_n: number | null
  sleep_present: boolean
  score: number
}

export interface DaySummaryResponse {
  usubjid: string
  day_min: number
  day_max: number
  days: DaySummary[]
}

export function useDaySummary(
  usubjid: string | null,
  dayMin?: number | null,
  dayMax?: number | null,
) {
  return useQuery({
    queryKey: ['day-summary', usubjid, dayMin, dayMax],
    enabled: !!usubjid,
    queryFn: async () => {
      const r = await api.get<DaySummaryResponse>(
        `subjects/${usubjid}/day-summary`,
        { params: { day_min: dayMin ?? undefined, day_max: dayMax ?? undefined } },
      )
      return r.data
    },
    staleTime: 5 * 60_000,
  })
}

export function useFeatureCatalog() {
  return useQuery({
    queryKey: ['features', 'catalog'],
    queryFn: async () => (await api.get<FeatureCatalog>('features/catalog')).data,
    staleTime: 5 * 60_000,
  })
}

export function useComputeFeatures() {
  return useMutation({
    mutationFn: async (req: FeatureComputeRequest) =>
      (await api.post<FeatureComputeResponse>('features/compute', req)).data,
  })
}

export function useCohortCatalog() {
  return useQuery({
    queryKey: ['cohorts', 'catalog'],
    queryFn: async () => (await api.get<CohortCatalog>('cohorts/catalog')).data,
    staleTime: 5 * 60_000,
  })
}

export function useCohortRollup() {
  return useMutation({
    mutationFn: async (req: CohortRollupRequest) =>
      (await api.post<CohortRollupResponse>('cohorts/rollup', req)).data,
  })
}

export function useCohortPerSubject() {
  return useMutation({
    mutationFn: async (req: PerSubjectRequest) =>
      (await api.post<PerSubjectResponse>('cohorts/per-subject', req)).data,
  })
}

export function useLabels(usubjid: string | null) {
  return useQuery({
    queryKey: ['labels', usubjid],
    enabled: !!usubjid,
    queryFn: async () =>
      (await api.get<LabelList>(`labels/${usubjid}`)).data.items,
    staleTime: 30_000,
  })
}

export function useCreateLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: LabelIn) =>
      (await api.post<Label>('labels', body)).data,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['labels', vars.usubjid] }),
  })
}

export function useDeleteLabel(usubjid: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (labelId: string) =>
      (await api.delete<{ deleted: string }>(`labels/${labelId}`)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['labels', usubjid] }),
  })
}

// ── Saved cohorts ────────────────────────────────────────────────────────────

export function useSavedCohorts() {
  return useQuery({
    queryKey: ['cohorts', 'saved'],
    queryFn: async () => (await api.get<SavedCohortList>('cohorts/saved')).data.items,
    staleTime: 30_000,
  })
}

export function useSavedCohort(cohortId: string | null) {
  return useQuery({
    queryKey: ['cohorts', 'saved', cohortId],
    enabled: !!cohortId,
    queryFn: async () =>
      (await api.get<SavedCohortDetail>(`cohorts/saved/${cohortId}`)).data,
    staleTime: 30_000,
  })
}

export function useSaveCohort() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: SavedCohortIn) =>
      (await api.post<SavedCohort>('cohorts/save', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohorts', 'saved'] }),
  })
}

export function useDeleteCohort() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cohortId: string) =>
      (await api.delete<{ deleted: string }>(`cohorts/saved/${cohortId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohorts', 'saved'] }),
  })
}

// ── Saved feature runs ───────────────────────────────────────────────────────

export function useFeatureRuns(usubjid?: string | null) {
  return useQuery({
    queryKey: ['features', 'runs', usubjid ?? null],
    queryFn: async () =>
      (await api.get<FeatureRunList>('features/runs', {
        params: { usubjid: usubjid ?? undefined },
      })).data.items,
    staleTime: 30_000,
  })
}

export function useFeatureRun(runId: string | null) {
  return useQuery({
    queryKey: ['features', 'runs', 'detail', runId],
    enabled: !!runId,
    queryFn: async () =>
      (await api.get<FeatureRunDetail>(`features/runs/${runId}`)).data,
    staleTime: 30_000,
  })
}

export function useSaveFeatureRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: SaveFeatureRunIn) =>
      (await api.post<FeatureRunSummary>('features/save', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['features', 'runs'] }),
  })
}

export function useDeleteFeatureRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) =>
      (await api.delete<{ deleted: string }>(`features/runs/${runId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['features', 'runs'] }),
  })
}

// ── Feature sets ─────────────────────────────────────────────────────────────

export function useFeatureSets() {
  return useQuery({
    queryKey: ['feature-sets'],
    queryFn: async () =>
      (await api.get<FeatureSetList>('feature-sets')).data.items,
    staleTime: 30_000,
  })
}

export function useSaveFeatureSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: FeatureSetIn) =>
      (await api.post<FeatureSet>('feature-sets', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-sets'] }),
  })
}

export function useDeleteFeatureSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ deleted: string }>(`feature-sets/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-sets'] }),
  })
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function useExports(kind?: string) {
  return useQuery({
    queryKey: ['exports', kind ?? 'all'],
    queryFn: async () =>
      (await api.get<ExportList>('exports', { params: { kind } })).data.items,
    staleTime: 30_000,
  })
}

export function useCreateExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ExportRowsIn) =>
      (await api.post<ExportRecord>('exports', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exports'] }),
  })
}

export async function fetchSignedUrl(exportId: string): Promise<SignedUrl> {
  return (await api.get<SignedUrl>(`exports/${exportId}/signed-url`)).data
}

export function useSignals(opts: {
  usubjid: string | null
  dayMin: number
  dayMax: number
  modalities: Modality[]
  targetPoints?: number
}) {
  const { usubjid, dayMin, dayMax, modalities, targetPoints = 2000 } = opts
  return useQuery({
    queryKey: ['signals', usubjid, dayMin, dayMax, modalities, targetPoints],
    enabled: !!usubjid && modalities.length > 0 && dayMax >= dayMin,
    queryFn: async () => {
      const r = await api.get<SignalsResponse>(`signals/${usubjid}`, {
        params: {
          day_min: dayMin,
          day_max: dayMax,
          modalities,
          target_points: targetPoints,
        },
        paramsSerializer: { indexes: null },
      })
      return r.data
    },
    staleTime: 5 * 60_000,
  })
}

export function useWSMDaily(opts: {
  usubjid: string | null
  dayMin: number
  dayMax: number
}) {
  const { usubjid, dayMin, dayMax } = opts
  return useQuery({
    queryKey: ['wsm-daily', usubjid, dayMin, dayMax],
    enabled: !!usubjid && dayMax >= dayMin,
    queryFn: async () => {
      const r = await api.get<WSMDailyResponse>(`wsm/${usubjid}`, {
        params: {
          day_min: dayMin,
          day_max: dayMax,
        },
      })
      return r.data
    },
    staleTime: 5 * 60_000,
  })
}
