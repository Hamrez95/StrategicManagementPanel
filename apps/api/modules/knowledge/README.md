# Knowledge release reader

This package resolves one immutable release by its exact ID. It has no Django, database, research-source, network or company-data dependency. A request for `release-a` never silently resolves to another release. Historical evaluation records must store and request their exact release ID.

## Release v1 shape

The root contains `release_id`, `schema_version`, full `source_kb_commit`, `generated_by`, `canonicalization`, `content_sha256`, sorted `approved_ids`, sorted `source_ids`, `records`, and bounded `rejected_records` diagnostics. Each approved record includes a source schema/revision, explicit adapter ID, claim-level source support state/references or a product-heuristic rationale, and a normalized object definition. The approved IDs must exactly equal the included records. Unreviewed content is never a readable record.

`content_sha256` is SHA-256 over the whole root object excluding only that hash field. The v1 canonical form sorts JSON object keys, emits compact UTF-8 without ASCII escapes or a trailing newline, and rejects non-finite numbers. This makes a formatted CRLF file and its LF equivalent produce the same digest. The API release builder must call `calculate_release_sha256` after it has assembled the complete root object.

The reader rejects duplicate keys, unknown release-schema versions, unexpected fields, missing or mismatched records/sources, invalid hashes and oversized files. It does not interpret formula prose, source applicability, diagnostic operators or rules. Source adapters and selection/promotion decisions belong to the separate reviewed release-build step. Definitions, records, lists and maps are immutable after load.

Package artifacts belong under `apps/api/modules/knowledge/releases/<release_id>.json`, inside the existing API Docker build context. This packet intentionally adds the contract and reader only. No research file is rewritten, and no production release is promoted until packet 054-B has reviewed its sources and dependencies and packet 054-C reproducibly packages it.

## Local verification

From the repository root:

```powershell
$env:PYTHONPATH = 'apps/api'
python -m unittest discover -s apps/api/modules/knowledge/tests -v
```

The tests use only the Python standard library, a temporary release directory and synthetic fixtures. They do not start Django/PostgreSQL or modify the canonical research.
