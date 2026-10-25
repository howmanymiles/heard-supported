"""Validate the MR add-on (FORMAT-MR.md) for PIP cases.

Usage: python3 -I validate_mr.py cases/PIP-01 [...]   (or no args for every case with mr.json)
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import PIP, pages, norm, HERE

ERRORS = {'evidence_ignored', 'reliability_not_considered', 'observation_overrelied',
          'typical_day_overstretched', 'aid_or_prompting_missed', 'fluctuation_misapplied', 'other'}


def rate(p):
    return 'enhanced' if p >= 12 else 'standard' if p >= 8 else 'none'


def check(case_dir):
    d = Path(case_dir)
    errs = []
    case = json.loads((d / 'case.json').read_text())
    try:
        mr = json.loads((d / 'mr.json').read_text())
    except Exception as e:
        return [f'mr.json unreadable: {e}']
    docs = {doc['id']: pages((d / doc['file']).read_text()) for doc in case['documents']}
    for extra in ('pa4', 'decision'):
        p = d / 'documents' / f'{extra}.md'
        if not p.exists():
            errs.append(f'missing documents/{extra}.md')
        else:
            docs[extra] = pages(p.read_text())

    def quote_ok(q, where, allow_pa4):
        if q['doc'] in ('pa4', 'decision') and not allow_pa4:
            errs.append(f'{where}: rebuttal evidence must come from case documents, not {q["doc"]}')
        pg = docs.get(q['doc'], {}).get(q['page'])
        if pg is None:
            errs.append(f"{where}: no page {q['page']} in {q['doc']}")
        elif norm(q['quote']) not in norm(pg):
            errs.append(f"{where}: quote not verbatim on {q['doc']} p{q['page']}: {q['quote']!r}")

    acts = {a['number']: a for a in PIP['activities']}
    chosen = {}
    for a in mr['pa4']['activities']:
        n = a['activity']
        if n in chosen:
            errs.append(f'pa4 activity {n} listed twice')
        desc = next((x for x in acts.get(n, {'descriptors': []})['descriptors'] if x['letter'] == a['letter']), None)
        if desc is None:
            errs.append(f"pa4 activity {n}: letter {a['letter']} not in dataset")
            continue
        chosen[n] = desc
        quote_ok(a['justification_quote'], f'pa4 activity {n}', True)
    if set(chosen) != set(range(1, 13)):
        errs.append(f'pa4 must cover activities 1-12; has {sorted(chosen)}')

    dl = sum(chosen[n]['points'] for n in chosen if acts[n]['component'] == 'daily_living')
    mob = sum(chosen[n]['points'] for n in chosen if acts[n]['component'] == 'mobility')
    dec = mr['decision']
    if dec['daily_living'] != {'points': dl, 'rate': rate(dl)}:
        errs.append(f"decision daily_living {dec['daily_living']} != PA4 total {dl} ({rate(dl)})")
    if dec['mobility'] != {'points': mob, 'rate': rate(mob)}:
        errs.append(f"decision mobility {dec['mobility']} != PA4 total {mob} ({rate(mob)})")

    drafts = {int(a['key'].split(':')[1]): a.get('draft_descriptor') for a in case['activities']}
    disputed = set()
    for x in mr['expected_disputes']:
        n = x['activity']
        disputed.add(n)
        if x['error_type'] not in ERRORS:
            errs.append(f"dispute {n}: bad error_type {x['error_type']}")
        if not any(dd['letter'] == x['adviser_letter'] for dd in acts[n]['descriptors']):
            errs.append(f"dispute {n}: adviser_letter {x['adviser_letter']} not in dataset")
        dd = drafts.get(n)
        if dd and dd.get('satisfied'):
            letters = {s['letter'] for s in dd['satisfied']}
            if x['adviser_letter'] not in letters:
                errs.append(f"dispute {n}: adviser_letter {x['adviser_letter']} not in case.json draft {sorted(letters)}")
        if n in chosen and chosen[n]['letter'] == x['adviser_letter']:
            errs.append(f'dispute {n}: adviser letter equals the PA4 letter')
        if not x.get('rebuttal_evidence'):
            errs.append(f'dispute {n}: needs rebuttal_evidence')
        for q in x.get('rebuttal_evidence', []):
            quote_ok(q, f'dispute {n}', False)
    agree = set(mr['agree'])
    if disputed & agree:
        errs.append(f'activities both disputed and agreed: {sorted(disputed & agree)}')
    if disputed | agree != set(range(1, 13)):
        errs.append(f'every activity must be disputed or agreed; missing {sorted(set(range(1, 13)) - disputed - agree)}')
    if not 3 <= len(mr.get('must_not_claim', [])) <= 6:
        errs.append('must_not_claim should have 3-6 items')
    return errs


if __name__ == '__main__':
    targets = sys.argv[1:] or sorted(str(p.parent) for p in (HERE / 'cases').glob('*/mr.json'))
    bad = 0
    for t in targets:
        e = check(t)
        print(('FAIL ' if e else 'OK   ') + t)
        for x in e:
            print('  -', x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
