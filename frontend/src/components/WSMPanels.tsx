import { useMemo } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import type { WSMDailyResponse } from '../api/types'
import PlotlyChart from './PlotlyChart'
import InfoTip from './InfoTip'

interface Props {
  data: WSMDailyResponse
  height?: number
  sharedRange: [number, number] | null
  onRelayout: (range: [number, number] | null) => void
  selectedRange: [number, number] | null
  showXAxisTitle?: boolean
}

export function TotalStepsPanel({
  data,
  height = 140,
  sharedRange,
  onRelayout,
  selectedRange,
  showXAxisTitle = false,
}: Props) {
  const traces = useMemo<Partial<PlotData>[]>(() => {
    const xs = data.daily_metrics.map((d) => d.study_day)
    const ys = data.daily_metrics.map((d) => d.total_steps)

    return [
      {
        x: xs,
        y: ys,
        type: 'bar',
        marker: { color: '#A25BC5' },
        hovertemplate: '<b>%{y:,.0f} steps</b><br>Study day %{x}<extra></extra>',
        showlegend: false,
      },
    ]
  }, [data])

  const layout = useMemo<Partial<Layout>>(() => {
    const shapes = selectedRange
      ? [
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
      : []

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
        title: { text: 'Total steps', font: { size: 10, color: '#1a1d1f' } },
        showgrid: true,
        gridcolor: '#eceae2',
        zeroline: false,
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      dragmode: 'zoom',
      shapes,
    }
  }, [sharedRange, selectedRange, height, showXAxisTitle])

  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-verily-mute/60 bg-verily-paper/40 px-4 py-1.5 text-xs font-medium text-verily-ink/80">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#A25BC5' }} />
        <span>Total Steps (daily)</span>
        <InfoTip label="Total Steps">
          Daily step count aggregated from validated Walking Suite Measures. Shows total steps
          detected per study day.
        </InfoTip>
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
            if (!sharedRange || sharedRange[0] !== next[0] || sharedRange[1] !== next[1]) {
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

export function AmbulatoryMinutesPanel({
  data,
  height = 140,
  sharedRange,
  onRelayout,
  selectedRange,
  showXAxisTitle = false,
}: Props) {
  const traces = useMemo<Partial<PlotData>[]>(() => {
    const xs = data.daily_metrics.map((d) => d.study_day)
    const ys = data.daily_metrics.map((d) => d.ambulatory_minutes ?? 0)

    return [
      {
        x: xs,
        y: ys,
        type: 'bar',
        marker: { color: '#087A6A' },
        hovertemplate: '<b>%{y:.1f} min</b><br>Study day %{x}<extra></extra>',
        showlegend: false,
      },
    ]
  }, [data])

  const layout = useMemo<Partial<Layout>>(() => {
    const shapes = selectedRange
      ? [
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
      : []

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
        title: { text: 'Ambulatory time (min)', font: { size: 10, color: '#1a1d1f' } },
        showgrid: true,
        gridcolor: '#eceae2',
        zeroline: false,
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      dragmode: 'zoom',
      shapes,
    }
  }, [sharedRange, selectedRange, height, showXAxisTitle])

  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-verily-mute/60 bg-verily-paper/40 px-4 py-1.5 text-xs font-medium text-verily-ink/80">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#087A6A' }} />
        <span>Ambulatory Minutes (daily)</span>
        <InfoTip label="Ambulatory Minutes">
          Time spent in walking bouts per day (cadence ≥ 0.6 steps/sec, bout duration ≥ 28s).
          Validated Walking Suite Measures.
        </InfoTip>
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
            if (!sharedRange || sharedRange[0] !== next[0] || sharedRange[1] !== next[1]) {
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

export function TopCadencePanel({
  data,
  height = 140,
  sharedRange,
  onRelayout,
  selectedRange,
  showXAxisTitle = false,
}: Props) {
  const traces = useMemo<Partial<PlotData>[]>(() => {
    const xs = data.daily_metrics.map((d) => d.study_day)

    return [
      {
        x: xs,
        y: data.daily_metrics.map((d) => (d.top_15min_cadence_sps ?? 0) * 60),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Top 15 min',
        line: { color: '#D35C65', width: 2 },
        marker: { color: '#D35C65', size: 6 },
        hovertemplate: '<b>Top 15min: %{y:.1f} steps/min</b><br>Study day %{x}<extra></extra>',
      },
      {
        x: xs,
        y: data.daily_metrics.map((d) => (d.top_30min_cadence_sps ?? 0) * 60),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Top 30 min',
        line: { color: '#E0A94F', width: 2 },
        marker: { color: '#E0A94F', size: 6 },
        hovertemplate: '<b>Top 30min: %{y:.1f} steps/min</b><br>Study day %{x}<extra></extra>',
      },
      {
        x: xs,
        y: data.daily_metrics.map((d) => (d.top_60min_cadence_sps ?? 0) * 60),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Top 60 min',
        line: { color: '#4F7EE0', width: 2 },
        marker: { color: '#4F7EE0', size: 6 },
        hovertemplate: '<b>Top 60min: %{y:.1f} steps/min</b><br>Study day %{x}<extra></extra>',
      },
    ]
  }, [data])

  const layout = useMemo<Partial<Layout>>(() => {
    const shapes = selectedRange
      ? [
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
      : []

    return {
      autosize: true,
      height,
      margin: {
        l: 100,
        r: 20,
        t: 4,
        b: showXAxisTitle ? 46 : 22,
      },
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
        title: { text: 'Cadence (steps/min)', font: { size: 10, color: '#1a1d1f' } },
        showgrid: true,
        gridcolor: '#eceae2',
        zeroline: false,
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      dragmode: 'zoom',
      shapes,
    }
  }, [sharedRange, selectedRange, height, showXAxisTitle])

  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-verily-mute/60 bg-verily-paper/40 px-4 py-1.5 text-xs font-medium text-verily-ink/80">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#D35C65' }} />
        <span>Top Cadence Windows (daily)</span>
        <InfoTip label="Top Cadence Windows">
          Peak cadence for 15, 30, and 60-minute windows per day. Mean cadence of the highest N
          minutes of walking. Validated Walking Suite Measures.
        </InfoTip>
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
            if (!sharedRange || sharedRange[0] !== next[0] || sharedRange[1] !== next[1]) {
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
