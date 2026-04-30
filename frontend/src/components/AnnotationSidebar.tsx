import { useState } from 'react'
import { useCreateLabel, useDeleteLabel, useLabels } from '../api/hooks'
import { downloadCsv } from '../api/download'
import {
  LABEL_COLOR,
  LABEL_OPTIONS,
  type Label,
  type LabelKind,
} from '../api/labels'
import InfoTip from './InfoTip'

interface Props {
  usubjid: string | null
  selectedRange: [number, number] | null
  onClearSelection: () => void
  onJumpTo: (dayStart: number, dayEnd: number) => void
}

export default function AnnotationSidebar({
  usubjid,
  selectedRange,
  onClearSelection,
  onJumpTo,
}: Props) {
  const labels = useLabels(usubjid)
  const create = useCreateLabel()
  const del = useDeleteLabel(usubjid)

  const [labelKind, setLabelKind] = useState<LabelKind>('walking')
  const [customLabel, setCustomLabel] = useState('')
  const [notes, setNotes] = useState('')

  const canSave = !!usubjid && !!selectedRange && !create.isPending
  const needsCustom = labelKind === 'custom'

  function save() {
    if (!usubjid || !selectedRange) return
    if (needsCustom && !customLabel.trim()) return
    create.mutate(
      {
        usubjid,
        study_day_start: selectedRange[0],
        study_day_end: selectedRange[1],
        label: labelKind,
        custom_label: needsCustom ? customLabel.trim() : null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setCustomLabel('')
          setNotes('')
          onClearSelection()
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
          <span>Annotate window</span>
          <InfoTip label="Annotate">
            <p>
              Click-drag inside any signal panel to select a time window, then pick a
              label here and save.
            </p>
            <p className="mt-1">
              Labels are saved to <code>biomarker_app.labels</code> in your workspace
              project and rendered as colored overlays across the panels.
            </p>
          </InfoTip>
        </div>

        {!selectedRange ? (
          <div className="rounded-md border border-dashed border-verily-mute bg-verily-mute/20 p-3 text-xs text-verily-ink/60">
            No window selected. <b>Drag inside any panel</b> to zoom/select a window
            (double-click to reset).
          </div>
        ) : (
          <div className="mb-3 space-y-2 rounded-md border border-verily-primary/40 bg-verily-primary/5 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-verily-ink">Selected</span>
              <button
                className="text-[11px] text-verily-ink/50 hover:text-verily-warm"
                onClick={onClearSelection}
              >
                Clear
              </button>
            </div>
            <div className="font-mono text-verily-ink/80">
              study-day {selectedRange[0].toFixed(3)} → {selectedRange[1].toFixed(3)}
            </div>
            <div className="text-verily-ink/60">
              {((selectedRange[1] - selectedRange[0]) * 24 * 60).toFixed(1)} min
            </div>
          </div>
        )}

        <div className="mb-2 text-[11px] uppercase tracking-wide text-verily-ink/60">
          Label
        </div>
        <div className="mb-3 grid grid-cols-2 gap-1">
          {LABEL_OPTIONS.map((k) => {
            const on = labelKind === k
            return (
              <button
                key={k}
                onClick={() => setLabelKind(k)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors
                  ${
                    on
                      ? 'border-verily-ink bg-verily-ink text-white'
                      : 'border-verily-mute text-verily-ink/70 hover:bg-verily-mute/40'
                  }`}
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: LABEL_COLOR[k] }}
                />
                {k}
              </button>
            )
          })}
        </div>

        {needsCustom ? (
          <label className="mb-3 block text-xs">
            <span className="mb-1 block text-verily-ink/60">Custom label</span>
            <input
              className="input w-full"
              value={customLabel}
              placeholder="e.g. stair-climb"
              onChange={(e) => setCustomLabel(e.target.value)}
            />
          </label>
        ) : null}

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-verily-ink/60">Notes (optional)</span>
          <textarea
            className="input w-full resize-y"
            rows={2}
            value={notes}
            placeholder="Short description or context"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {create.error ? (
          <div className="mb-2 text-xs text-verily-warm">
            Save failed: {(create.error as Error).message}
          </div>
        ) : null}

        <button
          className="btn-primary w-full"
          disabled={!canSave || (needsCustom && !customLabel.trim())}
          onClick={save}
        >
          {create.isPending ? 'Saving…' : 'Save label'}
        </button>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verily-ink/60">
          <span>Saved labels</span>
          <span className="text-verily-ink/40">({labels.data?.length ?? 0})</span>
          <InfoTip label="Saved labels">
            <p>
              Your window labels for this subject, newest first. Click a row to jump
              the signal panels to that window; hit the × to delete it.
            </p>
          </InfoTip>
          <button
            className="ml-auto text-[11px] font-normal text-verily-ink/60 hover:text-verily-primary disabled:opacity-40"
            disabled={!labels.data || labels.data.length === 0}
            onClick={() => {
              if (!labels.data || !usubjid) return
              downloadCsv(
                `labels_${usubjid}.csv`,
                labels.data.map((l) => ({
                  label_id: l.label_id,
                  usubjid: l.usubjid,
                  study_day_start: l.study_day_start,
                  study_day_end: l.study_day_end,
                  label: l.label,
                  custom_label: l.custom_label,
                  notes: l.notes,
                  user_email: l.user_email,
                  created_at: l.created_at,
                })),
              )
            }}
            title="Download labels for this subject as CSV"
          >
            ⬇ CSV
          </button>
        </div>
        {labels.isLoading ? (
          <div className="text-xs text-verily-ink/50">loading…</div>
        ) : (labels.data?.length ?? 0) === 0 ? (
          <div className="text-xs italic text-verily-ink/50">
            No labels saved for this subject yet.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {[...(labels.data ?? [])]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((l) => (
                <LabelRow
                  key={l.label_id}
                  label={l}
                  onJump={() => onJumpTo(l.study_day_start, l.study_day_end)}
                  onDelete={() => del.mutate(l.label_id)}
                />
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LabelRow({
  label,
  onJump,
  onDelete,
}: {
  label: Label
  onJump: () => void
  onDelete: () => void
}) {
  const display =
    label.label === 'custom' && label.custom_label
      ? label.custom_label
      : label.label
  return (
    <li className="group flex items-start gap-2 rounded-md border border-transparent px-1.5 py-1.5 hover:border-verily-mute hover:bg-verily-mute/20">
      <span
        className="mt-1 h-2.5 w-2.5 flex-none rounded-sm"
        style={{ background: LABEL_COLOR[label.label] }}
      />
      <button
        type="button"
        className="flex-1 text-left text-xs"
        onClick={onJump}
        title="Jump to this window"
      >
        <div className="font-medium text-verily-ink">{display}</div>
        <div className="font-mono text-[11px] text-verily-ink/60">
          day {label.study_day_start.toFixed(3)} → {label.study_day_end.toFixed(3)}
          <span className="ml-1 text-verily-ink/40">
            ({((label.study_day_end - label.study_day_start) * 24 * 60).toFixed(0)} min)
          </span>
        </div>
        {label.notes ? (
          <div className="mt-0.5 text-[11px] italic text-verily-ink/60">
            {label.notes}
          </div>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="invisible rounded-full px-1.5 text-[11px] text-verily-ink/40 hover:bg-verily-warm/20 hover:text-verily-warm group-hover:visible"
        title="Delete label"
      >
        ×
      </button>
    </li>
  )
}
