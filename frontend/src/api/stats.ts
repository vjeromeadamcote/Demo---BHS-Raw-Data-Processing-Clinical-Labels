// Two-sample statistics computed from N/mean/SD summary stats (no raw values needed).

export interface GroupSummary {
  n: number
  mean: number | null
  sd: number | null
}

export interface TwoGroupTest {
  mean_diff: number
  cohens_d: number
  welch_t: number
  df: number
  p_two_sided: number
}

export function welchTest(a: GroupSummary, b: GroupSummary): TwoGroupTest | null {
  if (
    a.n < 2 ||
    b.n < 2 ||
    a.mean == null ||
    b.mean == null ||
    a.sd == null ||
    b.sd == null
  )
    return null
  const va = a.sd * a.sd
  const vb = b.sd * b.sd
  const se = Math.sqrt(va / a.n + vb / b.n)
  if (se === 0) return null
  const diff = a.mean - b.mean
  const t = diff / se
  // Welch–Satterthwaite df
  const df =
    (va / a.n + vb / b.n) ** 2 /
    ((va / a.n) ** 2 / (a.n - 1) + (vb / b.n) ** 2 / (b.n - 1))
  // Pooled SD for Cohen's d
  const pooled = Math.sqrt(
    ((a.n - 1) * va + (b.n - 1) * vb) / Math.max(1, a.n + b.n - 2),
  )
  const d = pooled === 0 ? 0 : diff / pooled
  const p = 2 * (1 - studentTCdf(Math.abs(t), df))
  return { mean_diff: diff, cohens_d: d, welch_t: t, df, p_two_sided: p }
}

// Student t CDF via regularized incomplete beta (Abramowitz & Stegun 26.7.1).
// Accurate enough for display; not for publication stats.
function studentTCdf(t: number, df: number): number {
  if (!isFinite(t)) return t > 0 ? 1 : 0
  const x = df / (df + t * t)
  const iBeta = regIncompleteBeta(x, df / 2, 0.5)
  return 1 - 0.5 * iBeta
}

// Regularized incomplete beta I_x(a,b) via continued fraction (Numerical Recipes 6.4).
function regIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a
  return 1 - (bt * betacf(1 - x, b, a)) / b
}

function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200
  const EPS = 3e-12
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

// Lanczos approximation for ln Γ(z).
function lnGamma(z: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

export function formatP(p: number): string {
  if (p < 1e-4) return `p < 1e-4`
  if (p < 0.01) return `p = ${p.toExponential(1)}`
  return `p = ${p.toFixed(3)}`
}

export function cohensDLabel(d: number): string {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'negligible'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'medium'
  return 'large'
}
