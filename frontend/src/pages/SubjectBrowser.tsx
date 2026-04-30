import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSubjects } from '../api/hooks'
import { downloadCsv } from '../api/download'
import InfoTip from '../components/InfoTip'

export default function SubjectBrowser() {
  const nav = useNavigate()
  const [sex, setSex] = useState<string>('')
  const [minAge, setMinAge] = useState<number | undefined>()
  const [maxAge, setMaxAge] = useState<number | undefined>()
  const [minWear, setMinWear] = useState<number>(0)

  const { data, isLoading, error } = useSubjects({
    limit: 200,
    sex: sex || undefined,
    minAge,
    maxAge,
    minWear: minWear > 0 ? minWear : undefined,
  })

  const nothingFiltered =
    !sex && minAge == null && maxAge == null && minWear === 0
  const resetFilters = () => {
    setSex('')
    setMinAge(undefined)
    setMaxAge(undefined)
    setMinWear(0)
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Subjects</h1>
        <InfoTip label="The demo subject pool">
          <p>
            102 BHS subjects were materialized into a clustered demo dataset,
            stratified by sex and age bin and picked for high average wear fraction.
          </p>
          <p className="mt-1">
            Click any row to jump to Signal Explorer for that subject.
          </p>
        </InfoTip>
        <div className="ml-auto flex items-center gap-3 text-sm text-verily-ink/60">
          {data ? `${data.total} matching` : isLoading ? 'loading…' : ''}
          <button
            className="btn-ghost text-xs"
            disabled={!data || data.items.length === 0}
            onClick={() => {
              if (!data) return
              downloadCsv(
                `subjects_filtered_${data.items.length}.csv`,
                data.items.map((s) => ({
                  usubjid: s.usubjid,
                  subjid: s.subjid,
                  sex: s.sex,
                  age_at_enrollment: s.age_at_enrollment,
                  race: s.race,
                  hispanic_ancestry: s.hispanic_ancestry,
                  wear_fraction_avg: s.wear_fraction_avg,
                  n_wear_segments: s.n_wear_segments,
                  study_day_min: s.study_day_min,
                  study_day_max: s.study_day_max,
                })),
              )
            }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <FilterField label="Sex">
          <select
            className="input"
            value={sex}
            onChange={(e) => setSex(e.target.value)}
          >
            <option value="">Any</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </FilterField>
        <FilterField label="Min age">
          <NumInput value={minAge} setValue={setMinAge} placeholder="18" />
        </FilterField>
        <FilterField label="Max age">
          <NumInput value={maxAge} setValue={setMaxAge} placeholder="90" />
        </FilterField>
        <FilterField label={`Min wear (${(minWear * 100).toFixed(0)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minWear}
            onChange={(e) => setMinWear(Number(e.target.value))}
            className="w-40 accent-verily-primary"
          />
        </FilterField>
        <InfoTip label="Wear fraction">
          <p>
            Mean ratio of observed sensor wear across the subject's study days —
            from the <code>ANNOTATIONS</code> table. 100% means the wearable was on
            continuously; 50% means roughly half the time.
          </p>
          <p className="mt-1">
            Higher-wear subjects generally have more usable data across all
            modalities.
          </p>
        </InfoTip>
        {!nothingFiltered ? (
          <button className="btn-ghost ml-auto text-xs" onClick={resetFilters}>
            Reset filters
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="card p-4 text-sm text-verily-warm">
          Error loading subjects: {String(error)}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-verily-mute/40 text-left text-xs uppercase tracking-wide text-verily-ink/60">
            <tr>
              <th className="px-4 py-2">USUBJID</th>
              <th className="px-4 py-2">Sex</th>
              <th className="px-4 py-2">Age</th>
              <th className="px-4 py-2">Race</th>
              <th className="px-4 py-2">Wear</th>
              <th className="px-4 py-2">Study days</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-t border-verily-mute">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-3 w-3/4 rounded bg-verily-mute" />
                    </td>
                  </tr>
                ))
              : (data?.items.length ?? 0) === 0
              ? (
                <tr className="border-t border-verily-mute">
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="mb-2 text-sm text-verily-ink/60">
                      No subjects match these filters.
                    </div>
                    <button className="btn-ghost" onClick={resetFilters}>
                      Reset filters
                    </button>
                  </td>
                </tr>
              )
              : data?.items.map((s) => (
                  <tr
                    key={s.usubjid}
                    className="cursor-pointer border-t border-verily-mute hover:bg-verily-mute/30"
                    onClick={() => nav(`/explorer/${encodeURIComponent(s.usubjid)}`)}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{s.usubjid}</td>
                    <td className="px-4 py-2">{s.sex ?? '—'}</td>
                    <td className="px-4 py-2">{s.age_at_enrollment ?? '—'}</td>
                    <td className="px-4 py-2">{s.race ?? '—'}</td>
                    <td className="px-4 py-2">
                      <WearBar value={s.wear_fraction_avg} />
                    </td>
                    <td className="px-4 py-2 text-xs text-verily-ink/60">
                      {s.study_day_min ?? '—'} → {s.study_day_max ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="btn-ghost">Open →</span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-verily-ink/60">{label}</span>
      {children}
    </label>
  )
}

function NumInput({
  value,
  setValue,
  placeholder,
}: {
  value: number | undefined
  setValue: (n: number | undefined) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      className="input w-20"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) =>
        setValue(e.target.value === '' ? undefined : Number(e.target.value))
      }
    />
  )
}

function WearBar({ value }: { value: number | null }) {
  const v = value ?? 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-verily-mute">
        <div
          className="h-full bg-verily-primary"
          style={{ width: `${Math.round(v * 100)}%` }}
        />
      </div>
      <span className="text-xs text-verily-ink/60">{(v * 100).toFixed(0)}%</span>
    </div>
  )
}
