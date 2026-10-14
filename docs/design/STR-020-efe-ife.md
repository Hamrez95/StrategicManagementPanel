# STR-020 — EFE/IFE calculation and interpretation

## Design plan and critique

- **Palette:** reuse the shipped ink `#172B4D`, paper `#FFFFFF`, action blue `#2459ED`, teal accent `#0F766E`, and line `#DCE4EF`; semantic theme tokens stay in control of light and dark appearance.
- **Type:** the existing local Vazirmatn family carries Persian labels and dense table values; use the established body scale and tabular numerals for weights and scores.
- **Layout:** keep one editable factor ledger and a narrow result rail. At mobile widths the result rail moves above the horizontally scrollable table so the score and completion state remain visible before detailed rows.

```text
┌ EFE / IFE switch ───── Workspace name ───── Save state ┐
├ factor ledger and evidence ────────────────┬ result ───┤
│ row | type | weight | rating | evidence    │ 2.82 / 4  │
│ ...                                      │ weight 100%│
└ add / import SWOT snapshot ────────────────┴ limits ───┘
```

The page's distinguishing element is the compact score rail: it pairs the score with weight completeness and the method's limitation. The table remains the primary editing surface. Reusing the Workspace strategy palette and Vazirmatn makes the new matrix feel part of Stratino; the EFE/IFE split and explicit evidence column keep the domain visible rather than turning it into a generic KPI dashboard.

## Method and persistence

- EFE and IFE use separate registered method versions (`efe-v1`, `ife-v1`) and schema version `1`; unsupported kinds or versions fail closed.
- Each matrix stores a Workspace-scoped input snapshot and server-calculated output. Imported SWOT factors are copied into the snapshot; later SWOT changes do not silently alter a matrix.
- Weights are percentages from 0 to 100 and must total 100 within the existing `< 0.001` tolerance. Ratings are integers 1–4. IFE strengths use 3–4 and weaknesses 1–2; EFE ratings represent the organization's response regardless of opportunity/threat type.
- The full-precision weighted score is retained. The displayed value uses nearest-hundredth rounding (`Math.round(score * 100) / 100`). The 2.5 midpoint describes the center of the rating scale, not a universal success threshold.
- Drafts may retain incomplete fields. Finalization requires a valid score, all factor titles, and evidence for every factor. A finalized write recalculates on the server and returns 422 when requirements are missing.
- One current EFE and one current IFE record exist per Workspace. Optimistic revisions prevent stale writes. Viewers read; owners and editors write; archived Workspaces reject writes.

## Delivery evidence

The domain and API share `docs/fixtures/efe-ife.json` golden inputs. TypeScript, API, and browser checks are authored with this change, but runtime, database migration, Docker/server, and screenshot checks are deliberately deferred to the final system validation pass.
