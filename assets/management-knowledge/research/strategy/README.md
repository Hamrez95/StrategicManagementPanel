# Strategy research batch — 2026-10-15

This is a researched subset, not a claim of exhaustive coverage. Canonical records are JSON under `frameworks/strategy/`; source metadata and bounded claims are in `sources/strategy.json`.

Definitions and model dimensions are attributed to named sources. Persian explanations, decision gates, evidence collection steps, applicability tags, compatibility links and implementation cautions are editorial adaptations unless a record explicitly says otherwise. They are not claims that the original authors validated this product workflow.

No automatic score or prescriptive investment engine is implemented. Source credibility concerns accurate model exposition, not empirical proof that using a framework improves results. Publication dates are null where not visible, rather than guessed from framework origin.

Delivered subset: 9 framework records and 10 sources: Five Forces, Value Chain, VRIO, SWOT, PESTEL, BCG Growth–Share, GE–McKinsey, Blue Ocean Four Actions/ERRC and Scenario Planning.

## Evidence boundaries

- Five Forces and Value Chain: [HBS ISC](https://www.isc.hbs.edu/strategy/business-strategy/Pages/default.aspx), an institutional exposition of Porter's work; not an independent effectiveness study.
- VRIO: [Barney and Wright 1998 publisher abstract](https://onlinelibrary.wiley.com/doi/10.1002/%28SICI%291099-050X%28199821%2937%3A1%3C31%3A%3AAID-HRM4%3E3.0.CO%3B2-W) explicitly supports the four dimensions. [Barney 1995 abstract](https://journals.aom.org/doi/10.5465/AME.1995.9512032192) supports complementary internal analysis. Full articles were not read; no outcome table is attributed to them. A search-indexed author-hosted PDF redirected to an unrelated inaccessible site and was excluded.
- SWOT and PESTEL: professional guidance from CIPD, not a claim about sole originators. Observed factsheet dates were 2026-05-20 and 2025-03-21 respectively.
- BCG and GE–McKinsey: originating consulting institutions describe model logic. Portfolio labels are discussion inputs; this pack does not implement automatic capital allocation, exit or acquisition recommendations.
- Blue Ocean: official authors' framework exposition, with validation steps added editorially. Different ideas are not evidence of demand.
- Scenarios: Shell's own description and cautionary note. The record uses the methodological distinction between possible futures and prediction; no energy forecast is imported as fact.

Empty `conflicting_frameworks` arrays mean no inherent logical contradiction was identified in this subset. Five Forces and Blue Ocean differ in emphasis (industry structure versus reconstructing buyer value), which is not an automatic incompatibility. BCG and GE may rank units differently because their variables differ; reconcile assumptions and scope rather than average their scores.

## Deferred explicitly

| Candidate | Status and completion gate |
| --- | --- |
| TOWS | Deferred. Found Weihrich 1982 bibliographic evidence, but no inspected primary full exposition. Obtain original article or authorized author/publisher text, then distinguish SO/ST/WO/WT generation from SWOT diagnosis. |
| Ansoff product–market growth | Deferred. Original 1957 bibliographic record identified; available full reproduction was third-party and primary content access was not established. Inspect original/authorized source before defining market/product novelty and diversification boundaries. |
| Blue Ocean Strategy Canvas | Deferred as standalone record. Current record covers Four Actions/ERRC only; inspect official canvas definitions, axes and drawing rules before adding a separate tool. |
| Porter Generic Strategies | Deferred. No dedicated source inspection in this batch. Avoid treating cost, differentiation and focus as sourced merely because Porter pages were inspected. |
| Scenario quantitative simulation | Deferred. Current record is a qualitative decision workflow; no scenario probabilities or Monte Carlo engine are established. |

## Editorial application notes

The `business_types` and `business_stages` tags describe plausible use, not verified segment-specific impact. `use_when` and `do_not_use_when` are editorial decision gates. All five-step workflows are product-oriented adaptations, even where their sequence overlaps a source. Limitations not explicitly in `source_supported` are analyst cautions. `deep_dive` text intentionally explains how to handle uncertainty rather than presenting invented empirical certainty.

No runtime, UI, dependencies or shared root documentation were modified by this batch. Validation covers JSON syntax, required fields, source references, framework references and presence of three explanation levels; it does not establish empirical efficacy.
