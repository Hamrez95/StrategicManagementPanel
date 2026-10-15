# ADR-006 — Evidence, confidence and freshness

Status: accepted for development, 2026-10-15.

Context: research separates fact/estimate/hypothesis/assumption from evidence origin; legacy profile embeds user-selected confidence labels.

Decision: Claim/Evidence and supports/refutes links preserve scope, source, method, sample, period, owner and permissions. Confidence is a reviewed ordinal rubric with axis reasons and version, not statistical probability. Essential unknown dependency yields insufficient; unresolved material contradiction caps reviewed confidence at low. Recency uses context/owner review_due, never one expiry for every phenomenon.

Consequence: retain legacy label as reported provenance, do not silently upgrade it. Duplicate imports from the same source are not independent corroboration. Historical recommendation snapshots stay immutable. Numeric health aggregation and benchmarking require separate evidence/calibration (STR-069/068); STR-057 owns persistence and enforcement.
