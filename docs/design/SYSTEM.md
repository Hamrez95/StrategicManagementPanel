# STR-006 — shared workspace design system

## Design plan and review

The manager's core task is turning an analysis into a defensible decision. Keep controls, input errors and evidence readable. Use one calm work surface with grouped actions and independent tables rather than repeating KPI cards. The public interactive strategy path remains the memorable visual; working components use restrained structure.

Palette: canvas #f8fafc, paper #ffffff, ink #172b4d, action #2459ed, evidence/accent #0f766e, essential control border #718198. Dark equivalents are semantic, not blanket inversion. Body uses locally licensed Vazirmatn at 16px with generous line height; rem-based controls follow zoom. Type steps: 14px supplementary, 16px body, 24px section, responsive page heading. Spacing follows 4/8/12/16/24/32px. Control radius 10px and panel radius 16px encode hierarchy.

The first proposal reused a pale decorative border on inputs. Revised to a stronger essential control token for contrast and clear affordance. Error text explains the correction and is linked to the field; color alone never indicates state. Animation is 120ms for action feedback, 180ms for opening a panel; no entrance animation for each content row. Skeleton/spinner stop under system or personal reduced motion.

## Components and use

`packages/ui` owns tokens/styles and shared primitives. Native buttons/inputs/tables carry built-in semantics; Radix Dialog/Tabs/Toast supply headless interaction behavior. Official references: [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Tabs](https://www.radix-ui.com/primitives/docs/components/tabs), [Toast](https://www.radix-ui.com/primitives/docs/components/toast).

- Button: primary/secondary/quiet/danger, disabled and pending; pending blocks duplicate submissions. Links remain real anchors with shared `ui-button` styles.
- Input: visible label, stable generated ID, hint and error associations. Parents own value so request failures can retain text.
- Table: caption, column/row headers, local horizontal scroll region accessible to the keyboard. API numbers remain unchanged; callers format visible values with locale.
- Dialog: title/description, focus trap, Escape and trigger focus restoration. Parent controls dirty state; do not dismiss a production form with unsaved changes without a recovery policy.
- Tabs: roving focus and direction-aware arrows, disabled tab support. Content communicates loading/empty/error independently.
- Toast: announced transient nonessential feedback, close control, F8 viewport access. Critical errors stay inline; don't put required decisions in a timed notification.
- Skeleton: descriptive status and decorative lines; only show during real requests in product flows.
- EmptyState: understandable next step, optional real action. Do not invent stored data to fill it.

`UIProvider` sets direction and personal motion for descendants/portals. MotionConfig also respects stored personal motion and the OS. Root language translation comes in STR-044; the development page already exercises both directions with genuine localized sample labels/numbers.

## Development and acceptance

Run `npm run dev`, open `/__dev/ui`; it is development-only and omitted by the production build. No operator permission or fake account unlocks it in production. It is a component lab, not a customer Workspace, and all preview operations explicitly say no server save.

`npm run test:ui` checks the running development server (default 5173) with Playwright. It exercises viewport/theme/direction, field associations, dialog keyboard/retained text, tabs, notifications, contrast, text enlargement and reduced motion. Optional STRATINO_PRODUCTION_URL verifies the lab is absent on the built site. Screenshots/report are in test-results/ui; representative evidence is committed under docs/qa/ui.

Rollback: revert this UI-only PR; legacy project data and preference keys remain unchanged. This task does not implement authentication, workspace CRUD or autosave.

## Verified evidence (2026-10-14)

The component run passed all 16 viewport/theme/language combinations, zero scoped axe violations, explicit semantic color contrast assertions, keyboard modal containment/restoration, direction-aware tab arrows, inline errors, retained draft, notification dismissal, system/personal reduced motion, 200% text enlargement at 360/1280 and 200% layout zoom at 1280. Production returns the missing-page route for /__dev/ui. Production web regression also passed eight responsive/theme checks plus session/deep-link/API boundaries. These checks are automated evidence, not a claim of a full human screen-reader audit.

Visual critique: inspected mobile Persian/light and desktop English/dark screenshots. Kept one surface and section dividers rather than a repeated card layout. The stronger input borders remain legible in dark theme. Mobile tables preserve column meaning with their own scroll, while forms/actions reflow; no page overflow. Disabled controls visibly differ and are also semantically disabled. The development page keeps its preview-only warning. Screenshots/report: docs/qa/ui.

A development regression revealed public legacy /src/styles.css shadowing the React source CSS module. React styles now live at /src/styles/app.css, preserving old prototype assets while avoiding the collision; the browser test exercises the actual development route.
