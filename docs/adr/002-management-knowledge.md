# ADR-002 — Versioned management knowledge

Status: accepted for development, 2026-10-15.

Context: the research KB has 0.1.0/1.0.0 shapes, nineteen unversioned documents, source depth limitations and planned concepts. Existing app has no runtime loader.

Decision: retain the research files; emit an explicit approved-ID release manifest and normalized read-only registry via exact shape/version adapters. Hash inputs and pin every management run to its release. Quarantine unknown tags/versions and unreviewed concepts. Source presence is separate from claim-level support. Public knowledge must never contain Workspace observations.

Consequences: first release promotes only the reviewed slice. STR-053 integrity, STR-054 loader and STR-068 claim research own delivery. No generic knowledge SaaS or paid extraction. Future schema evolution preserves old IDs/releases.
