import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDaySummary, useLabels, useSignals, useSubject, useSubjects, useWSMDaily } from '../api/hooks'
import AnnotationSidebar from '../components/AnnotationSidebar'
import DayNavigator from '../components/DayNavigator'
import InfoTip from '../components/InfoTip'
import type { Modality } from '../api/types'
import { ALL_MODALITIES, MODALITY_DESCRIPTION, MODALITY_LABEL } from '../api/types'
import SignalPanel from '../components/SignalPanel'
import { TotalStepsPanel, AmbulatoryMinutesPanel, TopCadencePanel } from '../components/WSMPanels'

export default function SignalExplorer() {
  const { usubjid: urlUsubjid } = useParams<{ usubjid: string }>()
  const nav = useNavigate()

  const { data: subjectsData } = useSubjects({ limit: 200 })
  const [usubjid, setUsubjid] = useState<string | null>(urlUsubjid ?? null)

  useEffect(() => {
    if (urlUsubjid) setUsubjid(urlUsubjid)
  }, [urlUsubjid])

  const subject = useSubject(usubjid)
  const defaultDay = useMemo(() => {
    if (!subject.data?.study_day_min) return 0
    // Pick a middle-of-range day to bias toward populated windows.
    const { study_day_min: a, study_day_max: b } = subject.data
    if (a == null || b == null) return 0
    return Math.floor((a + b) / 4) // early-middle
  }, [subject.data])

  const [dayMin, setDayMin] = useState<number>(defaultDay)
  const [dayMax, setDayMax] = useState<number>(defaultDay)
  const [modalities, setModalities] = useState<Modality[]>(ALL_MODALITIES)
  const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null)
  const [sharedRange, setSharedRange] = useState<[number, number] | null>(null)

  useEffect(() => {
    setDayMin(defaultDay)
    setDayMax(defaultDay)
    setSelectedRange(null)
    setSharedRange(null)
  }, [usubjid, defaultDay])

  const signals = useSignals({
    usubjid,
    dayMin,
    dayMax,
    modalities,
    targetPoints: 2500,
  })

  const wsmDaily = useWSMDaily({
    usubjid,
    dayMin,
    dayMax,
  })

  const daySummary = useDaySummary(usubjid)
  const savedLabels = useLabels(usubjid)

  // Labels overlapping the currently-viewed day window.
  const visibleLabels = useMemo(() => {
    if (!savedLabels.data) return []
    return savedLabels.data.filter(
      (l) => l.study_day_end >= dayMin && l.study_day_start <= dayMax + 1,
    )
  }, [savedLabels.data, dayMin, dayMax])

  function jumpToLabel(dayStart: number, dayEnd: number) {
    const lo = Math.floor(dayStart)
    const hi = Math.max(lo, Math.floor(dayEnd))
    setDayMin(lo)
    setDayMax(hi)
    setSelectedRange([dayStart, dayEnd])
    setSharedRange([dayStart, dayEnd])
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      {/* Top bar */}
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
              nav(`/explorer/${encodeURIComponent(v)}`, { replace: true })
            }}
          >
            <option value="">— pick a subject —</option>
            {subjectsData?.items.map((s) => (
              <option key={s.usubjid} value={s.usubjid}>
                {s.usubjid} · {s.sex?.[0]} · age {s.age_at_enrollment} · wear{' '}
                {((s.wear_fraction_avg ?? 0) * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-1">
          <DayInput label="Study day (start)" value={dayMin} onChange={setDayMin} />
          <div className="mb-2">
            <InfoTip label="Study day">
              <p>
                Study day 0 = enrollment date for this subject. Negative values are
                pre-enrollment; positive values are days after enrollment.
              </p>
              <p className="mt-1">
                Inclusive range. Wider ranges are downsampled to keep panels
                responsive; use the day navigator below to find populated days.
              </p>
            </InfoTip>
          </div>
        </div>
        <DayInput label="Study day (end)" value={dayMax} onChange={setDayMax} />

        <div className="flex items-end gap-2">
          {[1, 3, 7].map((n) => (
            <button
              key={n}
              className="btn-ghost text-xs"
              onClick={() => setDayMax(dayMin + n - 1)}
            >
              +{n}d
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-verily-ink/60">
          {subject.data ? (
            <>
              available days {subject.data.study_day_min} →{' '}
              {subject.data.study_day_max} · wear{' '}
              {((subject.data.wear_fraction_avg ?? 0) * 100).toFixed(0)}%
            </>
          ) : null}
        </div>
      </div>

      {/* Day navigator */}
      {usubjid ? (
        <div className="mb-4">
          {daySummary.isLoading ? (
            <div className="card p-3 text-xs text-verily-ink/50">
              Scanning this subject's days…
            </div>
          ) : daySummary.data && daySummary.data.days.length > 0 ? (
            <DayNavigator
              days={daySummary.data.days}
              selectedMin={dayMin}
              selectedMax={dayMax}
              onSelect={(lo, hi) => {
                setDayMin(lo)
                setDayMax(hi)
                setSelectedRange(null)
                setSharedRange(null)
              }}
            />
          ) : null}
        </div>
      ) : null}

      {/* Modality toggles */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs uppercase tracking-wide text-verily-ink/60">
          Modalities
        </span>
        {ALL_MODALITIES.map((m) => {
          const on = modalities.includes(m)
          return (
            <button
              key={m}
              onClick={() =>
                setModalities(
                  on
                    ? modalities.filter((x) => x !== m)
                    : [...modalities, m]
                )
              }
              title={MODALITY_DESCRIPTION[m]}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors
                ${on
                  ? 'border-verily-primary bg-verily-primary text-white'
                  : 'border-verily-mute text-verily-ink/60 hover:bg-verily-mute/40'
                }`}
            >
              {MODALITY_LABEL[m]}
            </button>
          )
        })}
        <div className="ml-auto text-xs text-verily-ink/60">
          {signals.isFetching
            ? 'loading…'
            : signals.data
              ? `${signals.data.series.reduce((a, s) => a + s.points.length, 0).toLocaleString()} points`
              : ''}
        </div>
      </div>

      {/* Panels + annotation sidebar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {signals.error ? (
            <div className="card p-4 text-sm text-verily-warm">
              <div className="font-semibold">Signal fetch failed</div>
              <div className="mt-1 whitespace-pre-wrap font-mono text-xs text-verily-ink/70">
                {(signals.error as Error)?.message ?? String(signals.error)}
              </div>
            </div>
          ) : null}

          {!usubjid ? (
            <EmptyHint text="Select a subject to load signals." />
          ) : signals.isLoading ? (
            <EmptyHint text="Loading signals…" />
          ) : signals.data?.series.length === 0 ? (
            <EmptyHint text="No modalities selected." />
          ) : (
            <div className="card overflow-hidden">
              {signals.data?.series.map((s, i, arr) => (
                <div
                  key={s.modality}
                  className={i > 0 ? 'border-t border-verily-mute' : ''}
                >
                  <SignalPanel
                    series={s}
                    sharedRange={sharedRange}
                    selectedRange={selectedRange}
                    showXAxisTitle={i === arr.length - 1}
                    labels={visibleLabels}
                    onRelayout={(range) => {
                      setSharedRange(range)
                      // Range is already in fractional study_day
                      if (range) {
                        setSelectedRange([range[0], range[1]])
                      } else {
                        setSelectedRange(null)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* WSM Daily Metrics */}
          {usubjid && wsmDaily.data && wsmDaily.data.daily_metrics.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="border-b border-verily-mute/60 bg-verily-paper px-4 py-2 text-sm font-semibold text-verily-ink">
                Walking Suite Measures (Daily Aggregates)
              </div>
              <div className="border-t border-verily-mute">
                <TotalStepsPanel
                  data={wsmDaily.data}
                  sharedRange={sharedRange}
                  selectedRange={selectedRange}
                  onRelayout={(range) => {
                    setSharedRange(range)
                    if (range) {
                      setSelectedRange([range[0], range[1]])
                    } else {
                      setSelectedRange(null)
                    }
                  }}
                />
              </div>
              <div className="border-t border-verily-mute">
                <AmbulatoryMinutesPanel
                  data={wsmDaily.data}
                  sharedRange={sharedRange}
                  selectedRange={selectedRange}
                  onRelayout={(range) => {
                    setSharedRange(range)
                    if (range) {
                      setSelectedRange([range[0], range[1]])
                    } else {
                      setSelectedRange(null)
                    }
                  }}
                />
              </div>
              <div className="border-t border-verily-mute">
                <TopCadencePanel
                  data={wsmDaily.data}
                  sharedRange={sharedRange}
                  selectedRange={selectedRange}
                  showXAxisTitle={true}
                  onRelayout={(range) => {
                    setSharedRange(range)
                    if (range) {
                      setSelectedRange([range[0], range[1]])
                    } else {
                      setSelectedRange(null)
                    }
                  }}
                />
              </div>
            </div>
          ) : null}

          {selectedRange ? (
            <div className="card p-4 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wide text-verily-ink/60">
                Selected window
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-xs text-verily-ink/50">Study-day range</div>
                  <div className="font-mono">
                    {selectedRange[0].toFixed(3)} → {selectedRange[1].toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-verily-ink/50">Duration</div>
                  <div className="font-mono">
                    {((selectedRange[1] - selectedRange[0]) * 24 * 60).toFixed(1)} min
                  </div>
                </div>
                <div className="ml-auto">
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setSelectedRange(null)
                      setSharedRange(null)
                    }}
                  >
                    Clear selection
                  </button>
                  <button
                    className="btn-primary ml-2"
                    disabled={!usubjid}
                    onClick={() => {
                      if (!usubjid) return
                      const q = new URLSearchParams({
                        day_min: String(dayMin),
                        day_max: String(dayMax),
                        win_start: selectedRange[0].toFixed(5),
                        win_end: selectedRange[1].toFixed(5),
                      })
                      nav(`/features/${encodeURIComponent(usubjid)}?${q.toString()}`)
                    }}
                  >
                    Compute features →
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <AnnotationSidebar
          usubjid={usubjid}
          selectedRange={selectedRange}
          onClearSelection={() => {
            setSelectedRange(null)
            setSharedRange(null)
          }}
          onJumpTo={jumpToLabel}
        />
      </div>
    </div>
  )
}

function DayInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
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
        onChange={(e) => onChange(Number(e.target.value))}
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
