# Workspace reports and exports

All routes require a verified session and check current Workspace membership on every read or download. Responses are private and not cached. Creating a snapshot is available to any member and does not depend on a paid plan.

| Method and route                                                                            | Behavior                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/workspaces/{workspace_id}/exports/`                                            | List saved snapshots for the Workspace.                                                                                                                        |
| `POST /api/v1/workspaces/{workspace_id}/exports/`                                           | Save an immutable report snapshot and build its private ZIP archive. Requires `Idempotency-Key` and the standard CSRF header.                                  |
| `GET /api/v1/workspaces/{workspace_id}/exports/{record_id}/`                                | Read the snapshot after checking current membership.                                                                                                           |
| `GET /api/v1/workspaces/{workspace_id}/exports/{record_id}/download/?format=json\|csv\|zip` | Download the versioned JSON, record CSV, or ZIP archive. ZIP includes `workspace.json`, `records.csv`, and bytes for attachments whose security scan is ready. |

The JSON envelope uses schema `stratino-workspace-v1`, schema version `1`, a method version, an export timestamp, and a fixed scope. It contains Workspace profile and revision history, analyses, strategy factors and options, decisions, goals, actions and execution history, document records and history, the five available document templates, and metadata for ready attachments. Membership, invitations, billing records, account data, and private storage keys are excluded.

Snapshots are immutable and idempotent per Workspace, requesting member, and idempotency key. The Workspace is locked while data and file bytes are collected; the archive records its SHA-256 and byte size. Only ready, scanned attachment bytes enter the ZIP. JSON includes attachment metadata so it can be imported for review; importing a JSON export stores a recoverable, Workspace-scoped archive and does not overwrite active project records. The attachment bytes remain in the ZIP and must be uploaded again if the project is rebuilt from that JSON archive.

CSV is UTF-8 with a BOM and one row per record: schema version, section, record ID, and canonical JSON. PDF is produced by the browser print dialog from the report preview so text remains selectable; the page stylesheet uses A4 page size and Persian-local typography.

Errors use the shared `{ code, message, fields }` response. Workspace access that is missing or revoked returns 404; unauthenticated requests return 401; unsupported formats return 400; and a missing stored ZIP returns 410.
