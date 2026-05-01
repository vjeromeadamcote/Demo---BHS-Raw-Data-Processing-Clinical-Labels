import { useMemo } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { LABEL_COLOR, type Label } from '../api/labels'
import type { SignalSeries } from '../api/types'
import { MODALITY_COLOR, MODALITY_DESCRIPTION, MODALITY_LABEL, WSM_CONSTANTS } from '../api/types'
import InfoTip from './InfoTip'
import PlotlyChart from './PlotlyChart'

// Units shown on hover + as y-axis title per modality.
const MODALITY_UNITS: Record<string, string> = {
  PULSE: 'bpm',
  STEP: 'steps',
  HEMET: 'bpm',
  ANNOTATIONS: 'wear fraction',
}

const MODALITY_Y_AXIS_TITLE: Record<string, string> = {
  PULSE: 'Heart rate (bpm)',
  STEP: 'Steps',
  HEMET: 'Autonomic Health',
  AMCLASS: 'Activity class',
  SLPSTG: 'Sleep stage',
  SLPMET: 'Sleep efficiency',
  ANNOTATIONS: 'Wear fraction',
}

// Convert our "virtual epoch-ms" (= study_day * 86400000 + ms_from_midnight) into
// fractional study-days for display. The x-axis is study-time, not calendar-time.
function toStudyDays(tMs: number): number {
  return tMs / 86_400_000
}

interface Props {
  series: SignalSeries
  height?: number
  sharedRange: [number, number] | null
  onRelayout: (range: [number, number] | null) => void
  selectedRange: [number, number] | null
  showXAxisTitle?: boolean  // Only render x-axis title on the bottom-most panel.
  labels?: Label[]          // Saved labels to render as colored overlays.
}

const CATEGORICAL_PALETTE = [
  '#087A6A',
  '#A25BC5',
  '#D35C65',
  '#E0A94F',
  '#4F7EE0',
  '#7AAD4E',
  '#7a7a7a',
]

export default function SignalPanel({
  series,
  height = 140,
  sharedRange,
  onRelayout,
  selectedRange,
  showXAxisTitle = false,
  labels = [],
}: Props) {
  // Special rendering for HEMET: two separate charts
  if (series.modality === 'HEMET') {
    return (
      <HEMETPanel
        series={series}
        height={height}
        sharedRange={sharedRange}
        onRelayout={onRelayout}
        selectedRange={selectedRange}
        showXAxisTitle={showXAxisTitle}
        labels={labels}
      />
    )
  }

  // Categorical ticks — remembered across trace/layout calcs so y-axis aligns with data.
  const categoricalTicks = useMemo(() => {
    if (series.modality !== 'AMCLASS' && series.modality !== 'SLPSTG') return null
    const labels = series.points
      .map((p) => p.label ?? 'unknown')
      .filter((l): l is string => typeof l === 'string')
    const uniq = Array.from(new Set(labels))
    return {
      tickvals: uniq.map((_, i) => i),
      ticktext: uniq,
      uniq,
    }
  }, [series])

  const traces = useMemo<Partial<PlotData>[]>(() => {
    if (series.points.length === 0) return []
    const color = MODALITY_COLOR[series.modality]
    const xs = series.points.map((p) => toStudyDays(p.t_ms))
    const unitSuffix = MODALITY_UNITS[series.modality] ?? ''

    if (categoricalTicks) {
      const { uniq } = categoricalTicks
      const labels = series.points.map((p) => p.label ?? 'unknown')
      return uniq.map<Partial<PlotData>>((label, i) => {
        const keptIdx: number[] = []
        labels.forEach((l, j) => {
          if (l === label) keptIdx.push(j)
        })
        return {
          x: keptIdx.map((j) => xs[j]),
          y: keptIdx.map(() => i),
          type: 'scatter',
          mode: 'markers',
          marker: {
            color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
            size: 7,
            symbol: 'square',
          },
          name: label,
          hovertemplate: `<b>${label}</b><br>Study day %{x:.2f}<extra></extra>`,
          showlegend: true,
        }
      })
    }

    const ys = series.points.map((p) => p.value)
    const primary: Partial<PlotData> = {
      x: xs,
      y: ys,
      type: 'scatter',
      mode: series.modality === 'ANNOTATIONS' ? 'markers' : 'lines',
      line: { color, width: 1.2 },
      marker: { color, size: 4 },
      hovertemplate: `<b>%{y:.2f}${unitSuffix ? ' ' + unitSuffix : ''}</b><br>Study day %{x:.2f}<extra></extra>`,
      showlegend: false,
    }
    return [primary]
  }, [series, categoricalTicks])

  const layout = useMemo<Partial<Layout>>(() => {
    // Saved label overlays — translucent colored rectangles sitting behind the data.
    const labelShapes = labels.map((l) => ({
      type: 'rect' as const,
      xref: 'x' as const,
      yref: 'paper' as const,
      x0: l.study_day_start,
      x1: l.study_day_end,
      y0: 0,
      y1: 1,
      fillcolor: LABEL_COLOR[l.label],
      opacity: 0.15,
      line: { color: LABEL_COLOR[l.label], width: 1 },
      layer: 'below' as const,
    }))
    const shapes = selectedRange
      ? [
          ...labelShapes,
          {
            type: 'rect' as const,
            xref: 'x' as const,
            yref: 'paper' as const,
            x0: selectedRange[0],
            x1: selectedRange[1],
            y0: 0,
            y1: 1,
            fillcolor: '#A25BC5',
            opacity: 0.12,
            line: { width: 0 },
          },
        ]
      : labelShapes
    const yTitle = MODALITY_Y_AXIS_TITLE[series.modality] ?? series.units ?? ''
    return {
      autosize: true,
      height,
      margin: {
        l: 100,
        r: 20,
        t: 4,
        b: showXAxisTitle ? 46 : 22,
      },
      showlegend: false,
      xaxis: {
        range: sharedRange ?? undefined,
        showgrid: true,
        gridcolor: '#eceae2',
        zeroline: false,
        title: showXAxisTitle
          ? {
              text: 'Study day (since enrollment day 0)',
              font: { size: 11, color: '#1a1d1f' },
            }
          : undefined,
      },
      yaxis: {
        title: yTitle
          ? { text: yTitle, font: { size: 10, color: '#1a1d1f' } }
          : undefined,
        showgrid: true,
        gridcolor: '#eceae2',
        zeroline: false,
        ...(categoricalTicks
          ? {
              tickmode: 'array' as const,
              tickvals: categoricalTicks.tickvals,
              ticktext: categoricalTicks.ticktext,
              tickfont: { size: 10 },
              range: [-0.5, Math.max(0.5, categoricalTicks.tickvals.length - 0.5)],
            }
          : {}),
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      // Drag = zoom-to-range. The new x-range flows through onRelayout → parent
      // setSelectedRange, so "select a window" and "zoom in" are the same action.
      // Double-click any panel to reset.
      dragmode: 'zoom',
      shapes,
    }
  }, [sharedRange, selectedRange, series.modality, series.units, height, showXAxisTitle, categoricalTicks, labels])

  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-verily-mute/60 bg-verily-paper/40 px-4 py-1.5 text-xs font-medium text-verily-ink/80">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: MODALITY_COLOR[series.modality] }}
        />
        <span>{MODALITY_LABEL[series.modality]}</span>
        <span className="font-mono text-[10px] text-verily-ink/40">
          {series.modality}
        </span>
        <InfoTip label={MODALITY_LABEL[series.modality]}>
          {MODALITY_DESCRIPTION[series.modality]}
        </InfoTip>
        {series.modality === 'STEP' && (
          <>
            <span className="text-[10px] text-verily-ink/40">· WSM validated</span>
            <InfoTip label="Walking Suite Measures (WSM) Constants">
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-verily-ink/90">Validated Thresholds:</p>
                <ul className="ml-3 space-y-0.5 font-mono text-[11px]">
                  <li>• Bout cadence threshold: {WSM_CONSTANTS.BOUT_CADENCE_THRESHOLD} steps/sec</li>
                  <li>• Doubling correction: ≥{WSM_CONSTANTS.CADENCE_DOUBLING_THRESHOLD} steps/sec</li>
                  <li>• Min bout duration: {WSM_CONSTANTS.MINIMUM_BOUT_DURATION_SEC}s</li>
                  <li>• Max bout gap: {WSM_CONSTANTS.MAXIMUM_BOUT_GAP_SEC}s</li>
                  <li>• Long bout threshold: {WSM_CONSTANTS.LONG_BOUT_THRESHOLD_SEC}s</li>
                  <li>• Sample time: {WSM_CONSTANTS.STEP_COUNT_SAMPLE_TIME_SEC}s</li>
                </ul>
              </div>
            </InfoTip>
          </>
        )}
        {series.points.length > 0 ? (
          <span className="text-[10px] text-verily-ink/50">
            · {series.points.length.toLocaleString()} pts
          </span>
        ) : null}
        {series.downsampled_from ? (
          <>
            <span className="text-[10px] text-verily-ink/40">· downsampled</span>
            <InfoTip label="Downsampled for display">
              The panel shows {series.points.length.toLocaleString()} bucket-averaged
              points drawn from {series.downsampled_from.toLocaleString()} raw
              samples in this window. Feature Lab recomputes from the raw source.
            </InfoTip>
          </>
        ) : null}
        {series.points.length === 0 ? (
          <span className="ml-auto text-[10px] italic text-verily-ink/40">
            no data in window
          </span>
        ) : null}
      </div>
      <PlotlyChart
        data={traces}
        layout={layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ['lasso2d', 'autoScale2d', 'toggleSpikelines'],
        }}
        style={{ width: '100%', height }}
        onRelayout={(ev) => {
          const x0 = ev['xaxis.range[0]']
          const x1 = ev['xaxis.range[1]']
          if (x0 !== undefined && x1 !== undefined) {
            const next: [number, number] = [Number(x0), Number(x1)]
            if (
              !sharedRange ||
              sharedRange[0] !== next[0] ||
              sharedRange[1] !== next[1]
            ) {
              onRelayout(next)
            }
          } else if (ev['xaxis.autorange'] && sharedRange !== null) {
            onRelayout(null)
          }
        }}
      />
    </div>
  )
}

// Special component for HEMET modality: renders two separate charts
function HEMETPanel({
  series,
  height = 140,
  sharedRange,
  onRelayout,
  selectedRange,
  showXAxisTitle = false,
  labels = [],
}: Props) {
  const xs = useMemo(() => series.points.map((p) => toStudyDays(p.t_ms)), [series.points])
  const rhrValues = useMemo(() => series.points.map((p) => p.value), [series.points])

  // Build label/selection shapes helper
  const buildShapes = (selectedRange: [number, number] | null) => {
    const labelShapes = labels.map((l) => ({
      type: 'rect' as const,
      xref: 'x' as const,
      yref: 'paper' as const,
      x0: l.study_day_start,
      x1: l.study_day_end,
      y0: 0,
      y1: 1,
      fillcolor: LABEL_COLOR[l.label],
      opacity: 0.15,
      line: { color: LABEL_COLOR[l.label], width: 1 },
      layer: 'below' as const,
    }))
    return selectedRange
      ? [
          ...labelShapes,
          {
            type: 'rect' as const,
            xref: 'x' as const,
            yref: 'paper' as const,
            x0: selectedRange[0],
            x1: selectedRange[1],
            y0: 0,
            y1: 1,
            fillcolor: '#A25BC5',
            opacity: 0.12,
            line: { width: 0 },
          },
        ]
      : labelShapes
  }

  // RHR Chart (top)
  const rhrTraces: Partial<PlotData>[] = useMemo(() => [{
    x: xs,
    y: rhrValues,
    type: 'scatter',
    mode: 'markers',
    marker: { color: '#D35C65', size: 6 },
    name: 'RHR',
    hovertemplate: '<b>RHR: %{y:.1f} bpm</b><br>Study day %{x:.2f}<extra></extra>',
    showlegend: false,
  }], [xs, rhrValues])

  const rhrLayout: Partial<Layout> = useMemo(() => ({
    autosize: true,
    height: height,
    margin: { l: 100, r: 20, t: 4, b: 22 },
    showlegend: false,
    xaxis: {
      range: sharedRange ?? undefined,
      showgrid: true,
      gridcolor: '#eceae2',
      zeroline: false,
      showticklabels: false,
    },
    yaxis: {
      title: { text: 'RHR (bpm)', font: { size: 10, color: '#1a1d1f' } },
      showgrid: true,
      gridcolor: '#eceae2',
      zeroline: false,
    },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    dragmode: 'zoom',
    shapes: buildShapes(selectedRange),
  }), [sharedRange, selectedRange, height, labels])

  // HRV Chart (bottom) - RMSSD and SDNN
  const hrvTraces: Partial<PlotData>[] = useMemo(() => {
    if (!series.extra_values) return []
    const traces: Partial<PlotData>[] = []

    if (series.extra_values.rmssd_mean) {
      traces.push({
        x: xs,
        y: series.extra_values.rmssd_mean,
        type: 'scatter',
        mode: 'markers',
        marker: { color: '#4F7EE0', size: 6, symbol: 'diamond' },
        name: 'RMSSD',
        hovertemplate: '<b>RMSSD: %{y:.1f} ms</b><br>Study day %{x:.2f}<extra></extra>',
        showlegend: true,
      })
    }

    if (series.extra_values.sdnn_index) {
      traces.push({
        x: xs,
        y: series.extra_values.sdnn_index,
        type: 'scatter',
        mode: 'markers',
        marker: { color: '#E0A94F', size: 6, symbol: 'diamond' },
        name: 'SDNN',
        hovertemplate: '<b>SDNN: %{y:.1f} ms</b><br>Study day %{x:.2f}<extra></extra>',
        showlegend: true,
      })
    }

    return traces
  }, [xs, series.extra_values])

  const hrvLayout: Partial<Layout> = useMemo(() => ({
    autosize: true,
    height: height,
    margin: { l: 100, r: 20, t: 4, b: showXAxisTitle ? 46 : 22 },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0.5,
      xanchor: 'center',
      y: 1.05,
      yanchor: 'bottom',
      font: { size: 10 },
    },
    xaxis: {
      range: sharedRange ?? undefined,
      showgrid: true,
      gridcolor: '#eceae2',
      zeroline: false,
      title: showXAxisTitle
        ? {
            text: 'Study day (since enrollment day 0)',
            font: { size: 11, color: '#1a1d1f' },
          }
        : undefined,
    },
    yaxis: {
      title: { text: 'HRV (ms)', font: { size: 10, color: '#1a1d1f' } },
      showgrid: true,
      gridcolor: '#eceae2',
      zeroline: false,
    },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    dragmode: 'zoom',
    shapes: buildShapes(selectedRange),
  }), [sharedRange, selectedRange, height, showXAxisTitle, labels])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-verily-mute/60 bg-verily-paper/40 px-4 py-1.5 text-xs font-medium text-verily-ink/80">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: MODALITY_COLOR.HEMET }}
        />
        <span>{MODALITY_LABEL.HEMET}</span>
        <span className="font-mono text-[10px] text-verily-ink/40">HEMET</span>
        <InfoTip label={MODALITY_LABEL.HEMET}>
          {MODALITY_DESCRIPTION.HEMET}
        </InfoTip>
        {series.points.length > 0 ? (
          <span className="text-[10px] text-verily-ink/50">
            · {series.points.length.toLocaleString()} pts
          </span>
        ) : null}
        {series.points.length === 0 ? (
          <span className="ml-auto text-[10px] italic text-verily-ink/40">
            no data in window
          </span>
        ) : null}
      </div>

      {/* RHR Chart */}
      <div className="border-b border-verily-mute/40">
        <div className="bg-verily-paper/20 px-4 py-1 text-[10px] font-medium uppercase tracking-wide text-verily-ink/50">
          Resting Heart Rate
        </div>
        <PlotlyChart
          data={rhrTraces}
          layout={rhrLayout}
          config={{
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ['lasso2d', 'autoScale2d', 'toggleSpikelines'],
          }}
          style={{ width: '100%', height }}
          onRelayout={(ev) => {
            const x0 = ev['xaxis.range[0]']
            const x1 = ev['xaxis.range[1]']
            if (x0 !== undefined && x1 !== undefined) {
              const next: [number, number] = [Number(x0), Number(x1)]
              if (
                !sharedRange ||
                sharedRange[0] !== next[0] ||
                sharedRange[1] !== next[1]
              ) {
                onRelayout(next)
              }
            } else if (ev['xaxis.autorange'] && sharedRange !== null) {
              onRelayout(null)
            }
          }}
        />
      </div>

      {/* HRV Chart */}
      <div>
        <div className="bg-verily-paper/20 px-4 py-1 text-[10px] font-medium uppercase tracking-wide text-verily-ink/50">
          Heart Rate Variability
        </div>
        <PlotlyChart
          data={hrvTraces}
          layout={hrvLayout}
          config={{
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ['lasso2d', 'autoScale2d', 'toggleSpikelines'],
          }}
          style={{ width: '100%', height }}
          onRelayout={(ev) => {
            const x0 = ev['xaxis.range[0]']
            const x1 = ev['xaxis.range[1]']
            if (x0 !== undefined && x1 !== undefined) {
              const next: [number, number] = [Number(x0), Number(x1)]
              if (
                !sharedRange ||
                sharedRange[0] !== next[0] ||
                sharedRange[1] !== next[1]
              ) {
                onRelayout(next)
              }
            } else if (ev['xaxis.autorange'] && sharedRange !== null) {
              onRelayout(null)
            }
          }}
        />
      </div>
    </div>
  )
}
