// Small numeric helpers for the entrainment engine.

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const median = (values: number[]): number => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Median absolute deviation, unscaled — callers work in raw minutes and
// calibrate their own thresholds.
export const mad = (values: number[]): number => {
  if (!values.length) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
};

export const weightedMedian = (values: number[], weights: number[]): number => {
  if (!values.length) return 0;
  const pairs = values.map((v, i) => [v, weights[i] ?? 1] as const).sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return median(values);
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return pairs[pairs.length - 1][0];
};

export const roundTo = (v: number, step: number): number => Math.round(v / step) * step;

// ---- local wall-clock helpers (DST-proof: always via Date) ----

/** Minutes after local midnight for an epoch-ms instant. */
export const clockMin = (ts: number): number => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

/** Civil date key (YYYY-MM-DD) of an epoch-ms instant, local time. */
export const civilDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Epoch ms of `clockMinutes` after midnight on the civil date containing `ref`. */
export const tsAtClockMin = (ref: number, clockMinutes: number): number => {
  const d = new Date(ref);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, clockMinutes).getTime();
};

/** Epoch ms of local midnight starting the civil date `key` (YYYY-MM-DD). */
export const tsAtCivilDate = (key: string): number => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

export const addCivilDays = (key: string, days: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
