export interface WeightedRow {
  id: string;
  weight: number;
  rating: number;
}
export interface AttractivenessScore {
  relevant?: boolean;
  as?: readonly number[];
}
export interface SpaceDimensions {
  IS: readonly number[];
  CA: readonly number[];
  FS: readonly number[];
  ES: readonly number[];
}
export interface FinancialInputs {
  acquisitionCost: number;
  aov: number;
  assetsEnd: number;
  assetsStart: number;
  cash: number;
  cashFlow: number;
  cogs: number;
  endRevenue: number;
  equity: number;
  fixed: number;
  frequency: number;
  lifetime: number;
  marketRevenue: number;
  netIncome: number;
  newCustomers: number;
  revenue: number;
  startRevenue: number;
  variable: number;
  years: number;
}
export const sum = (values: readonly number[]) => values.reduce((a, b) => a + Number(b), 0);
export const ratio = (a: number | null, b: number | null) =>
  typeof a === 'number' &&
  typeof b === 'number' &&
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  b > 0
    ? a / b
    : null;
export const weightedScore = (rows: readonly WeightedRow[]) =>
  sum(rows.map((r) => (r.weight / 100) * r.rating));
export const validWeights = (rows: readonly WeightedRow[]) =>
  rows.every((r) => Number.isFinite(r.weight) && r.weight >= 0 && r.weight <= 100) &&
  Math.abs(sum(rows.map((r) => r.weight)) - 100) < 0.001;
export function qspm(
  external: readonly WeightedRow[],
  internal: readonly WeightedRow[],
  scores: Record<string, AttractivenessScore | undefined>,
) {
  if (!validWeights(external) || !validWeights(internal)) return null;
  return [0, 1, 2].map((i) =>
    sum(
      [...external, ...internal].map(
        (r) =>
          (r.weight / 100) *
          (scores[r.id]?.relevant === false ? 0 : Number(scores[r.id]?.as?.[i] || 0)),
      ),
    ),
  );
}
export function space(dimensions: SpaceDimensions) {
  const avg = (values: readonly number[]) => sum(values) / values.length;
  const x = avg(dimensions.IS) + avg(dimensions.CA);
  const y = avg(dimensions.FS) + avg(dimensions.ES);
  return {
    x,
    y,
    posture: x >= 0 ? (y >= 0 ? 'تهاجمی' : 'رقابتی') : y >= 0 ? 'محافظه‌کارانه' : 'دفاعی',
  };
}
export function iePosition(ife: number, efe: number) {
  const col = ife >= 3 ? 0 : ife >= 2 ? 1 : 2;
  const row = efe >= 3 ? 0 : efe >= 2 ? 1 : 2;
  const cell = row * 3 + col + 1;
  return {
    cell,
    action: [1, 2, 4].includes(cell)
      ? 'رشد و ساخت'
      : [3, 5, 7].includes(cell)
        ? 'حفظ و نگهداری'
        : 'برداشت یا واگذاری',
  };
}
export function financials(f: FinancialInputs) {
  const averageAssets = (f.assetsStart + f.assetsEnd) / 2;
  const gross = f.revenue - f.cogs;
  const contribution = f.revenue - f.variable;
  const operating = contribution - f.fixed;
  return {
    gross,
    contribution,
    operating,
    grossMargin: ratio(gross, f.revenue),
    contributionMargin: ratio(contribution, f.revenue),
    roa: ratio(f.netIncome, averageAssets),
    roe: ratio(f.netIncome, f.equity),
    cac: ratio(f.acquisitionCost, f.newCustomers),
    ltv: f.aov * f.frequency * f.lifetime * (ratio(contribution, f.revenue) ?? 0),
    breakEven: ratio(f.fixed, ratio(contribution, f.revenue)),
    runway: ratio(f.cash, Math.max(0, -f.cashFlow)),
    cagr:
      f.startRevenue > 0 && f.endRevenue >= 0 && f.years > 0
        ? (f.endRevenue / f.startRevenue) ** (1 / f.years) - 1
        : null,
    marketShare: ratio(f.revenue, f.marketRevenue),
  };
}
export const npv = (investment: number, flows: readonly number[], rate: number) =>
  rate > -1 ? -investment + sum(flows.map((flow, i) => flow / (1 + rate) ** (i + 1))) : null;
export function irr(investment: number, flows: readonly number[]) {
  // Only conventional cash flows: unique root. No misleading IRR for multiple sign changes.
  if (!(investment > 0) || !flows.length || flows.some((f) => f < 0) || !flows.some((f) => f > 0))
    return null;
  let lo = -0.999,
    hi = 10;
  if (npv(investment, flows, lo)! * npv(investment, flows, hi)! > 0) return null;
  for (let i = 0; i < 150; i++) {
    const mid = (lo + hi) / 2;
    if (npv(investment, flows, mid)! > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function scenarioResult(
  revenue: number,
  costRatio: number,
  fixed: number,
  growth: number,
  inflation: number,
) {
  const nextRevenue = revenue * (1 + growth / 100);
  const costs = revenue * costRatio * (1 + growth / 100) * (1 + inflation / 100);
  return { revenue: nextRevenue, profit: nextRevenue - costs - fixed };
}
export const progress = (actual: number, baseline: number, target: number) =>
  target === baseline
    ? null
    : Math.min(100, Math.max(0, ((actual - baseline) / (target - baseline)) * 100));
