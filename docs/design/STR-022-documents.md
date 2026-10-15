# STR-022 document library design

## Direction

Use a calm editorial workspace rather than a grid of identical cards: a compact search/filter row, a scrollable document index grouped by section, and one selected guide with its metadata and next action. The index keeps priority, saved owner (or suggested owner) and status visible; the selected guide states the next action in the review flow. On narrow screens, the index and selected guide stack in reading order. The design reuses the workspace shell, Vazirmatn and semantic light/dark tokens.

## Content and workflow

The shared catalog has 60 bilingual entries. The first five are the only complete MVP guides; each has an outline, a writing guide and a clearly labeled placeholder example. Remaining entries stay searchable inventory records with recommended owner/reviewer, audience, purpose and priority. No example is presented as customer data. Legal and financial guidance is explicitly advisory and calls for local professional review where appropriate.

Workspace records store the selected stage and industry, accountable owner, reviewer, draft/review/ready status, current content and its version. Stage and industry filters are available before an item is selected. Editors can assign and update; viewers see the board only. A ready state requires an assigned reviewer and can be approved only by that reviewer or the Workspace owner. Changing content on a ready record returns it to draft. Content changes increment the content version and the record revision; a compact actor history avoids copying sensitive content into audit events.

## Interaction and accessibility

Use labeled native controls and buttons so the full flow works without drag or pointer-only gestures. Status is shown in text and icon/label treatment, not color alone. Preserve entered text after validation or network errors, announce save feedback, block workspace switching while a form is dirty, and expose loading, empty, retry, read-only and permission states. CSS uses logical properties, semantic tokens and a reduced-motion override; verify RTL/LTR, light/dark, and 360/768/1280/1440 widths during the final browser pass.
