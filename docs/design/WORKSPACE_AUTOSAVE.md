# Workspace profile autosave

The profile form keeps its fields in the page while the server revision remains the concurrency baseline. After 700 ms without edits, it sends a Workspace-scoped PATCH. A live status line announces pending edits, saving and confirmed save; the error is announced separately. Reduced motion is respected by the existing application motion configuration, and the status uses the shared light/dark semantic tokens.

On a stale revision, the form stops saving and shows the latest revision with two explicit actions: use the server copy, or keep the local edits and save them against that revision. A transient failure first triggers a read to discover whether the PATCH actually applied. If the read is also unavailable, the form remains dirty and offers retry and reload controls. Business fields are never written into browser storage.

The interaction was reviewed against `docs/UX_STANDARD.md`: keyboard form controls, inline field errors, announced save state, clear conflict choices, locale-formatted revisions, RTL/LTR direction and narrow layouts. Browser, assistive-technology and visual checks remain pending the final validation batch.
