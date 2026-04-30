import { useEffect } from 'react'
import { ALL_MODALITIES, MODALITY_COLOR, MODALITY_DESCRIPTION, MODALITY_LABEL } from '../api/types'

interface Props {
  open: boolean
  onClose: () => void
}

export default function HelpPanel({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-x-0 top-0 h-full bg-verily-ink/40" />
      <div
        className="relative mx-auto mt-16 max-w-4xl rounded-lg border border-verily-mute bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Help & glossary</h2>
            <p className="text-xs text-verily-ink/60">
              Quick reference for terms, modalities, and navigation.
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Close (Esc)
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-verily-ink">Terms</h3>
            <dl className="space-y-2 text-sm">
              <DefEntry term="Study day">
                Days since this subject's enrollment. <code>0</code> = enrollment
                date; negative values are pre-enrollment baseline days; positive
                values are days after. Derived from <code>ENRDT</code>.
              </DefEntry>
              <DefEntry term="Wear fraction">
                Mean fraction of the time the wearable was on, aggregated from the
                ANNOTATIONS table. 100% = full-time wear; 0% = removed. Use this to
                prioritize data-quality subjects and days.
              </DefEntry>
              <DefEntry term="Study hour">
                X-axis of every signal panel. <code>study-hour = study_day × 24</code>{' '}
                so day 30 starts at hour 720. Not a clock time.
              </DefEntry>
              <DefEntry term="Downsampling">
                PULSE has sub-second cadence. For display we bucket-average to fit
                the viewport. Feature Lab always recomputes from the raw source.
              </DefEntry>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-verily-ink">Modalities</h3>
            <ul className="space-y-1.5 text-sm">
              {ALL_MODALITIES.map((m) => (
                <li key={m} className="flex gap-2">
                  <span
                    className="mt-1 inline-block h-3 w-3 flex-none rounded-sm"
                    style={{ background: MODALITY_COLOR[m] }}
                  />
                  <div>
                    <span className="font-medium text-verily-ink">
                      {MODALITY_LABEL[m]}
                    </span>
                    <span className="ml-1 font-mono text-[11px] text-verily-ink/40">
                      {m}
                    </span>
                    <div className="text-xs text-verily-ink/60">
                      {MODALITY_DESCRIPTION[m]}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-verily-ink">Quick tour</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-verily-ink/80">
              <li>
                <b>Subjects</b> — pick a well-wear subject from the filterable
                table. Clicking a row jumps to the Signal Explorer.
              </li>
              <li>
                <b>Signal Explorer</b> — zoomable stacked panels per modality. Use
                the <b>day navigator</b> strip to jump to active / high-wear / sleep
                days. Click-drag inside any panel to select a window.
              </li>
              <li>
                <b>Feature Lab</b> — pick metrics from the left menu and compute
                over your window. The <b>Compute features →</b> button in Signal
                Explorer carries over your selection.
              </li>
              <li>
                <b>Label a window</b> — click-drag a window in any Signal Explorer
                panel, pick a label in the Annotate sidebar, hit Save. Labels
                render as colored bands across all panels and persist in{' '}
                <code>biomarker_app.labels</code>.
              </li>
              <li>
                <b>Cohort Insights</b> — build a cohort with the filters, pick a
                subject-level metric + stratifier for a stratified distribution,
                or switch to feature × feature scatter for biomarker discovery.
              </li>
            </ol>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-verily-ink">
              Keyboard shortcuts
            </h3>
            <ul className="space-y-1 text-sm">
              <Shortcut keys="Esc" label="Close this panel / clear a pinned tooltip" />
              <Shortcut keys="Drag" label="Zoom + select a time window inside any Plotly panel (the range becomes the current selection for labeling / feature compute)" />
              <Shortcut keys="Double-click" label="Reset zoom / clear the current selection" />
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function DefEntry({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-verily-ink">{term}</dt>
      <dd className="text-verily-ink/70">{children}</dd>
    </div>
  )
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <code className="rounded bg-verily-mute/70 px-1.5 py-0.5 text-[11px] font-semibold">
        {keys}
      </code>
      <span className="text-verily-ink/70">{label}</span>
    </li>
  )
}
