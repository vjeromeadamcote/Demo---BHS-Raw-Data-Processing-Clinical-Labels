import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Layout, PlotData } from 'plotly.js'
import {
  useCohortCatalog,
  useCohortPerSubject,
  useCohortRollup,
  useDeleteCohort,
  useSaveCohort,
  useSavedCohorts,
} from '../api/hooks'
import type { CohortFilter, PerSubjectPoint, StratumStats } from '../api/cohorts'
import { downloadCsv } from '../api/download'
import { cohensDLabel, formatP, welchTest } from '../api/stats'
import InfoTip from '../components/InfoTip'
import PlotlyChart from '../components/PlotlyChart'
import SaveDialog from '../components/SaveDialog'

const DEFAULT_FILTERS: CohortFilter = {
  sex: null,
  min_age: null,
  max_age: null,
  race: null,
  min_wear: 0.3,
}

type ViewMode = 'stratified' | 'scatter'
type ChartKind = 'bar' | 'box'

const STRATIFIER_DESCRIPTION: Record<string, string> = {
  sex: 'Split by sex at enrollment (from screener.DM).',
  age_bin: 'Three age bins at enrollment: 18–45, 46–60, 61–90.',
  race: 'Self-reported race (from screener.DM).',
  phq9a_bin:
    'PHQ-9 depression severity, latest visit per subject. 0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 mod. severe, 20–27 severe.',
  gad7_bin:
    'GAD-7 anxiety severity, latest visit per subject. 0–4 minimal, 5–9 mild, 10–14 moderate, 15–21 severe.',
  ascvd_bin:
    '10-year ASCVD cardiovascular risk, latest computation. <5% low, 5–7.5% borderline, 7.5–20% intermediate, ≥20% high.',
}

export default function CohortInsights() {
  const catalog = useCohortCatalog()
  const rollup = useCohortRollup()
  const perSubject = useCohortPerSubject()
  const savedCohorts = useSavedCohorts()
  const saveCohort = useSaveCohort()
  const deleteCohort = useDeleteCohort()

  const [sp, setSp] = useSearchParams()
  const [saveCohortOpen, setSaveCohortOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  // Honor ?load=<cohort_id> from the My Work page.
  useEffect(() => {
    const loadId = sp.get('load')
    if (!loadId) return
    api
      .get(`cohorts/saved/${loadId}`)
      .then((r) => {
        try {
          const loaded = JSON.parse(r.data.filter_json) as CohortFilter
          setFilters({ ...DEFAULT_FILTERS, ...loaded })
          setFlash(
            `Loaded cohort "${r.data.name}" — ${r.data.member_count} subjects.`,
          )
        } catch {
          setFlash('Could not parse the saved filters.')
        }
      })
      .catch((e) => setFlash(`Load failed: ${e?.message ?? 'unknown'}`))
      .finally(() => {
        const next = new URLSearchParams(sp)
        next.delete('load')
        setSp(next, { replace: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [filters, setFilters] = useState<CohortFilter>(DEFAULT_FILTERS)
  const [featureX, setFeatureX] = useState<string>('mean_daily_steps')
  const [featureY, setFeatureY] = useState<string>('mean_rhr')
  const [stratifier, setStratifier] = useState<string>('sex')
  const [viewMode, setViewMode] = useState<ViewMode>('stratified')
  const [chartKind, setChartKind] = useState<ChartKind>('bar')
  const [showDots, setShowDots] = useState<boolean>(true)

  // Stratified-view data: rollup + per-subject (for strip dots).
  useEffect(() => {
    if (viewMode !== 'stratified') return
    rollup.mutate({ filters, feature: featureX, stratifier })
    perSubject.mutate({
      filters,
      feature_x: featureX,
      stratifier,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, featureX, stratifier, viewMode])

  // Scatter-view data: per-subject with x and y.
  useEffect(() => {
    if (viewMode !== 'scatter') return
    perSubject.mutate({
      filters,
      feature_x: featureX,
      feature_y: featureY,
      stratifier: stratifier,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, featureX, featureY, stratifier, viewMode])

  const featureXMeta = catalog.data?.features.find((f) => f.id === featureX)
  const featureYMeta = catalog.data?.features.find((f) => f.id === featureY)
  const stratGroups = useMemo(
    () => groupStratifiers(catalog.data?.stratifiers ?? []),
    [catalog.data],
  )

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Cohort Insights</h1>
        <InfoTip label="Cohort Insights">
          <p>
            Build a subject cohort with the filters and analyze subject-level
            features across strata or pairwise.
          </p>
          <p className="mt-1">
            Two views:{' '}
            <b>Stratified distribution</b> shows one feature split by a group,
            with strip-plot dots and Welch's t-test between the top two groups.{' '}
            <b>Feature × feature scatter</b> plots two features per subject,
            colored by a stratifier.
          </p>
        </InfoTip>

        {savedCohorts.data && savedCohorts.data.length > 0 ? (
          <select
            className="input text-xs"
            value=""
            onChange={(e) => {
              const sc = savedCohorts.data!.find((c) => c.cohort_id === e.target.value)
              if (!sc) return
              try {
                const loaded = JSON.parse(sc.filter_json) as CohortFilter
                setFilters({ ...DEFAULT_FILTERS, ...loaded })
                setFlash(`Loaded cohort "${sc.name}" — ${sc.member_count} subjects.`)
              } catch {
                setFlash(`Could not parse cohort "${sc.name}".`)
              }
            }}
          >
            <option value="">Saved cohorts ▾</option>
            {savedCohorts.data.map((c) => (
              <option key={c.cohort_id} value={c.cohort_id}>
                {c.name} ({c.member_count})
              </option>
            ))}
          </select>
        ) : null}

        <button
          className="btn-ghost text-xs"
          onClick={() => setSaveCohortOpen(true)}
          title="Save the current filter set as a named cohort"
        >
          💾 Save cohort
        </button>

        <div className="ml-4 inline-flex rounded-lg border border-verily-mute bg-white p-0.5">
          <ViewTab
            active={viewMode === 'stratified'}
            onClick={() => setViewMode('stratified')}
            label="Stratified distribution"
          />
          <ViewTab
            active={viewMode === 'scatter'}
            onClick={() => setViewMode('scatter')}
            label="Feature × feature scatter"
          />
        </div>

        <div className="ml-auto text-sm text-verily-ink/60">
          {rollup.data && viewMode === 'stratified'
            ? `${rollup.data.n_subjects} subjects in ${rollup.data.groups.length} groups`
            : perSubject.data && viewMode === 'scatter'
              ? `${perSubject.data.n} subjects`
              : rollup.isPending || perSubject.isPending
                ? 'computing…'
                : ''}
        </div>
      </div>

      <div className="grid grid-cols-[320px,1fr] gap-6">
        {/* Left: filters + pickers */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
              Cohort filters
            </div>
            <FilterBody filters={filters} setFilters={setFilters} />
            <button
              className="btn-ghost mt-2 text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Reset filters
            </button>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
              {viewMode === 'scatter' ? 'Metrics' : 'Metric & stratifier'}
            </div>

            <FeaturePicker
              label={viewMode === 'scatter' ? 'X feature' : 'Feature'}
              value={featureX}
              onChange={setFeatureX}
              options={catalog.data?.features ?? []}
              description={featureXMeta?.description}
            />

            {viewMode === 'scatter' ? (
              <FeaturePicker
                label="Y feature"
                value={featureY}
                onChange={setFeatureY}
                options={catalog.data?.features ?? []}
                description={featureYMeta?.description}
              />
            ) : null}

            <div className="mb-3 block text-sm">
              <div className="mb-1 flex items-center gap-1 text-xs text-verily-ink/60">
                <span>
                  {viewMode === 'scatter' ? 'Color dots by' : 'Stratify by'}
                </span>
                <InfoTip label="Stratifier">
                  {STRATIFIER_DESCRIPTION[stratifier] ?? ''}
                  <div className="mt-2 text-[11px] text-verily-ink/50">
                    Clinical stratifiers use the latest non-null score per subject.
                  </div>
                </InfoTip>
              </div>
              <select
                className="input w-full"
                value={stratifier}
                onChange={(e) => setStratifier(e.target.value)}
              >
                {Object.entries(stratGroups).map(([groupName, items]) => (
                  <optgroup key={groupName} label={groupName}>
                    {items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {viewMode === 'stratified' ? (
              <>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-verily-ink/60">
                  Chart style
                </div>
                <div className="mb-2 flex gap-2">
                  {(['bar', 'box'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setChartKind(k)}
                      className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium
                        ${
                          chartKind === k
                            ? 'border-verily-primary bg-verily-primary text-white'
                            : 'border-verily-mute text-verily-ink/60 hover:bg-verily-mute/40'
                        }`}
                    >
                      {k === 'bar' ? 'Bar + SD' : 'Box (IQR)'}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-verily-ink/70">
                  <input
                    type="checkbox"
                    className="accent-verily-primary"
                    checked={showDots}
                    onChange={(e) => setShowDots(e.target.checked)}
                  />
                  Overlay per-subject dots
                </label>
              </>
            ) : null}
          </div>
        </div>

        {/* Right: chart + details */}
        <div className="space-y-4">
          {flash ? (
            <div className="card border-verily-primary/40 bg-verily-primary/5 p-3 text-xs text-verily-primary">
              {flash}
            </div>
          ) : null}

          {/* Download buttons, visible as soon as there's data in either mode. */}
          {(rollup.data || perSubject.data) ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-verily-ink/60">Download:</span>
              {rollup.data ? (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    if (!rollup.data) return
                    downloadCsv(
                      `cohort_${rollup.data.feature}_by_${rollup.data.stratifier}.csv`,
                      rollup.data.groups.map((g) => ({
                        group: g.label,
                        n: g.n,
                        mean: g.mean,
                        sd: g.sd,
                        p25: g.p25,
                        median: g.p50,
                        p75: g.p75,
                        min: g.min,
                        max: g.max,
                        feature: rollup.data!.feature,
                        stratifier: rollup.data!.stratifier,
                      })),
                    )
                  }}
                >
                  ⬇ Stats CSV
                </button>
              ) : null}
              {perSubject.data ? (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    if (!perSubject.data) return
                    downloadCsv(
                      `cohort_per_subject_${perSubject.data.feature_x}.csv`,
                      perSubject.data.points.map((p) => ({
                        usubjid: p.usubjid,
                        sex: p.sex,
                        age_at_enrollment: p.age_at_enrollment,
                        race: p.race,
                        stratum: p.stratum,
                        x_value: p.x,
                        feature_x: perSubject.data!.feature_x,
                        y_value: p.y,
                        feature_y: perSubject.data!.feature_y,
                      })),
                    )
                  }}
                >
                  ⬇ Per-subject CSV
                </button>
              ) : null}
            </div>
          ) : null}

          {(rollup.error || perSubject.error) ? (
            <div className="card p-4 text-sm text-verily-warm">
              Error:{' '}
              {((rollup.error ?? perSubject.error) as Error)?.message ?? 'unknown'}
            </div>
          ) : null}

          {viewMode === 'stratified' ? (
            <StratifiedView
              rollupData={rollup.data}
              perSubjectPoints={perSubject.data?.points ?? []}
              showDots={showDots}
              chartKind={chartKind}
            />
          ) : (
            <ScatterView
              data={perSubject.data}
              xLabel={featureXMeta?.label ?? featureX}
              xUnit={featureXMeta?.unit ?? null}
              yLabel={featureYMeta?.label ?? featureY}
              yUnit={featureYMeta?.unit ?? null}
              stratifierLabel={stratifier}
            />
          )}
        </div>
      </div>

      <SaveDialog
        open={saveCohortOpen}
        title="Save cohort"
        description="Persists the current filter set as a named cohort. Members are materialized in biomarker_app.cohort_members so the list is stable even if the filters change."
        confirmLabel="Save cohort"
        pending={saveCohort.isPending}
        onClose={() => setSaveCohortOpen(false)}
        onConfirm={(name, description) => {
          saveCohort.mutate(
            { name, description: description || null, filters },
            {
              onSuccess: (data) => {
                setSaveCohortOpen(false)
                setFlash(`Saved cohort "${data.name}" with ${data.member_count} subjects.`)
              },
            },
          )
        }}
      />

      {/* Mark delete hook as "used" — actual delete UI lives on the My Work page. */}
      {deleteCohort.isIdle ? null : null}
    </div>
  )
}

function groupStratifiers(
  items: { id: string; label: string; group?: string }[],
): Record<string, { id: string; label: string }[]> {
  const out: Record<string, { id: string; label: string }[]> = {}
  for (const s of items) {
    const g = s.group ?? 'Other'
    ;(out[g] ??= []).push({ id: s.id, label: s.label })
  }
  return out
}

function ViewTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors
        ${
          active
            ? 'bg-verily-primary text-white'
            : 'text-verily-ink/70 hover:bg-verily-mute/60'
        }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function FilterBody({
  filters,
  setFilters,
}: {
  filters: CohortFilter
  setFilters: (f: CohortFilter) => void
}) {
  return (
    <>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-xs text-verily-ink/60">Sex</span>
        <select
          className="input w-full"
          value={filters.sex ?? ''}
          onChange={(e) => setFilters({ ...filters, sex: e.target.value || null })}
        >
          <option value="">Any</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
        </select>
      </label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-verily-ink/60">Min age</span>
          <input
            type="number"
            className="input w-full"
            value={filters.min_age ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                min_age: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-verily-ink/60">Max age</span>
          <input
            type="number"
            className="input w-full"
            value={filters.max_age ?? ''}
            onChange={(e) =>
              setFilters({
                ...filters,
                max_age: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
      </div>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-xs text-verily-ink/60">Race</span>
        <input
          type="text"
          className="input w-full"
          placeholder="e.g. White"
          value={filters.race ?? ''}
          onChange={(e) => setFilters({ ...filters, race: e.target.value || null })}
        />
      </label>
      <label className="mb-2 block text-sm">
        <span className="mb-1 flex items-center justify-between text-xs text-verily-ink/60">
          <span>Min wear fraction</span>
          <span className="font-mono">
            {((filters.min_wear ?? 0) * 100).toFixed(0)}%
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="w-full accent-verily-primary"
          value={filters.min_wear ?? 0}
          onChange={(e) =>
            setFilters({ ...filters, min_wear: Number(e.target.value) })
          }
        />
      </label>
    </>
  )
}

function FeaturePicker({
  label,
  value,
  onChange,
  options,
  description,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string; unit: string | null; description: string }[]
  description?: string
}) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block text-xs text-verily-ink/60">{label}</span>
      <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
            {f.unit ? ` (${f.unit})` : ''}
          </option>
        ))}
      </select>
      {description ? (
        <div className="mt-1 text-[11px] text-verily-ink/55">{description}</div>
      ) : null}
    </label>
  )
}

// ─── Stratified view ──────────────────────────────────────────────────────────

const PALETTE = [
  '#087A6A',
  '#A25BC5',
  '#D35C65',
  '#E0A94F',
  '#4F7EE0',
  '#7AAD4E',
  '#7a7a7a',
]

function StratifiedView({
  rollupData,
  perSubjectPoints,
  showDots,
  chartKind,
}: {
  rollupData: import('../api/cohorts').CohortRollupResponse | undefined
  perSubjectPoints: PerSubjectPoint[]
  showDots: boolean
  chartKind: ChartKind
}) {
  if (!rollupData) {
    return (
      <div className="card flex items-center justify-center p-16 text-sm text-verily-ink/50">
        Pick filters to render a rollup.
      </div>
    )
  }
  const orderedLabels = rollupData.groups.map((g) => g.label)
  const title = rollupData.feature_unit
    ? `${rollupData.feature_label} (${rollupData.feature_unit})`
    : rollupData.feature_label

  const traces: Partial<PlotData>[] = []

  if (chartKind === 'bar') {
    traces.push({
      type: 'bar',
      x: orderedLabels,
      y: rollupData.groups.map((g) => g.mean),
      error_y: {
        type: 'data',
        array: rollupData.groups.map((g) => g.sd ?? 0),
        visible: true,
        color: '#1a1a1a',
        thickness: 1.5,
      },
      text: rollupData.groups.map((g) => `n=${g.n}`),
      textposition: 'outside',
      marker: { color: '#087A6A', line: { color: '#065d52', width: 1 } },
      hovertemplate: '<b>%{x}</b><br>Mean: %{y:.2f}<br>%{text}<extra></extra>',
      name: 'Group mean ± SD',
    })
  } else {
    traces.push({
      type: 'box',
      // @ts-expect-error precomputed quartiles are supported
      q1: rollupData.groups.map((g) => g.p25 ?? 0),
      median: rollupData.groups.map((g) => g.p50 ?? 0),
      q3: rollupData.groups.map((g) => g.p75 ?? 0),
      lowerfence: rollupData.groups.map((g) => g.min ?? 0),
      upperfence: rollupData.groups.map((g) => g.max ?? 0),
      mean: rollupData.groups.map((g) => g.mean ?? 0),
      sd: rollupData.groups.map((g) => g.sd ?? 0),
      x: orderedLabels,
      text: rollupData.groups.map((g) => `n=${g.n}`),
      marker: { color: '#087A6A' },
      line: { color: '#065d52' },
      hovertemplate: '<b>%{x}</b><br>median %{median}<br>%{text}<extra></extra>',
      name: 'IQR',
    })
  }

  if (showDots) {
    const jittered = jitteredPoints(perSubjectPoints, orderedLabels)
    traces.push({
      type: 'scatter',
      mode: 'markers',
      x: jittered.x,
      y: jittered.y,
      text: jittered.text,
      marker: {
        color: 'rgba(26,26,26,0.65)',
        size: 5,
        line: { color: 'white', width: 1 },
      },
      hovertemplate: '%{text}<br>%{y:.2f}<extra></extra>',
      name: 'Subjects',
      showlegend: false,
    })
  }

  const layout: Partial<Layout> = {
    autosize: true,
    height: 380,
    margin: { l: 70, r: 20, t: 20, b: 50 },
    xaxis: {
      title: { text: 'Stratum', font: { size: 11 } },
      categoryorder: 'array',
      categoryarray: orderedLabels,
    },
    yaxis: { title: { text: title, font: { size: 11 } }, zeroline: chartKind === 'bar' },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    showlegend: false,
  }

  const ttest = computeTopTwoTest(rollupData.groups)

  return (
    <>
      <div className="card p-4">
        <div className="mb-2 flex items-baseline gap-2">
          <div className="text-sm font-semibold">
            {rollupData.feature_label}
            {rollupData.feature_unit ? (
              <span className="ml-1 text-xs font-normal text-verily-ink/50">
                ({rollupData.feature_unit})
              </span>
            ) : null}
          </div>
          <div className="text-xs text-verily-ink/50">
            by {rollupData.stratifier} · n = {rollupData.n_subjects}
          </div>
        </div>
        <PlotlyChart
          data={traces}
          layout={layout}
          config={{ displaylogo: false, responsive: true }}
          style={{ width: '100%', height: 380 }}
        />
      </div>

      {ttest ? (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
            <span>Group comparison</span>
            <InfoTip label="Welch's two-sample t-test">
              <p>
                Welch's t-test compares means between two independent groups
                without assuming equal variance. Cohen's d is the standardized
                mean difference (pooled SD).
              </p>
              <p className="mt-1">
                Rules of thumb: |d| &lt; 0.2 negligible; 0.2–0.5 small; 0.5–0.8
                medium; &gt; 0.8 large.
              </p>
              <p className="mt-1">
                Shown between the two groups with the largest N.
              </p>
            </InfoTip>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Stat label="Groups" value={`${ttest.a} vs ${ttest.b}`} />
            <Stat label="Mean difference" value={ttest.test.mean_diff.toFixed(3)} />
            <Stat
              label="Cohen's d"
              value={`${ttest.test.cohens_d.toFixed(3)} (${cohensDLabel(ttest.test.cohens_d)})`}
            />
            <Stat
              label={`Welch's t (df ≈ ${ttest.test.df.toFixed(1)})`}
              value={`${ttest.test.welch_t.toFixed(2)} · ${formatP(ttest.test.p_two_sided)}`}
              highlight={ttest.test.p_two_sided < 0.05}
            />
          </div>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-verily-mute/40 text-left text-[11px] uppercase tracking-wide text-verily-ink/60">
            <tr>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2 text-right">N</th>
              <th className="px-3 py-2 text-right">Mean</th>
              <th className="px-3 py-2 text-right">SD</th>
              <th className="px-3 py-2 text-right">p25</th>
              <th className="px-3 py-2 text-right">Median</th>
              <th className="px-3 py-2 text-right">p75</th>
              <th className="px-3 py-2 text-right">Min</th>
              <th className="px-3 py-2 text-right">Max</th>
            </tr>
          </thead>
          <tbody>
            {rollupData.groups.map((g) => (
              <tr key={g.label} className="border-t border-verily-mute">
                <td className="px-3 py-2 font-medium">{g.label}</td>
                <td className="px-3 py-2 text-right font-mono">{g.n}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.mean)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.sd)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.p25)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.p50)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.p75)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.min)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-verily-ink/55">{label}</span>
      <span
        className={`font-mono text-sm ${highlight ? 'font-semibold text-verily-primary' : 'text-verily-ink'}`}
      >
        {value}
      </span>
    </div>
  )
}

function computeTopTwoTest(groups: StratumStats[]) {
  if (groups.length < 2) return null
  const sorted = [...groups].sort((a, b) => b.n - a.n)
  const a = sorted[0]
  const b = sorted[1]
  const test = welchTest(
    { n: a.n, mean: a.mean, sd: a.sd },
    { n: b.n, mean: b.mean, sd: b.sd },
  )
  if (!test) return null
  return { a: a.label, b: b.label, test }
}

function jitteredPoints(
  points: PerSubjectPoint[],
  orderedLabels: string[],
): { x: (string | number)[]; y: (number | null)[]; text: string[] } {
  const x: string[] = []
  const y: (number | null)[] = []
  const text: string[] = []
  // Plotly categorical x works with the label string; small offset via jitter=0 (set visually below).
  for (const p of points) {
    if (!p.stratum) continue
    if (!orderedLabels.includes(p.stratum)) continue
    x.push(p.stratum)
    y.push(p.x)
    text.push(p.usubjid)
  }
  return { x, y, text }
}

// ─── Scatter view ─────────────────────────────────────────────────────────────

function ScatterView({
  data,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
  stratifierLabel,
}: {
  data: import('../api/cohorts').PerSubjectResponse | undefined
  xLabel: string
  xUnit: string | null
  yLabel: string
  yUnit: string | null
  stratifierLabel: string
}) {
  const { traces, layout, corr } = useMemo(() => {
    const points = (data?.points ?? []).filter((p) => p.x != null && p.y != null)
    const byStratum = new Map<string, PerSubjectPoint[]>()
    for (const p of points) {
      const k = p.stratum ?? 'all'
      if (!byStratum.has(k)) byStratum.set(k, [])
      byStratum.get(k)!.push(p)
    }
    const labels = [...byStratum.keys()].sort()
    const traces: Partial<PlotData>[] = labels.map((label, i) => {
      const pts = byStratum.get(label)!
      return {
        type: 'scatter',
        mode: 'markers',
        x: pts.map((p) => p.x),
        y: pts.map((p) => p.y),
        text: pts.map(
          (p) =>
            `${p.usubjid}<br>${p.sex ?? ''} age ${p.age_at_enrollment ?? '?'}`,
        ),
        marker: {
          color: PALETTE[i % PALETTE.length],
          size: 9,
          line: { color: 'white', width: 1 },
        },
        name: label,
        hovertemplate: '%{text}<br>x=%{x:.2f}<br>y=%{y:.2f}<extra></extra>',
      }
    })

    const xt = xUnit ? `${xLabel} (${xUnit})` : xLabel
    const yt = yUnit ? `${yLabel} (${yUnit})` : yLabel
    const layout: Partial<Layout> = {
      autosize: true,
      height: 480,
      margin: { l: 70, r: 20, t: 20, b: 55 },
      xaxis: { title: { text: xt, font: { size: 11 } }, zeroline: false },
      yaxis: { title: { text: yt, font: { size: 11 } }, zeroline: false },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1,
        font: { size: 11 },
      },
    }
    return { traces, layout, corr: pearson(points.map((p) => [p.x!, p.y!])) }
  }, [data, xLabel, xUnit, yLabel, yUnit])

  if (!data) {
    return (
      <div className="card flex items-center justify-center p-16 text-sm text-verily-ink/50">
        Loading scatter…
      </div>
    )
  }

  return (
    <>
      <div className="card p-4">
        <div className="mb-2 flex items-baseline gap-3">
          <div className="text-sm font-semibold">
            {yLabel} <span className="text-verily-ink/50">vs</span> {xLabel}
          </div>
          <div className="text-xs text-verily-ink/50">
            colored by {stratifierLabel} · n = {data.n}
          </div>
        </div>
        <PlotlyChart
          data={traces}
          layout={layout}
          config={{ displaylogo: false, responsive: true }}
          style={{ width: '100%', height: 480 }}
        />
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
          Correlation
          <InfoTip label="Pearson correlation">
            Pearson's r computed across all plotted subjects. +1 = perfect
            positive, 0 = uncorrelated, −1 = perfect negative. |r| &lt; 0.1
            typically treated as negligible; 0.1–0.3 small; 0.3–0.5 medium;
            &gt; 0.5 large.
          </InfoTip>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Stat label="n" value={String(data.n)} />
          <Stat
            label="Pearson r"
            value={corr == null ? '—' : corr.toFixed(3)}
            highlight={corr != null && Math.abs(corr) >= 0.3}
          />
          <Stat label="x" value={xLabel} />
          <Stat label="y" value={yLabel} />
        </div>
      </div>
    </>
  )
}

function pearson(pts: [number, number][]): number | null {
  if (pts.length < 3) return null
  const n = pts.length
  let sx = 0,
    sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  const mx = sx / n
  const my = sy / n
  let num = 0,
    dx = 0,
    dy = 0
  for (const [x, y] of pts) {
    const a = x - mx
    const b = y - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? null : num / denom
}

function fmt(n: number | null): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 1000) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(2)
  if (abs >= 0.01) return n.toFixed(3)
  return n.toExponential(2)
}
