# API client and Workspace profile saving

`apps/web/src/api/client.ts` is the shared same-origin JSON transport. It keeps CSRF handling, no-store requests, abort support, structured validation errors and session-expiry signaling in one place. Auth and Workspace feature clients use the same `ApiError` contract.

The Workspace client mirrors the profile operation and schemas from `docs/api/openapi.json` in `apps/web/src/api/contracts.ts`. Responses are decoded before entering React Query, including the OpenAPI field limits and the positive revision requirement. `apps/web/src/api/queryKeys.ts` is the shared source for session, account, Workspace list and Workspace-scoped detail/profile/member/invitation keys.

Project direction fields autosave after a short pause. Every PATCH sends the revision read with that draft. The server locks and compares that revision; a stale write returns `409 revision_conflict`. A conflict gives the user a choice to load the server version or explicitly rebase their draft on the latest revision. If a write response is lost or the server reports a transient failure, the client reads the current profile first: matching fields count as saved, an unchanged revision permits one identical retry, and a changed revision becomes a visible conflict. A failed reconciliation stays in an error state and never reports saved.

Workspace business data is not copied to local storage for offline recovery. Cosmetic device preferences remain the only local preferences. Switching Workspace keeps requests and query data scoped to the captured Workspace id, and an authenticated API `401` clears private query data and returns the user through the session boundary.

Browser scenarios cover debounced save, a concurrent revision conflict, an applied write with a lost response, a failed request/reconciliation followed by user retry, and a protected API `401` that returns through the login boundary. They are authored in `scripts/verify-web.mjs` and remain pending the final validation batch.
