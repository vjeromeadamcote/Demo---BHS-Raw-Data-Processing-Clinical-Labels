import { useEffect, useRef } from 'react'
import type { Layout, PlotData, PlotRelayoutEvent } from 'plotly.js'

// Minimal React wrapper around the Plotly UMD global (window.Plotly, loaded via
// <script> in index.html). Written this way to dodge the ESM interop bugs that
// break react-plotly.js under Vite/rolldown.

type PlotlyInstance = {
  newPlot: (
    el: HTMLElement,
    data: Partial<PlotData>[],
    layout?: Partial<Layout>,
    config?: Partial<Plotly.Config>,
  ) => Promise<unknown>
  react: (
    el: HTMLElement,
    data: Partial<PlotData>[],
    layout?: Partial<Layout>,
    config?: Partial<Plotly.Config>,
  ) => Promise<unknown>
  purge: (el: HTMLElement) => void
  Plots: { resize: (el: HTMLElement) => void }
}

function getPlotly(): PlotlyInstance | null {
  return (globalThis as unknown as { Plotly?: PlotlyInstance }).Plotly ?? null
}

export interface PlotlyChartProps {
  data: Partial<PlotData>[]
  layout: Partial<Layout>
  config?: Partial<Plotly.Config>
  style?: React.CSSProperties
  onRelayout?: (event: Readonly<PlotRelayoutEvent>) => void
}

export default function PlotlyChart({
  data,
  layout,
  config,
  style,
  onRelayout,
}: PlotlyChartProps) {
  const el = useRef<HTMLDivElement | null>(null)
  const relayoutRef = useRef(onRelayout)
  relayoutRef.current = onRelayout

  // Initial mount — create plot + wire events + resize observer.
  useEffect(() => {
    const node = el.current
    const plotly = getPlotly()
    if (!node || !plotly) return
    let cancelled = false

    plotly.newPlot(node, data, layout, config).then(() => {
      if (cancelled || !node) return
      const handler = (ev: Plotly.PlotRelayoutEvent) => {
        relayoutRef.current?.(ev)
      }
      // @ts-expect-error Plotly attaches .on() to the DOM node at runtime
      node.on?.('plotly_relayout', handler)
    })

    const ro = new ResizeObserver(() => {
      if (node) plotly.Plots.resize(node)
    })
    ro.observe(node)

    return () => {
      cancelled = true
      ro.disconnect()
      if (node) plotly.purge(node)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update on data/layout change — Plotly.react is a fast diff-update.
  useEffect(() => {
    const node = el.current
    const plotly = getPlotly()
    if (!node || !plotly) return
    plotly.react(node, data, layout, config)
  }, [data, layout, config])

  if (!getPlotly()) {
    return (
      <div className="px-4 py-6 text-xs text-verily-warm">
        Plotly failed to load from <code>plotly.min.js</code>. Check that the
        script is served at the app root.
      </div>
    )
  }

  return <div ref={el} style={style} />
}
