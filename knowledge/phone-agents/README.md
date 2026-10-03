# AhernAI knowledge library

Portable sales-discovery content for AhernAI's managed phone agents. Eight independently versioned industry records explain Answering Service (Level 1), Receptionist (Level 2), and Manager (Level 3) through business-specific examples and probing questions.

These are illustrative configurations authored for AhernAI, not case studies or proof of integrations already deployed. They help Jaylene and Hideo discuss a prospect's business; they are not complete production prompts for a restaurant, trade contractor, or other client. Each client still needs approved business facts, policies, workflows, configured tools and launch tests.

## Content layout

- `verticals/*.json`: canonical, platform-independent content with stable IDs, aliases, version/date, discovery questions, ordered levels, fit signals, boundaries, setup requirements, adjacent services, example dialogue and provenance.
- `retell/<vertical-id>.txt`: deterministic plain-text exports, one document per separate Retell knowledge base.
- `retell/phone-pricing-anchor.txt`: generated compact pricing instructions to include in both agent prompts so price answers do not depend on which industry chunks retrieval selects.
- `catalog.json`: matching metadata, source/export paths and SHA-256 hashes.
- `compiled-library.json`: all canonical records in one importable JSON document for a future platform.
- `shared/phone-agent-pricing.json`: machine-readable verified phone prices, allowances, overages and core terms. `shared/phone-agent-pricing.txt` holds the fuller scope and pricing snapshot from October 3, 2026. Prices are intentionally absent from the industry records.
- `shared/website-services.txt`: the other service pillars and pricing from the same review.
- `deployment/retell.json`: verified deployment mapping and version/status record; not required by a future platform.

## Update and export

Python 3.10+ and the standard library are sufficient:

```sh
python build_library.py
python build_library.py --check
```

Edit the canonical JSON, bump its content version/date, render, and commit both source and exports. Validation checks required structure, stable IDs, unique aliases, all three levels in order, provenance, absence of duplicated dollar prices in vertical records, pricing field shape, and exact export consistency. It does not establish live conversation quality or integration compatibility.

Package scope comes from [AhernAI's phone-agent page](https://ahernai.com/services/ai-phone-agents). Review the shared snapshot whenever website prices or package boundaries change. For a future runtime, select the matching vertical by stable ID and load it with the shared pricing source. Ask when the business is ambiguous. Treat aliases as matching hints rather than an exhaustive taxonomy; do not combine unrelated industry's policies or silently map an unknown business.

## Retell deployment

Create a separate knowledge base using each record's `retell_name` and upload its corresponding `retell/<vertical-id>.txt` as the document. Attach the vertical bases and **AhernAI Services & Pricing** to the sales-discovery agents. Include the generated `retell/phone-pricing-anchor.txt` in each agent prompt and update it together with the shared KB whenever prices change. In testing, industry retrieval could omit the pricing chunk; this explicit pricing anchor addresses that failure. Keep live tool configuration separate from knowledge content; importing an example does not authorize scheduling, dispatch, payment, refunds or private-system access.

Discovery should identify the business and missed-call problem, explain Levels 1, 2 and 3 across short exchanges with one probe at a time, and recommend the least complex suitable plan. A caller may interrupt, request a direct price comparison, decline the overview, or request a human.

Level 1 does not include booking, CRM integration or screened transfers. Level 2 includes one standard calendar **or** CRM integration. Level 3 includes two standard integrations **total**. Custom integrations, texting and additional transfer charges are separately scoped. Refunds, financial decisions and policy exceptions remain human.

Before deploying for an actual client, confirm business facts and policies, integration compatibility, available tools, consent and appropriate data collection, escalation contacts, failure paths and real-call behavior. Keep client credentials, customer records and private operational contacts out of this reusable library and public GitHub repositories.
