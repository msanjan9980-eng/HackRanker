/**
 * Cross-judge normalization via robust_z (MAD-based).
 *
 * Design source: JUDGING.md, "Normalization" section.
 *
 * For each judge j:
 *   median_j = median(j's weighted totals)
 *   MAD_j    = median(|x - median_j|) over j's weighted totals
 *   z_j(x)   = 0.6745 * (x - median_j) / MAD_j
 *
 * Safeguards:
 *   - Below MIN_SAMPLE, return raw score flagged method="raw" (insufficient data).
 *   - If MAD_j == 0, fall back to midrank percentile within the judge,
 *     mapped to [-1, 1] so it is comparable to z-scores.
 *   - Output is pooled and linearly rescaled to [0, 100].
 *
 * Pure. No I/O. Testable in isolation.
 */

export const MIN_SAMPLE = 5;

export interface RawScore {
  judgeUserId: string;
  projectId: string;
  functionality: number;
  quality: number;
  innovation: number;
}

export type Method = "robust_z" | "midrank" | "raw";

export interface NormalizedScore {
  judgeUserId: string;
  projectId: string;
  rawWeighted: number;
  normalized: number;       // 0..100 after rescale
  z: number | null;         // pre-rescale, null if method = "raw"
  method: Method;
}

export interface JudgeDiagnostic {
  judgeUserId: string;
  count: number;
  median: number;
  mad: number;
  method: Method;
  reason?: string;
}

export interface NormalizeResult {
  scores: NormalizedScore[];
  diagnostics: JudgeDiagnostic[];
}

const WEIGHTS = { functionality: 1, quality: 1, innovation: 1 } as const;
const WEIGHT_SUM = WEIGHTS.functionality + WEIGHTS.quality + WEIGHTS.innovation;

/** Weighted total on 0..100 scale (equal weights -> 0..100). */
export function rawWeighted(s: RawScore): number {
  const sum =
    s.functionality * WEIGHTS.functionality +
    s.quality * WEIGHTS.quality +
    s.innovation * WEIGHTS.innovation;
  return (sum / (5 * WEIGHT_SUM)) * 100;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mad(xs: number[], center: number): number {
  if (xs.length === 0) return 0;
  return median(xs.map((x) => Math.abs(x - center)));
}

/** Midrank percentile in [0, 1], ties get averaged rank. */
function midranks(xs: number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[idx[j + 1]!]! === xs[idx[i]!]!) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based
    for (let k = i; k <= j; k++) ranks[idx[k]!] = avgRank;
    i = j + 1;
  }
  // Map rank 1..n to [0, 1]
  return ranks.map((r) => (r - 1) / Math.max(1, n - 1));
}

export function normalize(scores: RawScore[]): NormalizeResult {
  const diagnostics: JudgeDiagnostic[] = [];
  const out: NormalizedScore[] = [];

  // Group by judge
  const byJudge = new Map<string, RawScore[]>();
  for (const s of scores) {
    const list = byJudge.get(s.judgeUserId);
    if (list) list.push(s);
    else byJudge.set(s.judgeUserId, [s]);
  }

  // Intermediate records with z before rescale
  const interim: Array<NormalizedScore & { zNonNull: number | null }> = [];

  for (const [judgeUserId, judgeScores] of byJudge) {
    const totals = judgeScores.map(rawWeighted);
    const n = totals.length;
    const med = median(totals);
    const m = mad(totals, med);

    let method: Method;
    let reason: string | undefined;

    if (n < MIN_SAMPLE) {
      method = "raw";
      reason = `count ${n} < MIN_SAMPLE ${MIN_SAMPLE}`;
    } else if (m === 0) {
      method = "midrank";
      reason = "MAD == 0";
    } else {
      method = "robust_z";
    }

    const percentiles =
      method === "midrank" ? midranks(totals) : null;

    judgeScores.forEach((s, i) => {
      const rw = totals[i]!;
      let z: number | null = null;

      if (method === "robust_z") {
        z = 0.6745 * (rw - med) / m;
      } else if (method === "midrank") {
        // Map percentile [0, 1] to [-1, 1]
        const p = percentiles![i]!;
        z = 2 * p - 1;
      }
      // method === "raw" -> z stays null

      interim.push({
        judgeUserId,
        projectId: s.projectId,
        rawWeighted: rw,
        normalized: 0,
        z,
        method,
        zNonNull: z,
      });
    });

    diagnostics.push({
      judgeUserId,
      count: n,
      median: med,
      mad: m,
      method,
      ...(reason ? { reason } : {}),
    });
  }

  // Rescale z (or raw for method==="raw") to [0, 100]
  const zs = interim
    .map((r) => r.zNonNull)
    .filter((z): z is number => z !== null);

  const zMin = zs.length ? Math.min(...zs) : 0;
  const zMax = zs.length ? Math.max(...zs) : 1;
  const zSpan = zMax - zMin;

  const rawForFallback = interim.map((r) => r.rawWeighted);
  const rawMin = rawForFallback.length ? Math.min(...rawForFallback) : 0;
  const rawMax = rawForFallback.length ? Math.max(...rawForFallback) : 1;
  const rawSpan = rawMax - rawMin;

  for (const r of interim) {
    let normalized: number;
    if (r.method === "raw") {
      normalized = rawSpan === 0 ? 50 : ((r.rawWeighted - rawMin) / rawSpan) * 100;
    } else {
      normalized = zSpan === 0 ? 50 : ((r.zNonNull! - zMin) / zSpan) * 100;
    }
    out.push({
      judgeUserId: r.judgeUserId,
      projectId: r.projectId,
      rawWeighted: r.rawWeighted,
      normalized: Math.round(normalized * 100) / 100,
      z: r.zNonNull,
      method: r.method,
    });
  }

  // Deterministic ordering
  out.sort((a, b) =>
    a.judgeUserId === b.judgeUserId
      ? a.projectId.localeCompare(b.projectId)
      : a.judgeUserId.localeCompare(b.judgeUserId),
  );
  diagnostics.sort((a, b) => a.judgeUserId.localeCompare(b.judgeUserId));

  return { scores: out, diagnostics };
}