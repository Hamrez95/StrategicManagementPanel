# ADR-005 — Deterministic calculations, rules and AI boundaries

Status: accepted for development, 2026-10-15.

Context: existing TS domain includes legacy financial conventions; KB formulas are richer human specifications and cannot be executed safely as strings.

Decision: allowlisted metric/method functions, Python Decimal authoritative for saved finance, TS previews checked against shared method fixtures. Keep units/period/currency/basis and value status explicit; no eval. Start with contribution amount, without reinterpreting legacy LTV/ROI or introducing global thresholds. Scenario runs follow data/calculation foundation and retain actuals.

Rules: small reviewed eq/neq/in operators, three-valued logic, bounded diagnostic traversal and traceable candidate actions. AI may draft/explain/summarize with opt-in and review; it never supplies permissions, formula results, completion, branch decisions or confidence scores.

Consequence: STR-058/062 own deterministic implementation; STR-042 advanced finance/scenario and STR-047 copilot remain separate later tasks. No heavy AI framework or microservice.
