import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSignedUrl,
  useDeleteCohort,
  useDeleteFeatureRun,
  useDeleteFeatureSet,
  useExports,
  useFeatureRuns,
  useFeatureSets,
  useSavedCohorts,
} from '../api/hooks'
import InfoTip from '../components/InfoTip'

type Tab = 'cohorts' | 'feature-runs' | 'feature-sets' | 'exports'

const TABS: { id: Tab; label: string; description: string }[] = [
  {
    id: 'cohorts',
    label: 'Cohorts',
    description: 'Named cohort definitions + materialized member lists.',
  },
  {
    id: 'feature-runs',
    label: 'Feature runs',
    description:
      'Every Feature Lab compute you explicitly saved. Values are stored in biomarker_app.features and in a Parquet on GCS.',
  },
  {
    id: 'feature-sets',
    label: 'Feature sets',
    description: 'Reusable bundles of feature IDs — load to pre-select the Feature Lab menu.',
  },
  {
    id: 'exports',
    label: 'Exports',
    description:
      'Raw GCS artifacts (Parquet/CSV) indexed in biomarker_app.exports. Use the signed URL to download or paste gs:// into a notebook.',
  },
]

export default function SavedWork() {
  const [tab, setTab] = useState<Tab>('cohorts')
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">My Work</h1>
        <InfoTip label="My Work">
          <p>
            Everything you've saved from across the app. BigQuery is the source of
            truth; GCS holds the bulky Parquet/CSV artifacts. v1 shows all workspace
            users' items; filter by user is a v2 add.
          </p>
        </InfoTip>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-verily-mute bg-white p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors
              ${
                tab === t.id
                  ? 'bg-verily-ink text-white'
                  : 'text-verily-ink/70 hover:bg-verily-mute/60'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-4 text-xs text-verily-ink/60">
        {TABS.find((t) => t.id === tab)?.description}
      </div>

      {tab === 'cohorts' ? <CohortsTab /> : null}
      {tab === 'feature-runs' ? <FeatureRunsTab /> : null}
      {tab === 'feature-sets' ? <FeatureSetsTab /> : null}
      {tab === 'exports' ? <ExportsTab /> : null}
    </div>
  )
}

// ── Cohorts ──────────────────────────────────────────────────────────────────

function CohortsTab() {
  const q = useSavedCohorts()
  const del = useDeleteCohort()
  const nav = useNavigate()
  return (
    <TableCard isLoading={q.isLoading} empty={!q.data?.length}>
      <thead className="bg-verily-mute/40 text-[11px] uppercase tracking-wide text-verily-ink/60">
        <tr>
          <TH>Name</TH>
          <TH className="text-right">Subjects</TH>
          <TH>Filters</TH>
          <TH>User</TH>
          <TH>Saved</TH>
          <TH className="text-right"></TH>
        </tr>
      </thead>
      <tbody>
        {(q.data ?? []).map((c) => (
          <tr key={c.cohort_id} className="border-t border-verily-mute">
            <td className="px-3 py-2">
              <div className="font-medium text-verily-ink">{c.name}</div>
              {c.description ? (
                <div className="text-[11px] text-verily-ink/60">{c.description}</div>
              ) : null}
            </td>
            <td className="px-3 py-2 text-right font-mono">{c.member_count}</td>
            <td className="px-3 py-2 text-[11px] font-mono text-verily-ink/60">
              <CopyableCode text={c.filter_json} maxWidth={260} />
            </td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{c.user_email ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{formatDate(c.created_at)}</td>
            <td className="px-3 py-2 text-right">
              <button
                className="btn-ghost text-xs"
                onClick={() => nav(`/cohorts?load=${c.cohort_id}`)}
              >
                Open
              </button>
              <DeleteButton onConfirm={() => del.mutate(c.cohort_id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  )
}

// ── Feature runs ─────────────────────────────────────────────────────────────

function FeatureRunsTab() {
  const q = useFeatureRuns()
  const del = useDeleteFeatureRun()
  return (
    <TableCard isLoading={q.isLoading} empty={!q.data?.length}>
      <thead className="bg-verily-mute/40 text-[11px] uppercase tracking-wide text-verily-ink/60">
        <tr>
          <TH>Name</TH>
          <TH>USUBJID</TH>
          <TH className="text-right">Features</TH>
          <TH className="text-right">Rows</TH>
          <TH>Window</TH>
          <TH>User</TH>
          <TH>Saved</TH>
          <TH className="text-right"></TH>
        </tr>
      </thead>
      <tbody>
        {(q.data ?? []).map((r) => (
          <tr key={r.run_id} className="border-t border-verily-mute">
            <td className="px-3 py-2">
              <div className="font-medium text-verily-ink">{r.name ?? r.run_id}</div>
              {r.description ? (
                <div className="text-[11px] text-verily-ink/60">{r.description}</div>
              ) : null}
              <div className="text-[10px] font-mono text-verily-ink/40">{r.run_id}</div>
            </td>
            <td className="px-3 py-2 font-mono text-xs">{r.usubjid}</td>
            <td className="px-3 py-2 text-right font-mono">{r.n_features}</td>
            <td className="px-3 py-2 text-right font-mono">{r.n_rows}</td>
            <td className="px-3 py-2 font-mono text-xs text-verily-ink/60">
              {r.study_day_start?.toFixed(3)} → {r.study_day_end?.toFixed(3)}
            </td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{r.user_email ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{formatDate(r.created_at)}</td>
            <td className="px-3 py-2 text-right">
              <DeleteButton onConfirm={() => del.mutate(r.run_id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  )
}

// ── Feature sets ─────────────────────────────────────────────────────────────

function FeatureSetsTab() {
  const q = useFeatureSets()
  const del = useDeleteFeatureSet()
  return (
    <TableCard isLoading={q.isLoading} empty={!q.data?.length}>
      <thead className="bg-verily-mute/40 text-[11px] uppercase tracking-wide text-verily-ink/60">
        <tr>
          <TH>Name</TH>
          <TH>Features</TH>
          <TH>User</TH>
          <TH>Saved</TH>
          <TH className="text-right"></TH>
        </tr>
      </thead>
      <tbody>
        {(q.data ?? []).map((fs) => (
          <tr key={fs.feature_set_id} className="border-t border-verily-mute">
            <td className="px-3 py-2">
              <div className="font-medium text-verily-ink">{fs.name}</div>
              {fs.description ? (
                <div className="text-[11px] text-verily-ink/60">{fs.description}</div>
              ) : null}
            </td>
            <td className="px-3 py-2 text-[11px] font-mono text-verily-ink/70">
              {fs.feature_ids.length > 0
                ? fs.feature_ids.join(', ')
                : '—'}
            </td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{fs.user_email ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{formatDate(fs.created_at)}</td>
            <td className="px-3 py-2 text-right">
              <DeleteButton onConfirm={() => del.mutate(fs.feature_set_id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  )
}

// ── Exports ──────────────────────────────────────────────────────────────────

function ExportsTab() {
  const q = useExports()
  return (
    <TableCard isLoading={q.isLoading} empty={!q.data?.length}>
      <thead className="bg-verily-mute/40 text-[11px] uppercase tracking-wide text-verily-ink/60">
        <tr>
          <TH>Kind</TH>
          <TH>Format</TH>
          <TH className="text-right">Rows</TH>
          <TH className="text-right">Size</TH>
          <TH>GCS path</TH>
          <TH>User</TH>
          <TH>Created</TH>
          <TH className="text-right"></TH>
        </tr>
      </thead>
      <tbody>
        {(q.data ?? []).map((e) => (
          <tr key={e.export_id} className="border-t border-verily-mute">
            <td className="px-3 py-2 text-xs">{e.kind}</td>
            <td className="px-3 py-2 text-xs uppercase">{e.format}</td>
            <td className="px-3 py-2 text-right font-mono">{e.row_count ?? '—'}</td>
            <td className="px-3 py-2 text-right font-mono">{formatBytes(e.size_bytes)}</td>
            <td className="px-3 py-2 text-[11px] font-mono">
              <CopyableCode text={e.gcs_path} maxWidth={300} />
            </td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{e.user_email ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-verily-ink/60">{formatDate(e.created_at)}</td>
            <td className="px-3 py-2 text-right">
              <button
                className="btn-ghost text-xs"
                onClick={async () => {
                  try {
                    const signed = await fetchSignedUrl(e.export_id)
                    window.open(signed.url, '_blank')
                  } catch (err) {
                    alert((err as Error).message)
                  }
                }}
              >
                ⬇ Download
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function TableCard({
  children,
  isLoading,
  empty,
}: {
  children: React.ReactNode
  isLoading: boolean
  empty: boolean
}) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">{children}</table>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-verily-ink/50">Loading…</div>
      ) : empty ? (
        <div className="p-8 text-center text-sm text-verily-ink/50">
          Nothing saved yet. Hit <b>Save</b> on any workflow page to get started.
        </div>
      ) : null}
    </div>
  )
}

function TH({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <th className={`px-3 py-2 text-left ${className}`}>{children}</th>
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <button
      className="btn-ghost ml-1 text-xs text-verily-warm/80 hover:text-verily-warm"
      onClick={() => {
        if (confirm('Delete this item? This cannot be undone.')) onConfirm()
      }}
      title="Delete"
    >
      🗑
    </button>
  )
}

function CopyableCode({ text, maxWidth = 240 }: { text: string; maxWidth?: number }) {
  return (
    <button
      className="group inline-flex max-w-full items-center gap-1 truncate rounded bg-verily-mute/40 px-1.5 py-0.5 font-mono hover:bg-verily-mute"
      style={{ maxWidth }}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {})
      }}
      title={text + '\n\n(click to copy)'}
    >
      <span className="truncate">{text}</span>
      <span className="opacity-0 group-hover:opacity-100">📋</span>
    </button>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
