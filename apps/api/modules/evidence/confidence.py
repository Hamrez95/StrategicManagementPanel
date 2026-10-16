from django.utils import timezone

from .models import Evidence

CONFIDENCE_RULE_REVISION = "editorial-v0.1"
CONFIDENCE_AXES = (
    "provenance_quality",
    "directness_to_decision",
    "recency",
    "representativeness",
    "independent_corroboration",
)
AXIS_STATES = {"adequate", "limited", "unknown"}
CONTRADICTION_STATES = {"none", "resolved", "unresolved"}


class ConfidenceReviewError(ValueError):
    """A confidence review is incomplete or outside its deterministic rubric."""


def evidence_freshness(evidence, *, as_of=None):
    """Return owner-defined freshness without a global age threshold."""

    as_of = as_of or timezone.now()
    if evidence.permission_status != Evidence.PermissionStatus.AVAILABLE:
        return "unavailable"
    if evidence.observed_at > as_of:
        return "future_observation"
    if evidence.review_due is None:
        return "unknown"
    review_date = timezone.localtime(as_of).date()
    if review_date > evidence.review_due:
        return "stale"
    return "current"


def _validate_axis_reviews(axis_reviews):
    if not isinstance(axis_reviews, dict) or set(axis_reviews) != set(CONFIDENCE_AXES):
        raise ConfidenceReviewError(
            "Every confidence axis must be reviewed exactly once."
        )
    normalized = {}
    for axis in CONFIDENCE_AXES:
        value = axis_reviews[axis]
        if not isinstance(value, dict) or set(value) != {"state", "reason"}:
            raise ConfidenceReviewError(f"Axis {axis} needs a state and reason.")
        state = value["state"]
        reason = value["reason"]
        if not isinstance(state, str) or state not in AXIS_STATES:
            raise ConfidenceReviewError(f"Axis {axis} has an unsupported state.")
        if (
            not isinstance(reason, str)
            or not reason.strip()
            or len(reason.strip()) > 1000
        ):
            raise ConfidenceReviewError(f"Axis {axis} needs a bounded explanation.")
        normalized[axis] = {"state": state, "reason": reason.strip()}
    return normalized


def evaluate_claim_confidence(
    *,
    axis_reviews,
    contradiction_status,
    contradiction_reason,
    essential_information_missing,
    missing_information_reason,
    limitations_known,
    limitations_reason,
    rationale,
    linked_evidence,
    claim_expires_at=None,
    as_of=None,
):
    """Apply the editorial ordinal rubric; this is not a probability or score."""

    as_of = as_of or timezone.now()
    reviews = _validate_axis_reviews(axis_reviews)
    if (
        not isinstance(contradiction_status, str)
        or contradiction_status not in CONTRADICTION_STATES
    ):
        raise ConfidenceReviewError("Material contradiction status must be reviewed.")
    if (
        not isinstance(contradiction_reason, str)
        or not contradiction_reason.strip()
        or len(contradiction_reason.strip()) > 1000
    ):
        raise ConfidenceReviewError("Contradiction review needs an explanation.")
    if not isinstance(essential_information_missing, bool):
        raise ConfidenceReviewError("Missing-information state must be explicit.")
    if essential_information_missing and (
        not isinstance(missing_information_reason, str)
        or not missing_information_reason.strip()
    ):
        raise ConfidenceReviewError("Missing required information needs a reason.")
    if not isinstance(limitations_known, bool):
        raise ConfidenceReviewError("Evidence limitations must be explicitly reviewed.")
    if limitations_known and (
        not isinstance(limitations_reason, str) or not limitations_reason.strip()
    ):
        raise ConfidenceReviewError("Known limitations need an explanation.")
    if (
        not isinstance(rationale, str)
        or not rationale.strip()
        or len(rationale.strip()) > 2000
    ):
        raise ConfidenceReviewError("The reviewer needs a bounded overall rationale.")

    evidence_rows = list(linked_evidence)
    source_trace = []
    for link, evidence in evidence_rows:
        source_trace.append(
            {
                "link_id": str(link.pk),
                "link_revision": link.revision,
                "polarity": link.polarity,
                "evidence_id": str(evidence.pk),
                "evidence_revision": evidence.revision,
                "permission_status": evidence.permission_status,
                "observed_at": evidence.observed_at.isoformat(),
                "review_due": evidence.review_due.isoformat()
                if evidence.review_due
                else None,
                "freshness": evidence_freshness(evidence, as_of=as_of),
            }
        )
    fresh_evidence = [row for row in source_trace if row["freshness"] == "current"]
    claim_expired = claim_expires_at is not None and claim_expires_at <= as_of

    if essential_information_missing or claim_expired or not fresh_evidence:
        conclusion = "insufficient"
    elif contradiction_status == "unresolved" or any(
        row["freshness"] == "stale" for row in source_trace
    ):
        conclusion = "low"
    elif all(review["state"] == "adequate" for review in reviews.values()) and all(
        row["freshness"] == "current" for row in source_trace
    ):
        conclusion = "high"
    elif (
        all(
            reviews[axis]["state"] == "adequate"
            for axis in ("provenance_quality", "directness_to_decision", "recency")
        )
        and limitations_known
        and contradiction_status in {"none", "resolved"}
    ):
        conclusion = "medium"
    else:
        conclusion = "low"

    trace_states = {row["freshness"] for row in source_trace}
    if claim_expired or "stale" in trace_states:
        freshness = "stale"
    elif "unknown" in trace_states or "future_observation" in trace_states:
        freshness = "unknown"
    elif "unavailable" in trace_states and not fresh_evidence:
        freshness = "unavailable"
    elif not fresh_evidence:
        freshness = "unknown"
    elif "unavailable" in trace_states:
        freshness = "unknown"
    else:
        freshness = "current"

    return {
        "confidence": conclusion,
        "freshness": freshness,
        "axis_reviews": reviews,
        "contradiction_status": contradiction_status,
        "contradiction_reason": contradiction_reason.strip(),
        "essential_information_missing": essential_information_missing,
        "missing_information_reason": (
            missing_information_reason.strip() if essential_information_missing else ""
        ),
        "limitations_known": limitations_known,
        "limitations_reason": limitations_reason.strip() if limitations_known else "",
        "rationale": rationale.strip(),
        "rule_revision": CONFIDENCE_RULE_REVISION,
        "source_trace": source_trace,
    }
