import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useComputeFeatures,
  useFeatureCatalog,
  useFeatureSets,
  useSaveFeatureRun,
  useSaveFeatureSet,
  useSubject,
  useSubjects,
} from '../api/hooks'
import type { FeatureMeta, FeatureResult } from '../api/features'
import { formatMetric, metricMeta } from '../api/featureMeta'
import { downloadCsv } from '../api/download'
import InfoTip from '../components/InfoTip'
import SaveDialog from '../components/SaveDialog'

export default function FeatureLab() {
  const { usubjid: urlUsubjid } = useParams<{ usubjid: string }>()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()

  const { data: subjectsData } = useSubjects({ limit: 200 })
  const [usubjid, setUsubjid] = useState<string | null>(urlUsubjid ?? null)
  useEffect(() => {
    if (urlUsubjid) setUsubjid(urlUsubjid)
  }, [urlUsubjid])
  const subject = useSubject(usubjid)

  const catalog = useFeatureCatalog()
  const compute = useComputeFeatures()
  const saveRun = useSaveFeatureRun()
  const saveSet = useSaveFeatureSet()
  const featureSets = useFeatureSets()

  const [saveRunOpen, setSaveRunOpen] = useState(false)
  const [saveSetOpen, setSaveSetOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  // Day range + optional fractional sub-window (from Signal Explorer).
  const [dayMin, setDayMin] = useState<number>(Number(sp.get('day_min') ?? 0))
  const [dayMax, setDayMax] = useState<number>(Number(sp.get('day_max') ?? 0))
  const [winStart, setWinStart] = useState<string>(sp.get('win_start') ?? '')
  const [winEnd, setWinEnd] = useState<string>(sp.get('win_end') ?? '')

  useEffect(() => {
    // Default day window to subject midpoint when no query params set.
    if (!sp.get('day_min') && subject.data?.study_day_min != null && subject.data?.study_day_max != null) {
      const mid = Math.floor((subject.data.study_day_min + subject.data.study_day_max) / 4)
      setDayMin(mid)
      setDayMax(mid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.data?.usubjid])

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // Default selection: one feature per group when catalog first loads.
  useEffect(() => {
    if (!catalog.data || selected.size > 0) return
    const groupSeen = new Set<string>()
    const picks: string[] = []
    for (const f of catalog.data.items) {
      if (!groupSeen.has(f.group)) {
        groupSeen.add(f.group)
        picks.push(f.id)
      }
    }
    setSelected(new Set(picks))
  }, [catalog.data, selected.size])

  const grouped = useMemo(() => {
    const g: Record<string, FeatureMeta[]> = {}
    if (!catalog.data) return g
    for (const f of catalog.data.items) {
      ;(g[f.group] ??= []).push(f)
    }
    return g
  }, [catalog.data])

  function runCompute() {
    if (!usubjid || selected.size === 0) return
    compute.mutate({
      usubjid,
      day_min: dayMin,
      day_max: dayMax,
      window_day_start: winStart ? Number(winStart) : null,
      window_day_end: winEnd ? Number(winEnd) : null,
      feature_ids: [...selected],
    })
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-verily-ink/60">
            Subject
          </label>
          <select
            className="input min-w-[320px] font-mono text-xs"
            value={usubjid ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setUsubjid(v)
              nav(`/features/${encodeURIComponent(v)}`, { replace: true })
            }}
          >
            <option value="">— pick a subject —</option>
            {subjectsData?.items.map((s) => (
              <option key={s.usubjid} value={s.usubjid}>
                {s.usubjid} · {s.sex?.[0]} · age {s.age_at_enrollment}
              </option>
            ))}
          </select>
        </div>
        <NumField label="Study day (start)" value={dayMin} setValue={setDayMin} />
        <NumField label="Study day (end)" value={dayMax} setValue={setDayMax} />
        <StrField
          label="Window start (frac. day)"
          value={winStart}
          setValue={setWinStart}
          placeholder="optional"
        />
        <StrField
          label="Window end (frac. day)"
          value={winEnd}
          setValue={setWinEnd}
          placeholder="optional"
        />
        <div className="ml-auto flex gap-2">
          <button
            className="btn-ghost"
            onClick={() => {
              setWinStart('')
              setWinEnd('')
              setSp({})
            }}
          >
            Clear window
          </button>
          <button
            className="btn-primary"
            disabled={!usubjid || selected.size === 0 || compute.isPending}
            onClick={runCompute}
          >
            {compute.isPending ? 'Computing…' : `Compute (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[320px,1fr] gap-6">
        {/* Left: feature menu */}
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-verily-ink/60">
            <span>Feature menu</span>
            <span className="text-verily-ink/40 normal-case">
              ({selected.size} selected)
            </span>
          </div>
          {featureSets.data && featureSets.data.length > 0 ? (
            <label className="mb-3 block text-xs">
              <span className="mb-1 block text-verily-ink/60">
                Load saved feature set
              </span>
              <select
                className="input w-full"
                value=""
                onChange={(e) => {
                  const fs = featureSets.data!.find(
                    (x) => x.feature_set_id === e.target.value,
                  )
                  if (fs) {
                    setSelected(new Set(fs.feature_ids))
                    setFlash(`Loaded feature set "${fs.name}" (${fs.feature_ids.length} features).`)
                  }
                }}
              >
                <option value="">— pick a saved set —</option>
                {featureSets.data.map((fs) => (
                  <option key={fs.feature_set_id} value={fs.feature_set_id}>
                    {fs.name} ({fs.feature_ids.length})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {catalog.isLoading ? (
            <div className="text-sm text-verily-ink/50">loading…</div>
          ) : null}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-3">
              <div className="mb-1 text-xs font-semibold text-verily-ink/70">
                {group}
              </div>
              {items.map((f) => {
                const on = selected.has(f.id)
                return (
                  <label
                    key={f.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs
                      ${on ? 'bg-verily-primary/10' : 'hover:bg-verily-mute/30'}`}
                    title={f.description}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-verily-primary"
                      checked={on}
                      onChange={() => {
                        const n = new Set(selected)
                        if (on) n.delete(f.id)
                        else n.add(f.id)
                        setSelected(n)
                      }}
                    />
                    <span className="flex-1">
                      <div className="font-medium text-verily-ink">{f.label}</div>
                      <div className="text-[11px] text-verily-ink/50">
                        {f.modality}
                      </div>
                    </span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>

        {/* Right: results */}
        <div>
          {compute.error ? (
            <div className="card mb-4 p-4 text-sm text-verily-warm">
              Error: {(compute.error as Error).message}
            </div>
          ) : null}
          {!compute.data && !compute.isPending ? (
            <EmptyHint
              text={
                !usubjid
                  ? 'Pick a subject above to start computing features.'
                  : 'Select a day range and features, then hit Compute. Tip: click "Compute features →" from Signal Explorer to carry over a zoomed window.'
              }
            />
          ) : null}
          {compute.isPending ? (
            <EmptyHint text="Computing features…" />
          ) : null}
          {compute.data ? (
            <div className="space-y-3">
              <div className="card flex flex-wrap items-center gap-3 p-3 text-xs">
                <div className="text-verily-ink/60">
                  USUBJID <span className="font-mono">{compute.data.usubjid}</span> · window{' '}
                  study-day {compute.data.window_day_start.toFixed(3)} →{' '}
                  {compute.data.window_day_end.toFixed(3)}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => {
                      if (!compute.data) return
                      const rows: Record<string, unknown>[] = []
                      for (const r of compute.data.results) {
                        for (const [k, v] of Object.entries(r.values)) {
                          rows.push({
                            usubjid: compute.data.usubjid,
                            feature_id: r.feature_id,
                            value_key: k,
                            value: v,
                            window_day_start: compute.data.window_day_start,
                            window_day_end: compute.data.window_day_end,
                          })
                        }
                      }
                      downloadCsv(`features_${compute.data.usubjid}.csv`, rows)
                    }}
                  >
                    ⬇ Download CSV
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setSaveSetOpen(true)}
                    disabled={selected.size === 0}
                    title="Save the current feature selection as a reusable bundle"
                  >
                    ★ Save as feature set
                  </button>
                  <button
                    className="btn-primary text-xs"
                    onClick={() => setSaveRunOpen(true)}
                    disabled={!usubjid}
                  >
                    💾 Save run
                  </button>
                </div>
              </div>
              {flash ? (
                <div className="card border-verily-primary/40 bg-verily-primary/5 p-3 text-xs text-verily-primary">
                  {flash}
                </div>
              ) : null}
              {compute.data.results.map((r) => {
                const meta = catalog.data?.items.find((m) => m.id === r.feature_id)
                return <FeatureCard key={r.feature_id} result={r} meta={meta} />
              })}
            </div>
          ) : null}

          <SaveDialog
            open={saveRunOpen}
            title="Save feature run"
            description="Persists every computed metric to BigQuery and writes a Parquet to GCS for notebook import."
            defaultName={
              usubjid ? `${usubjid} · days ${dayMin}–${dayMax}` : ''
            }
            confirmLabel="Save run"
            pending={saveRun.isPending}
            onClose={() => setSaveRunOpen(false)}
            onConfirm={(name, description) => {
              if (!usubjid) return
              saveRun.mutate(
                {
                  name,
                  description: description || null,
                  usubjid,
                  day_min: dayMin,
                  day_max: dayMax,
                  window_day_start: winStart ? Number(winStart) : null,
                  window_day_end: winEnd ? Number(winEnd) : null,
                  feature_ids: [...selected],
                },
                {
                  onSuccess: (data) => {
                    setSaveRunOpen(false)
                    setFlash(`Saved run "${data.name}" — ${data.n_rows} metrics across ${data.n_features} features. Available in My Work › Feature runs.`)
                  },
                },
              )
            }}
          />
          <SaveDialog
            open={saveSetOpen}
            title="Save feature set"
            description="Saves the currently-checked features as a reusable bundle you can load later."
            confirmLabel="Save set"
            pending={saveSet.isPending}
            onClose={() => setSaveSetOpen(false)}
            onConfirm={(name, description) => {
              saveSet.mutate(
                {
                  name,
                  description: description || null,
                  feature_ids: [...selected],
                },
                {
                  onSuccess: (data) => {
                    setSaveSetOpen(false)
                    setFlash(`Saved feature set "${data.name}" with ${data.feature_ids.length} features.`)
                  },
                },
              )
            }}
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  result,
  meta,
}: {
  result: FeatureResult
  meta?: FeatureMeta
}) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <div className="text-sm font-semibold text-verily-ink">{result.label}</div>
        <div className="text-[11px] uppercase tracking-wide text-verily-ink/50">
          {result.modality} · {result.n_source_points.toLocaleString()} pts
        </div>
        <div className="ml-auto font-mono text-[10px] text-verily-ink/40">
          {result.feature_id}
        </div>
      </div>
      {meta?.description ? (
        <div className="mb-3 text-xs text-verily-ink/60">{meta.description}</div>
      ) : null}
      {result.error ? (
        <div className="text-sm text-verily-warm">
          Error: <code>{result.error}</code>
        </div>
      ) : Object.keys(result.values).length === 0 ? (
        <div className="text-xs italic text-verily-ink/50">no values returned</div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(result.values).map(([k, v]) => {
            const m = metricMeta(result.feature_id, k)
            return (
              <div key={k} className="flex flex-col">
                <div className="flex items-center gap-1 text-[11px] text-verily-ink/60">
                  <span>
                    {m.label}
                    {m.unit ? (
                      <span className="ml-1 text-verily-ink/40">({m.unit})</span>
                    ) : null}
                  </span>
                  {m.description ? (
                    <InfoTip label={m.label}>{m.description}</InfoTip>
                  ) : null}
                </div>
                <span className="font-mono text-sm text-verily-ink">
                  {formatMetric(v, m)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NumField({
  label,
  value,
  setValue,
}: {
  label: string
  value: number
  setValue: (n: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-wide text-verily-ink/60">
        {label}
      </span>
      <input
        type="number"
        className="input w-24"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </label>
  )
}

function StrField({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string
  value: string
  setValue: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-wide text-verily-ink/60">
        {label}
      </span>
      <input
        type="text"
        className="input w-32"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="card flex items-center justify-center p-16 text-sm text-verily-ink/50">
      {text}
    </div>
  )
}
