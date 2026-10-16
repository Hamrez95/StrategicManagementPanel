# ADR-008 — First-run business setup and configurable plan boundary

Date: 2026-10-16
Status: accepted for design and prototype; production entitlement/runtime contract remains open

## Context

The owner confirmed the intended first-use sequence: account registration, business-purpose questions, tailored follow-up, then the first business dashboard. Each Workspace represents one business. The owner wants a free initial experience with one owned Workspace and some visibly locked tools; a subscribed account can create another Workspace for another business and repeat discovery there.

Current implementation has email verification, a short onboarding/profile flow and owned Workspaces. It has no configurable plan catalog, capability entitlement, owned-Workspace quota enforcement or complete billing lifecycle. Workspace scope does not yet model a venture/business unit inside an organization. Organization question IDs/adapters are gated by STR-066.

## Decision

1. Preserve register → verify → sign in. For a first-time owner, capture only business kind, current objective, optional self-reported lifecycle stage and business/Workspace name before creating the first Workspace.
2. Ask objective-relevant follow-ups only when canonical profile/import data does not already answer them. Skip/unknown is valid. Team size and revenue cannot assign lifecycle stage. First-run questions do not block dashboard access or invited/returning users.
3. One Workspace is one independently scoped business. Header switching and creation are account-level affordances. A newly created Workspace starts blank and can run discovery against its own data; no business facts or drafts carry over.
4. Keep membership, Workspace ownership and BillingAccount ownership distinct. Joined Workspaces do not count against an owned-Workspace allowance.
5. Treat free/paid access as server-issued, configurable entitlements. UI lock cards remain named and accessible with a reason and access path. Never gate security, existing data access, export or recovery. Do not promise unlimited usage or hard-code prices before STR-028/029/035.
6. Organization-specific follow-up and business-unit/venture scope stay blocked until stable IDs/adapters and domain ownership are reviewed. Do not create one Workspace per department by default.

## Consequences

- First-use onboarding should be short and can be resumed from each Workspace header.
- Quotas require atomic server enforcement and explicit reason codes; a browser-only counter is demonstration-only.
- Upgrade copy can explain access but cannot present a purchase as successful until the billing contract exists.
- Cross-business portfolio metrics remain deferred and must not combine incompatible periods, currencies or permissions.
- The `/management-preview` interaction demonstrates only local UI behavior; it is not a Journey runtime, billing UI or authorization check.

## Revisit when

STR-028/029 define real plans, price, capacity and transition behavior; STR-066 approves organization question adapters and business-unit scope; first-use usability tests show whether this question order creates value without excess friction.
