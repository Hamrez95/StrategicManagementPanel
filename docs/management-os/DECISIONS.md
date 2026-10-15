# Management OS decision register — 2026-10-15

| ADR                                       | Decision                                                                               | Consequence / revisit trigger                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [002](../adr/002-management-knowledge.md) | Immutable approved knowledge release; research formats are not runtime                 | Explicit adapters/claim review; revisit when a second real consumer requires schema evolution |
| [003](../adr/003-business-twin.md)        | Business Twin is a scoped projection over existing canonical owners                    | Additive migrations, compatibility reads; no giant JSON or graph DB                           |
| [004](../adr/004-adaptive-journey.md)     | Separate prerequisite DAG from returning stage transitions; inputs bind canonical data | Reviewed typed predicates; no prose execution or hard-coded page sequence                     |
| [005](../adr/005-calculations-and-ai.md)  | Deterministic calculations/rules, contextual optional AI                               | Python authoritative, TS preview fixtures; unknown is not zero; no eval                       |
| [006](../adr/006-evidence-confidence.md)  | Claim type, evidence origin, confidence and freshness are independent                  | No invented probability/health weights; preserve contradictions and reported legacy labels    |

Accepted for development planning by the owner's request to proceed after audit. Does not assert implementation or scientific certification. Existing ADR-001 tenant ownership, session/CSRF, private files and billing boundaries remain binding. Brand remains existing Stratino until a separate naming decision; Startino is the requested Management OS vision, not permission for another rebrand.
