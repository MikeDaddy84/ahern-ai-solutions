# AhernAI knowledge library

Portable sales-discovery content for AhernAI's managed phone agents. Eight independently versioned industry records explain Answering Service (Level 1), Receptionist (Level 2), and Manager (Level 3) through business-specific examples and probing questions.

These are illustrative configurations authored for AhernAI, not case studies or proof of integrations already deployed. They help Jaylene and Hideo discuss a prospect's business; they are not complete production prompts for a restaurant, trade contractor, or other client. Each client still needs approved business facts, policies, workflows, configured tools and launch tests.

## Content layout

- `verticals/*.json`: canonical, platform-independent content with stable IDs, aliases, version/date, discovery questions, ordered levels, fit signals, boundaries, setup requirements, adjacent services, example dialogue and provenance.
- `retell/<vertical-id>.txt`: deterministic plain-text exports, one document per separate Retell knowledge base.
- `retell/phone-pricing-anchor.txt`: generated compact pricing instructions to include in both agent prompts so price answers do not depend on which industry chunks retrieval selects.
- `catalog.json`: matching metadata, source/export paths and SHA-256 hashes.
- `compiled-library.json`: all canonical records in one importable JSON document for a future platform.
- `shared/phone-agent-pricing.json`: machine-readable phone prices, allowances, overages and core terms. `shared/phone-agent-pricing.txt` includes the owner-approved October 7, 2026 scope clarification; dollar amounts and allowances remain unchanged from the October 3 website snapshot. Prices are intentionally absent from industry records.
- `shared/website-services.txt`: the other service pillars and pricing from the same review.
- `deployment/retell.json`: verified deployment mapping and version/status record; not required by a future platform.

## Update and export

Python 3.10+ and the standard library are sufficient:

```sh
python build_library.py
python build_library.py --check
```

Edit the canonical JSON, bump its content version/date, render, and commit both source and exports. Validation checks required structure, stable IDs, unique aliases, all three levels in order, provenance, absence of duplicated dollar prices in vertical records, pricing field shape, and exact export consistency. It does not establish live conversation quality or integration compatibility.

Package scope is synchronized with [AhernAI's phone-agent page](https://ahernai.com/services/ai-phone-agents). The October 7 owner clarification supersedes the previous calendar/CRM connection quotas and mandatory three-level overview. Review the shared snapshot whenever prices or package boundaries change. For a future runtime, select the matching vertical by stable ID and load it with shared pricing. Ask when the business is ambiguous. Treat aliases as matching hints; do not combine unrelated industry policies or silently map an unknown business.

## Retell deployment

Create a separate knowledge base using each record's `retell_name` and upload its corresponding `retell/<vertical-id>.txt` as the document. Attach the vertical bases and **AhernAI Services & Pricing** to the sales-discovery agents. Include the generated `retell/phone-pricing-anchor.txt` in each agent prompt and update it together with the shared KB whenever prices change. In testing, industry retrieval could omit the pricing chunk; this explicit pricing anchor addresses that failure. Keep live tool configuration separate from knowledge content; importing an example does not authorize scheduling, dispatch, payment, refunds or private-system access.

Discovery identifies the business, recurring call problem and desired next action. Recommend Level 1 when messages are enough; discuss Level 2 directly when routine work needs completion. Introduce Level 3 only when the caller asks about it, explicitly requests all three plans, or raises employee coordination, supervisory duties or difficult/disgruntled callers. Do not probe for complaints merely to manufacture an upsell. Answer pricing for the plan under discussion first. Keep each exchange short, with one useful question.

Level 1 does not include booking, order submission, CRM updates or screened transfers. Level 2 includes the automation and integration work for agreed routine receptionist duties, such as food-order taking, appointment changes and customer-record updates, without an additional AhernAI automation/build fee. Calendar and CRM can be combined within those duties. Verify named application/POS compatibility during setup without automatically quoting an extra charge. Included duties are not universal application support or unlimited software development. Texting usage, additional transfer usage and actual projects outside the agreed duties retain separately disclosed terms.

Level 3 adds difficult-caller handling, approved employee coordination, policy guidance and escalation. Human owners retain financial, employment, staffing-approval, disciplinary and policy-exception decisions. Examples do not authorize unconfigured actions or collection of sensitive employee details.

Keep a local rollback copy before replacing a Retell source. Update the existing nine KBs in place and verify that the superseded source is no longer listed after saving. Retell's combined add/remove edit may retain a prior document; a follow-up source replacement and verification is required when that happens. Do not leave conflicting versions attached or create additional billable KBs unnecessarily.

Before deploying for an actual client, confirm business facts and policies, integration compatibility, available tools, consent and appropriate data collection, escalation contacts, failure paths and real-call behavior. Keep client credentials, customer records and private operational contacts out of this reusable library and public GitHub repositories.
