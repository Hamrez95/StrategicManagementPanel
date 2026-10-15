# Implementation dependency graph

Source of truth: `docs/backlog/catalog.json`; diagram shows the new critical path, not a second scheduler. Existing task dependencies and security/release gates still apply.

```mermaid
flowchart LR
  K[053 integrity] --> L[054 reviewed loader]
  Q[055 baseline quality] --> UI[064 Journey UX]
  C[056 canonical migration] --> E[057 evidence]
  E --> M[058 metric/calculation]
  L --> M
  C --> A[059 assessment]
  E --> A
  L --> A
  A --> J[060 Journey]
  L --> J
  J --> I[061 inputs]
  C --> I
  E --> I
  L --> R[062 diagnostics/rules]
  E --> R
  M --> R
  J --> R
  R --> N[063 recommendation/action]
  X[021 canonical execution] --> N
  I --> UI
  N --> UI
  N --> D[027 operating dashboard]
  T[026 shared coaching] --> S[065 vertical slice]
  UI --> S
  D --> S
  S --> O[066 organization expansion]
  N --> CR[067 cadence]
  B[043 BSC and risk] --> CR
  M --> SC[042 advanced finance/scenarios]
  K --> RE[068 research gaps]
  N --> G[069 management gaps]
  D --> G
  N --> AI[047 contextual copilot]
```

Order 053 → 055 → 054 → 056 → 057 → 058 is chosen to keep one coherent task at a time; 055 has its own existing STR-016 dependency. 056 also depends on existing 005/018/021. Existing import/onboarding are **inputs to** canonical migration; do not add a reverse dependency from them to 056, which would introduce a cycle. New import/onboarding adaptations happen as follow-ups under migration.

P0/P1 are development priority. Existing P0 security, backup, payments and release blockers are not downgraded by the new foundation sequence. Physical/Compose/browser queue is in NEXT_ACTIONS.md; postponed testing is not removed from the acceptance graph.
