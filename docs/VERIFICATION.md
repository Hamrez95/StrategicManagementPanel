# Verification — 2026-10-11

## Automated checks

- `npm run check`: syntax checks every JavaScript module in `src/` and `scripts/`.
- `npm test`: four test files pass, covering calculations, charts, recording-DOM interface behavior and appearance/localization preferences.
- `npm run build`: produces a static `dist/` with local fonts, illustrations, bilingual UI modules and both PWA manifests. There are no runtime CDN dependencies.
- `git diff --check`: whitespace validation.

## Real browser verification

`scripts/verify-experience.mjs` uses Playwright and a real Chromium browser, with desktop 1440×1000 and mobile 390×844 viewports. Final result: **152 route/viewport/language checks, 29 walkthrough steps, zero uncaught errors and zero untranslated visible seed/UI strings**. The verification checks:

- All 18 primary views, nine matrix routes and all concept lessons; Persian and English interface rendering.
- RTL/LTR direction, horizontal overflow containment, dark theme and local preference persistence.
- Guided tutorial next/back/finish controls, keyboard focus confinement, Escape dismissal and viewport bounds. Complete walkthroughs cover ICP, EFE, IFE, QSPM, BCG and finance.
- Global learning disable: tutorial controls, information buttons and learning navigation disappear; direct lesson links return to the overview.
- Essential invalid-weight warnings remain visible in professional mode; invalid QSPM results are not presented as zero-valued rankings.
- Changing presentation preferences does not mutate business records. Saving an unchanged localized company form preserves canonical values.
- English search, preference-control focus restoration, matrix-edit scroll preservation, reduced-motion rendering and offline refresh after Service Worker activation.
- No uncaught browser JavaScript errors and no untranslated visible seed/UI strings during the English route sweep.

Screenshots and a machine-readable result are generated in ignored `test-results/`. Visual review includes the light Persian overview, dark English settings, EFE tutorial, mobile ICP tutorial and mobile professional mode. Large charts scroll inside their container on mobile to preserve readable labels.

## Remaining practical checks

- Actual PWA installation on physical Android/iOS devices, notification handling and HTTPS deployment cache updates were not verified by these browser tests.
- This is not a full WCAG or screen-reader certification. Focus, keyboard behavior, reduced motion and responsive layout have focused coverage.
- The PowerShell runner was not executed on Windows in this Linux environment.

## Deployment

The prior Vercel project-creation attempt returned 403. This change does not claim a successful Vercel deployment. It can be reviewed using the repository’s local PowerShell runner.
