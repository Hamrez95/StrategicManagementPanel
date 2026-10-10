# Royesh / رویش — design brief

## Intent
An approachable Persian, RTL strategy workspace for an incoming strategy manager and a startup founder. All figures belong to a fictitious healthy-snacks company. The experience emphasizes decisions, evidence, owners, and review triggers rather than a universal strategy score.

## Visual system
- Ink `#202938`, canvas `#f7f8fa`, paper `#ffffff`.
- Action blue `#2459ed`; success `#157951`; caution `#a36515`; risk `#bc3c49`.
- Locally hosted Vazirmatn variable font (SIL OFL), requested by the user.
- Fixed right sidebar, calm white surfaces, restrained outlines, consistent 8px spacing rhythm, no decorative stock imagery.
- Buffer-inspired navigation clarity, not a reproduction of Buffer's brand or interface.
- Distinctive primary element: six-stage strategy path connected to an actionable next decision.
- Charts use native SVG; trend, weighted comparison bars, radar, BCG bubbles, SPACE vector, IE/GE grids, risk heatmap, and strategy map. No remote runtime libraries or chart requests.

## UI review before implementation
Avoided a generic row of KPIs as the entire home experience. The first block directs users to the next meaningful deliverable. Identical cards are replaced with workflow steps, editable tables, maps, and a kanban where appropriate. All education is contextual and optional.

## Scope and boundaries
- Working browser-local prototype; not a production SaaS.
- Client state persists in localStorage, includes validated JSON backup/import, and is shared only across tabs on the same origin.
- No real authentication, roles, organization multi-tenancy, notifications scheduler, ERP, AI recommendation engine, or external synchronization.
- Startup mode adds lightweight guidance; advanced tools remain accessible.
- Cash flow, ratio period, units, assumptions and source links are explicit.
- EFE/IFE weights are each 100%; QSPM inherits both groups independently. Irrelevant rows are omitted across every strategy. AS uses the textbook 1–4 convention, not a probability.
- Qualitative model scores and risk colors are local workshop conventions, not universal benchmarks.
- IRR is reported only for a positive initial investment followed by nonnegative inflows; non-conventional cash flows still support NPV.
- PWA service worker caches local assets; install UI depends on browser support. Local-only data has no cloud recovery.

## Accessibility and verification
Keyboard navigation, visible focus, tooltip on hover/focus and full explanation on click/touch, modal focus trap, escape to dismiss, skip link, labeled SVG charts, status text alongside colors, reduced-motion support, RTL-responsive styles, print styles. Mobile controls have generous wrappers; dense analytical tables scroll inside their panel.

DOM integration tests and unit tests run without a browser. Browser visual/installation QA is not claimed unless explicitly recorded in `VERIFICATION.md`.
