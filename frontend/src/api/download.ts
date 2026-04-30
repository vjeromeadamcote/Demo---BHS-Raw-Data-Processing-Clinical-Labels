// Client-side CSV export — no backend round-trip when data is already loaded.

function escapeCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  // Keep column order stable by using keys from the first row plus any new keys seen later.
  const cols: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  const lines = [cols.join(',')]
  for (const r of rows) {
    lines.push(cols.map((c) => escapeCell(r[c])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const csv = rowsToCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
