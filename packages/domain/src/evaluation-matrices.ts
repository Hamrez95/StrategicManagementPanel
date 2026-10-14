export type EvaluationMatrixKind = 'efe' | 'ife';
export type EvaluationFactorType = 'strength' | 'weakness' | 'opportunity' | 'threat';

export interface EvaluationMatrixRow {
  id: string;
  title: string;
  factor_type: EvaluationFactorType;
  weight: number | null;
  rating: number | null;
  evidence: string;
}

export interface EvaluationIssue {
  code: string;
  field: string;
}

export interface EvaluationMatrixResult {
  kind: EvaluationMatrixKind;
  total_weight: number;
  score: number | null;
  rounded_score: number | null;
  ready: boolean;
  can_finalize: boolean;
  issues: EvaluationIssue[];
  interpretation: 'below_midpoint' | 'at_midpoint' | 'above_midpoint' | 'unavailable';
  midpoint: 2.5;
  limitations: string[];
}

const WEIGHT_TOLERANCE = 0.001;
const MIDPOINT = 2.5 as const;

/** EFE/IFE preview rules shared by the browser and golden API fixtures. */
export function evaluateMatrix(
  kind: EvaluationMatrixKind,
  rows: readonly EvaluationMatrixRow[],
): EvaluationMatrixResult {
  const issues: EvaluationIssue[] = [];
  const ids = new Set<string>();
  let completeRatingsAndWeights = rows.length > 0 && rows.length <= 100;
  let evidenceComplete = rows.length > 0 && rows.length <= 100;
  let identifiersValid = true;
  let titlesValid = true;
  let totalWeight = 0;

  if (rows.length === 0) issues.push({ code: 'rows_required', field: 'rows' });
  if (rows.length > 100) issues.push({ code: 'row_limit', field: 'rows' });

  rows.forEach((row, index) => {
    const prefix = `rows.${index}`;
    if (!row.id || ids.has(row.id)) {
      identifiersValid = false;
      issues.push({ code: 'duplicate_or_missing_id', field: `${prefix}.id` });
    }
    ids.add(row.id);

    if (!row.title.trim()) {
      titlesValid = false;
      issues.push({ code: 'title_required', field: `${prefix}.title` });
    }
    if (!row.evidence.trim()) {
      evidenceComplete = false;
      issues.push({ code: 'evidence_required', field: `${prefix}.evidence` });
    }

    const allowedTypes = kind === 'efe' ? ['opportunity', 'threat'] : ['strength', 'weakness'];
    if (!allowedTypes.includes(row.factor_type)) {
      completeRatingsAndWeights = false;
      issues.push({ code: 'factor_type_invalid', field: `${prefix}.factor_type` });
    }

    const weight = row.weight;
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      completeRatingsAndWeights = false;
      issues.push({ code: 'weight_required', field: `${prefix}.weight` });
    } else {
      totalWeight += weight;
      if (weight < 0 || weight > 100) {
        completeRatingsAndWeights = false;
        issues.push({ code: 'weight_out_of_range', field: `${prefix}.weight` });
      }
    }

    const rating = row.rating;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 4) {
      completeRatingsAndWeights = false;
      issues.push({ code: 'rating_out_of_range', field: `${prefix}.rating` });
    } else if (
      kind === 'ife' &&
      ((row.factor_type === 'strength' && rating < 3) ||
        (row.factor_type === 'weakness' && rating > 2))
    ) {
      completeRatingsAndWeights = false;
      issues.push({ code: 'ife_rating_mismatch', field: `${prefix}.rating` });
    }
  });

  const weightsValid = rows.length > 0 && Math.abs(totalWeight - 100) < WEIGHT_TOLERANCE;
  if (rows.length > 0 && !weightsValid)
    issues.push({ code: 'weights_must_total_100', field: 'rows' });
  const ready = completeRatingsAndWeights && weightsValid;
  const score = ready
    ? rows.reduce((sum, row) => sum + ((row.weight as number) / 100) * (row.rating as number), 0)
    : null;
  const roundedScore = score === null ? null : Math.round(score * 100) / 100;

  return {
    kind,
    total_weight: totalWeight,
    score,
    rounded_score: roundedScore,
    ready,
    can_finalize: ready && evidenceComplete && identifiersValid && titlesValid,
    issues,
    interpretation:
      score === null
        ? 'unavailable'
        : score < MIDPOINT
          ? 'below_midpoint'
          : score > MIDPOINT
            ? 'above_midpoint'
            : 'at_midpoint',
    midpoint: MIDPOINT,
    limitations:
      kind === 'efe'
        ? [
            'efe_measures_response',
            'midpoint_is_not_success_threshold',
            'evidence_quality_is_external',
          ]
        : [
            'ife_rating_depends_on_factor_type',
            'midpoint_is_not_success_threshold',
            'evidence_quality_is_external',
          ],
  };
}
