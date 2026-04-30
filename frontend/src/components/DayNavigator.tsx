import { useMemo, useRef, useState } from 'react'
import type { DaySummary } from '../api/hooks'

interface Props {
  days: DaySummary[]
  selectedMin: number
  selectedMax: number
  onSelect: (dayMin: number, dayMax: number) => void
}

// Viridis-ish ramp from "empty" (light gray) through cool → warm.
function scoreColor(score: number, hasData: boolean): string {
  if (!hasData) return '#efece2'
  const s = Math.max(0, Math.min(1, score))
  // light lavender → teal → warm gold
  const stops = [
    [239, 236, 226],
    [79, 126, 224],
    [11, 122, 117],
    [224, 169, 79],
  ]
  const t = s * (stops.length - 1)
  const i = Math.min(Math.floor(t), stops.length - 2)
  const f = t - i
  const a = stops[i]
  const b = stops[i + 1]
  const r = Math.round(a[0] + (b[0] - a[0]) * f)
  const g = Math.round(a[1] + (b[1] - a[1]) * f)
  const bl = Math.round(a[2] + (b[2] - a[2]) * f)
  return `rgb(${r},${g},${bl})`
}

function hasAnyData(d: DaySummary): boolean {
  return (
    (d.wear_fraction ?? 0) > 0 ||
    (d.step_total ?? 0) > 0 ||
    (d.amclass_n_classes ?? 0) > 0 ||
    (d.pulse_n ?? 0) > 0 ||
    d.sleep_present
  )
}

export default function DayNavigator({
  days,
  selectedMin,
  selectedMax,
  onSelect,
}: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<DaySummary | null>(null)
  const [drag, setDrag] = useState<{ anchor: number } | null>(null)

  const { bestActive, bestWear, bestSleep } = useMemo(() => {
    let bestActive: DaySummary | null = null
    let bestWear: DaySummary | null = null
    let bestSleep: DaySummary | null = null
    for (const d of days) {
      if ((d.step_total ?? 0) > (bestActive?.step_total ?? -1)) bestActive = d
      if ((d.wear_fraction ?? 0) > (bestWear?.wear_fraction ?? -1)) bestWear = d
      if (
        d.sleep_present &&
        (d.wear_fraction ?? 0) > (bestSleep?.wear_fraction ?? -1)
      )
        bestSleep = d
    }
    return { bestActive, bestWear, bestSleep }
  }, [days])

  function dayAtClientX(clientX: number): DaySummary | null {
    const node = stripRef.current
    if (!node || days.length === 0) return null
    const rect = node.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width - 1, clientX - rect.left))
    const idx = Math.floor((x / rect.width) * days.length)
    return days[Math.max(0, Math.min(days.length - 1, idx))]
  }

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-semibold text-verily-ink/80">Day navigator</span>
        <span className="text-verily-ink/50">
          {days.length > 0
            ? `${days.length} days · ${days[0].study_day} → ${days[days.length - 1].study_day}`
            : 'no data'}
        </span>
        <div className="ml-auto flex gap-1">
          <JumpButton
            label="Most active"
            day={bestActive}
            subtitle={bestActive ? `${Math.round(bestActive.step_total ?? 0)} steps` : undefined}
            onClick={() =>
              bestActive && onSelect(bestActive.study_day, bestActive.study_day)
            }
          />
          <JumpButton
            label="Best wear"
            day={bestWear}
            subtitle={
              bestWear?.wear_fraction != null
                ? `${Math.round(bestWear.wear_fraction * 100)}% wear`
                : undefined
            }
            onClick={() =>
              bestWear && onSelect(bestWear.study_day, bestWear.study_day)
            }
          />
          <JumpButton
            label="Best sleep"
            day={bestSleep}
            subtitle={
              bestSleep?.wear_fraction != null
                ? `${Math.round(bestSleep.wear_fraction * 100)}% wear`
                : undefined
            }
            onClick={() =>
              bestSleep && onSelect(bestSleep.study_day, bestSleep.study_day)
            }
          />
        </div>
      </div>

      <div
        ref={stripRef}
        className="relative h-[60px] w-full select-none overflow-hidden rounded-md border border-verily-mute bg-verily-mute/20"
        onMouseMove={(e) => setHover(dayAtClientX(e.clientX))}
        onMouseLeave={() => {
          setHover(null)
          setDrag(null)
        }}
        onMouseDown={(e) => {
          const d = dayAtClientX(e.clientX)
          if (!d) return
          setDrag({ anchor: d.study_day })
          onSelect(d.study_day, d.study_day)
        }}
        onMouseUp={(e) => {
          if (!drag) return
          const d = dayAtClientX(e.clientX)
          if (d) {
            const lo = Math.min(drag.anchor, d.study_day)
            const hi = Math.max(drag.anchor, d.study_day)
            onSelect(lo, hi)
          }
          setDrag(null)
        }}
      >
        {days.map((d, i) => {
          const left = `${(i / days.length) * 100}%`
          const width = `${(1 / days.length) * 100}%`
          const inSelection =
            d.study_day >= selectedMin && d.study_day <= selectedMax
          return (
            <div
              key={d.study_day}
              style={{
                position: 'absolute',
                left,
                width,
                top: 0,
                bottom: 0,
                background: scoreColor(d.score, hasAnyData(d)),
                borderRight:
                  days.length < 400 ? '1px solid rgba(255,255,255,0.35)' : undefined,
                boxShadow: inSelection ? 'inset 0 0 0 2px #1a1d1f' : undefined,
                opacity: inSelection ? 1 : 0.9,
              }}
            />
          )
        })}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 text-[10px] text-verily-ink/60"
        >
          {days.length > 0 ? (
            <>
              <span>day {days[0].study_day}</span>
              <span>day {days[days.length - 1].study_day}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-verily-ink/60">
        <div className="flex items-center gap-2">
          <span>Score</span>
          <div
            className="h-2 w-32 rounded"
            style={{
              background:
                'linear-gradient(to right, rgb(239,236,226), rgb(79,126,224), rgb(8,122,106), rgb(224,169,79))',
            }}
          />
          <span>low → high</span>
        </div>
        <div className="font-mono">
          {hover ? (
            <>
              day {hover.study_day} · wear {hover.wear_fraction != null ? `${Math.round(hover.wear_fraction * 100)}%` : '—'} ·
              {' '}steps {hover.step_total != null ? Math.round(hover.step_total) : '—'} ·
              {' '}classes {hover.amclass_n_classes ?? '—'} ·
              {' '}sleep {hover.sleep_present ? '✓' : '—'} ·
              {' '}score {hover.score.toFixed(2)}
            </>
          ) : (
            <span className="italic text-verily-ink/40">
              hover to inspect · click a day to jump · drag to select a range
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function JumpButton({
  label,
  day,
  subtitle,
  onClick,
}: {
  label: string
  day: DaySummary | null
  subtitle?: string
  onClick: () => void
}) {
  const disabled = !day
  return (
    <button
      className="btn-ghost flex flex-col items-start px-2 py-1 text-[11px] leading-tight disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={
        day
          ? `${label}: day ${day.study_day}${subtitle ? ` (${subtitle})` : ''}`
          : 'No candidate'
      }
    >
      <span className="font-medium text-verily-ink">{label}</span>
      <span className="text-verily-ink/50">
        {day ? `day ${day.study_day}` : '—'}
      </span>
    </button>
  )
}
