"""Validate portable vertical records and render deterministic Retell text files.

Usage: python build_library.py [--check]
No external dependencies. --check verifies committed exports without rewriting.
"""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
IDS = {'restaurants', 'plumbing', 'residential-electrical', 'hvac',
       'smart-home-technology', 'auto-repair', 'salons-spas', 'cleaning-services'}
FIELDS = {'schema_version', 'id', 'name', 'retell_name', 'version', 'updated_at',
          'purpose', 'aliases', 'summary', 'discovery_questions', 'levels',
          'scope_boundaries', 'setup_requirements', 'adjacent_services',
          'example_conversation', 'provenance'}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def strings(value, label, minimum=1):
    require(isinstance(value, list) and len(value) >= minimum, f'{label}: expected a nonempty list')
    require(all(isinstance(x, str) and x.strip() for x in value), f'{label}: blank or non-string value')

def validate(v, path):
    require(set(v) == FIELDS, f'{path}: unexpected/missing fields: {set(v) ^ FIELDS}')
    require(v['id'] == path.stem and v['id'] in IDS, f'{path}: invalid stable ID')
    require(v['schema_version'] == '1.0', f'{path}: unsupported schema')
    require(re.fullmatch(r'\d+\.\d+\.\d+', v['version']), f'{path}: invalid content version')
    require(re.fullmatch(r'\d{4}-\d{2}-\d{2}', v['updated_at']), f'{path}: invalid date')
    for key in ['name', 'retell_name', 'purpose', 'summary']:
        require(isinstance(v[key], str) and v[key].strip(), f'{path}: invalid {key}')
    require(len(v['retell_name']) <= 35, f'{path}: Retell name too long')
    for key in ['aliases', 'discovery_questions', 'scope_boundaries', 'setup_requirements']:
        strings(v[key], f'{path}:{key}', 2)
    require([x['level'] for x in v['levels']] == [1, 2, 3], f'{path}: levels must be 1,2,3 in order')
    for level in v['levels']:
        require(set(level) == {'level', 'name', 'use_cases', 'probe', 'fit_signals'}, f'{path}: level shape')
        strings(level['use_cases'], f'{path}:use_cases', 2)
        strings(level['fit_signals'], f'{path}:fit_signals', 1)
        require(level['probe'].strip() and level['name'].strip(), f'{path}: empty level label/probe')
    require(len(v['adjacent_services']) >= 1, f'{path}: no adjacent service')
    for item in v['adjacent_services']:
        require(set(item) == {'service', 'trigger', 'example'} and all(isinstance(x, str) and x.strip() for x in item.values()), f'{path}: adjacent service shape')
    require(len(v['example_conversation']) >= 4, f'{path}: conversation too short')
    for turn in v['example_conversation']:
        require(set(turn) == {'speaker', 'text'} and turn['speaker'] in {'caller', 'agent'} and turn['text'].strip(), f'{path}: invalid example turn')
    require(len(v['provenance']) >= 2, f'{path}: source and authorship provenance required')
    for source in v['provenance']:
        require(set(source) == {'type', 'source', 'note'}, f'{path}: source shape')
        require(source['type'] in {'capability_source', 'authored_guidance'}, f'{path}: source type')
    require({'capability_source', 'authored_guidance'} <= {x['type'] for x in v['provenance']}, f'{path}: incomplete provenance')
    require(not re.search(r'\$\s*\d', json.dumps(v)), f'{path}: prices belong in shared pricing source')

def render(v):
    lines = [f"AHERNAI VERTICAL: {v['name'].upper()}",
             f"Stable ID: {v['id']} | Content version: {v['version']} | Updated: {v['updated_at']}",
             '', 'PURPOSE AND AUTHORITY', v['purpose'],
             'These are authored, illustrative configurations for business-owner discovery, not claims of completed customer deployments. The published AhernAI package scope is the capability source. These examples do not enable tools or integrations in Jaylene or Hideo.',
             'Pricing authority: AhernAI Services & Pricing / Phone Agent Levels and Pricing — 2026-10-07. Retrieve that shared source for prices, setup, minutes and exclusions; do not infer prices from this vertical.',
             '', 'MATCH THIS BUSINESS', 'Also described as: ' + '; '.join(v['aliases']), v['summary'],
             'Use only examples for the caller’s confirmed business. If the category is ambiguous, ask a clarifying question before selecting it. Do not combine unrelated vertical policies.',
             '', 'DISCOVERY QUESTIONS — ASK ONE AT A TIME']
    lines += ['- ' + x for x in v['discovery_questions']]
    lines += ['', 'DISCOVERY: RECOMMEND BY NEED',
              "Ask one useful question at a time about the caller's actual workflow. Explain Level 1 when messages and FAQs fit; move directly to Level 2 when the caller needs routine work completed. Recommend the lowest suitable level as soon as the need is understood; no mandatory three-level tour. Introduce Level 3 only when the caller asks about it, requests all three levels, or raises employee coordination, supervisory duties or difficult/disgruntled callers. Routine order-taking, scheduling, CRM work or the number of connected tools does not trigger a Manager upsell."]
    bounds = {
        1: 'Scope: approved FAQs, caller details and reason, summary to ONE agreed destination. No included booking, CRM integration, or screened transfers.',
        2: 'Routine receptionist duties and the supporting automation are included in the agreed Level 2 scope, without an additional AhernAI automation or integration-build charge. Confirm software compatibility, access, allowed actions and failure handling during setup; an unverified connection is not an automatic surcharge.',
        3: 'Scope: Receptionist plus difficult-caller handling, approved employee coordination, policy guidance and escalation. Human owners retain financial, employment and policy-exception decisions. Introduce Level 3 only when the caller asks about it, requests all three levels, or raises employee coordination, supervisory duties or difficult/disgruntled callers. Routine order-taking, scheduling, CRM work or the number of connected tools does not trigger a Manager upsell.'}
    for level in v['levels']:
        lines += ['', f"LEVEL {level['level']} — {level['name'].upper()}", bounds[level['level']]]
        lines += ['- ' + x for x in level['use_cases']]
        lines += ['Probe: ' + level['probe'], 'Useful when: ' + '; '.join(level['fit_signals'])]
    for title, key in [('SCOPE BOUNDARIES', 'scope_boundaries'), ('CLIENT SETUP INFORMATION TO CONFIRM', 'setup_requirements')]:
        lines += ['', title] + ['- ' + x for x in v[key]]
    lines += ['', 'ADJACENT AHERN AI SERVICES — ONLY WHEN A STATED NEED FITS']
    lines += [f"- {x['service']}: When {x['trigger']} {x['example']}" for x in v['adjacent_services']]
    lines += ['', 'ILLUSTRATIVE DISCOVERY CONVERSATION']
    lines += [f"{x['speaker'].capitalize()}: {x['text']}" for x in v['example_conversation']]
    lines += ['', 'SOURCES AND AUTHORSHIP']
    lines += [f"- {x['type']}: {x['source']} — {x['note']}" for x in v['provenance']]
    return '\n'.join(lines) + '\n'

def main():
    paths = sorted((ROOT / 'verticals').glob('*.json'))
    require({p.stem for p in paths} == IDS, 'Missing or unexpected vertical files')
    catalog, records, outputs, aliases = [], [], {}, {}
    for path in paths:
        v = json.loads(path.read_text(encoding='utf-8-sig'))
        validate(v, path)
        for alias in [v['name'], *v['aliases']]:
            key = alias.casefold().strip()
            require(key not in aliases or aliases[key] == v['id'], f'Ambiguous alias: {alias}')
            aliases[key] = v['id']
        content = render(v)
        outputs[f"retell/{v['id']}.txt"] = content
        catalog.append({'id': v['id'], 'name': v['name'], 'retell_name': v['retell_name'], 'version': v['version'], 'aliases': v['aliases'], 'source': f"verticals/{v['id']}.json", 'retell_document': f"retell/{v['id']}.txt", 'sha256': hashlib.sha256(content.encode()).hexdigest()})
        records.append(v)
    pricing = json.loads((ROOT / 'shared/phone-agent-pricing.json').read_text(encoding='utf-8'))
    require([p['level'] for p in pricing['plans']] == [1, 2, 3], 'Pricing levels must be ordered')
    price_lines = ['VERIFIED PHONE-AGENT PRICING — ' + pricing['verified_at'],
                   'Source: ' + pricing['source_url'],
                   'Owner-approved scope updated October 7, 2026; amounts unchanged from the October 3 website snapshot. Quote the relevant plan first; quote all tiers only when explicitly requested. Use these exact amounts even when industry retrieval omits pricing. Do not guess, substitute remembered figures, or claim the published included minutes are unknown. This dated table and the shared pricing KB are the verified snapshot; flag any conflicting newer source for Mike instead of inventing a reconciliation.',
                   'Prices are USD PER AGENT before applicable taxes. Distinguish MONTHLY subscription, ONE-TIME setup and usage charges.']
    for p in pricing['plans']:
        for key in ['monthly', 'setup', 'included_minutes', 'additional_minute']:
            require(isinstance(p[key], (int, float)) and p[key] > 0, f'Invalid pricing field {key}')
        price_lines.append(f"Level {p['level']} {p['name']}: ${p['monthly']:,}/month; ${p['setup']:,} one-time setup; {p['included_minutes']} included AI-handled minutes/month; ${p['additional_minute']:.2f} per additional minute. {p['integration_scope']}")
    price_lines += pricing['terms']
    outputs['retell/phone-pricing-anchor.txt'] = '\n'.join(price_lines) + '\n'
    outputs['catalog.json'] = json.dumps({'schema_version': '1.0', 'updated_at': max(v['updated_at'] for v in records), 'pricing_source': 'shared/phone-agent-pricing.json', 'pricing_detail': 'shared/phone-agent-pricing.txt', 'agent_pricing_anchor': 'retell/phone-pricing-anchor.txt', 'verticals': catalog}, indent=2, ensure_ascii=False) + '\n'
    outputs['compiled-library.json'] = json.dumps({'schema_version': '1.0', 'verticals': records}, indent=2, ensure_ascii=False) + '\n'
    check = '--check' in sys.argv
    for relative, content in outputs.items():
        dest = ROOT / relative
        if check:
            require(dest.exists() and dest.read_text(encoding='utf-8') == content, f'Stale or missing export: {relative}')
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding='utf-8', newline='\n')
    print(f'Validated {len(records)} verticals, unique aliases, ordered levels, provenance and shared pricing; {"checked" if check else "rendered"} {len(outputs)} exports.')

if __name__ == '__main__':
    main()
