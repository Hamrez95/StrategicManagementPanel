import math

WEIGHT_TOLERANCE = 0.001
MIDPOINT = 2.5


def evaluate_matrix(kind, rows):
    issues = []
    ids = set()
    complete_ratings_and_weights = 0 < len(rows) <= 100
    evidence_complete = 0 < len(rows) <= 100
    total_weight = 0.0

    if not rows:
        issues.append({'code': 'rows_required', 'field': 'rows'})
    if len(rows) > 100:
        issues.append({'code': 'row_limit', 'field': 'rows'})

    for index, row in enumerate(rows):
        prefix = f'rows.{index}'
        row_id = row['id']
        if not row_id or row_id in ids:
            issues.append({'code': 'duplicate_or_missing_id', 'field': f'{prefix}.id'})
        ids.add(row_id)

        if not row['title'].strip():
            issues.append({'code': 'title_required', 'field': f'{prefix}.title'})
        if not row['evidence'].strip():
            evidence_complete = False
            issues.append({'code': 'evidence_required', 'field': f'{prefix}.evidence'})

        allowed_types = {'opportunity', 'threat'} if kind == 'efe' else {'strength', 'weakness'}
        if row['factor_type'] not in allowed_types:
            complete_ratings_and_weights = False
            issues.append({'code': 'factor_type_invalid', 'field': f'{prefix}.factor_type'})

        weight = row['weight']
        if weight is None:
            complete_ratings_and_weights = False
            issues.append({'code': 'weight_required', 'field': f'{prefix}.weight'})
        else:
            total_weight += weight
            if weight < 0 or weight > 100:
                complete_ratings_and_weights = False
                issues.append({'code': 'weight_out_of_range', 'field': f'{prefix}.weight'})

        rating = row['rating']
        if rating is None or rating < 1 or rating > 4:
            complete_ratings_and_weights = False
            issues.append({'code': 'rating_out_of_range', 'field': f'{prefix}.rating'})
        elif kind == 'ife' and (
            (row['factor_type'] == 'strength' and rating < 3)
            or (row['factor_type'] == 'weakness' and rating > 2)
        ):
            complete_ratings_and_weights = False
            issues.append({'code': 'ife_rating_mismatch', 'field': f'{prefix}.rating'})

    weights_valid = bool(rows) and abs(total_weight - 100) < WEIGHT_TOLERANCE
    if rows and not weights_valid:
        issues.append({'code': 'weights_must_total_100', 'field': 'rows'})
    ready = complete_ratings_and_weights and weights_valid
    score = (
        sum((row['weight'] / 100) * row['rating'] for row in rows)
        if ready
        else None
    )
    rounded_score = math.floor(score * 100 + 0.5) / 100 if score is not None else None
    titles_and_ids_valid = all(row['title'].strip() and row['id'] for row in rows) and len(ids) == len(rows)

    if score is None:
        interpretation = 'unavailable'
    elif score < MIDPOINT:
        interpretation = 'below_midpoint'
    elif score > MIDPOINT:
        interpretation = 'above_midpoint'
    else:
        interpretation = 'at_midpoint'

    return {
        'kind': kind,
        'total_weight': total_weight,
        'score': score,
        'rounded_score': rounded_score,
        'ready': ready,
        'can_finalize': ready and evidence_complete and titles_and_ids_valid,
        'issues': issues,
        'interpretation': interpretation,
        'midpoint': MIDPOINT,
        'limitations': (
            ['efe_measures_response', 'midpoint_is_not_success_threshold', 'evidence_quality_is_external']
            if kind == 'efe'
            else ['ife_rating_depends_on_factor_type', 'midpoint_is_not_success_threshold', 'evidence_quality_is_external']
        ),
    }
