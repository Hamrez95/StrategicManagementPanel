# Workspace legacy imports

All routes require a verified authenticated session and enforce Workspace membership on the server. Responses use `Cache-Control: no-store, private`. Mutations use the standard session/CSRF contract.

| Method and route                                               | Access                 | Behavior                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/workspaces/{workspace_id}/imports/preview/`      | owner/editor           | Validate a legacy backup or a versioned Stratino export without writing data.                                                                               |
| `GET /api/v1/workspaces/{workspace_id}/imports/`               | member                 | List the Workspace's import batches without archived payloads.                                                                                              |
| `POST /api/v1/workspaces/{workspace_id}/imports/`              | owner/editor           | Atomically save the mapped snapshot and sanitized source backup. Requires `Idempotency-Key`; an active same-digest batch is returned instead of duplicated. |
| `GET /api/v1/workspaces/{workspace_id}/imports/{batch_id}/`    | member                 | Read one batch, including mapped data and its recoverable source backup.                                                                                    |
| `DELETE /api/v1/workspaces/{workspace_id}/imports/{batch_id}/` | owner or batch creator | Soft-undo the batch; its saved data remains available for recovery.                                                                                         |

The legacy request is `{ "schema_version": 1, "data": <legacy state> }`. The source file limit is 1,000,000 bytes; the server allows 256 additional bytes for the request envelope. The accepted legacy state is either the direct version-1 browser state or an envelope with `schema` equal to `royesh-strategy-v1` or `stratino-legacy-v1`, `schema_version: 1`, and the state under `data`.

Preview also accepts the direct JSON envelope from a report export (`schema: "stratino-workspace-v1"`, `schema_version: 1`). Saving that preview creates a recoverable, scoped import batch; it does not replace active Workspace records. The JSON carries attachment metadata but not file bytes. A ZIP export contains both the JSON and the ready file bytes; re-uploading files is required if the archived project is later rebuilt.

Preview returns the Workspace ID/name, recognized schema version, categorized record counts, and warnings. Commit returns the batch ID, creator, digest, mapping version, counts, missing attachment count, creation/undo timestamps, and whether the operation was a duplicate. Detail adds the mapped snapshot and sanitized source backup. Error codes include `invalid_import`, `import_too_large`, `invalid_idempotency_key`, `idempotency_conflict`, `workspace_archived`, and `workspace_permission_denied`.

The mapping is versioned independently from the source schema. Version 1 maps legacy organization, analysis matrices and factors, decisions, execution lists, financial assumptions/trends, learning settings, notes, and document metadata into named JSON sections. Original browser storage is never touched. Embedded file bytes are removed before persistence and must be uploaded again; their absence is reported in preview.
