# STR-021 — Design notes

## Purpose

This Workspace page turns a documented decision into owned work. A decision keeps its reason, assumptions, source, and review trigger together; its actions carry a member, due date, status, and optional goal. A compact 90-day horizon makes overdue and upcoming work legible without making the page a generic task manager.

## Design plan

- **Color:** use the existing Stratino semantic palette: Deep ink `#172B4D`, Cloud `#F8FAFC`, Paper `#FFFFFF`, Action blue `#2459ED`, Evidence teal `#0F766E`, and Alert red `#B42335`. Dark mode uses the existing semantic-token overrides.
- **Type:** Vazirmatn for Persian and English interface text, with the existing 16px body size and a restrained 30–46px page title. Dates, IDs, and user-entered evidence keep their natural direction with `dir="auto"`.
- **Layout:** align the page to the Workspace content column. Start with a clear title and the active 90-day date range, then give actions a four-lane status board. Keep the decision register below it as a ruled list; the decision’s reason and source stay beside its linked actions. On narrow screens, lanes become a vertical sequence and tables or page-wide horizontal scrolling are avoided.

```text
Wide:     [Workspace / heading + 90-day range                 ]
          [Planned] [In progress] [Blocked] [Done]  ← keyboard status control
          [Decision register: source, reason, assumptions, review trigger]
          [Linked action list with owner, due date, goal]

Narrow:   [heading + range]
          [status lane]
          [action rows]
          [decision register]
```

The alternate dense calendar grid was rejected: dates are actionable deadlines, not a promise of evenly distributed weekly capacity. A status board plus explicit date labels communicates the current work more honestly. The product's existing colors and Vazirmatn remain because the task belongs inside the established Workspace, while the decision register uses a quiet ruled list so the page is specific without another set of identical cards.

## Behavior and limits

- All records are Workspace-scoped. Owners and editors can change records; viewers can read them.
- Assignees must be active, verified Workspace members or the owner.
- Source references can point to a finalized EFE/IFE analysis or a TOWS option in the same Workspace. A source snapshot remains readable if the source is later removed.
- Dates are stored as calendar dates and the API returns the server's local date and 90-day horizon bounds. Overdue is derived from the due date and unfinished status.
- Every create and edit appends an actor-stamped history event in the same transaction.
- The board supports keyboard status changes and does not require dragging.

## Deferred validation

API permissions, Workspace isolation, membership assignment, date boundaries, revision conflicts, history, browser keyboard flow, both languages, themes, responsive widths, and screenshots are authored or listed for the final system validation. They have not been executed during feature development, per the requested sequence.
