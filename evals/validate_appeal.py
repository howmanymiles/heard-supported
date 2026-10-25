"""Validate the appeal add-on (FORMAT-APPEAL.md).

Usage: python3 -I validate_appeal.py cases/PIP-03 [...]   (or no args for every case with appeal.json)
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import PIP, pages, norm, HERE

NEW_DOCS = ('mr_request', 'mr_notice', 'sscs1', 'dwp_response')


def rate(p):
    return 'enhanced' if p >= 12 else 'standard' if p >= 8 else 'none'


def check(case_dir):
    d = Path(case_dir)
    errs = []
    case = json.loads((d / 'case.json').read_text())
    mr = json.loads((d / 'mr.json').read_text())
    try:
        ap = json.loads((d / 'appeal.json').read_text())
    except Exception as e:
        return [f'appeal.json unreadable: {e}']
    docs = {doc['id']: pages((d / doc['file']).read_text()) for doc in case['documents']}
    for extra in ('pa4', 'decision') + NEW_DOCS:
        p = d / 'documents' / f'{extra}.md'
        if p.exists():
            docs[extra] = pages(p.read_text())
        else:
            errs.append(f'missing documents/{extra}.md')

    def quote_ok(q, where):
        pg = docs.get(q['doc'], {})
        if isinstance(pg, list):
            pg = {i + 1: t for i, t in enumerate(pg)}
        text = pg.get(q['page']) if isinstance(pg, dict) else None
        if text is None:
            errs.append(f"{where}: no page {q['page']} in {q['doc']}")
        elif norm(q['quote']) not in norm(text):
            errs.append(f"{where}: quote not verbatim on {q['doc']} p{q['page']}: {q['quote']!r}")

    acts = {a['number']: a for a in PIP['activities']}
    notice = {}
    for a in ap['mr_notice']['activities']:
        desc = next((x for x in acts[a['activity']]['descriptors'] if x['letter'] == a['letter']), None)
        if desc is None:
            errs.append(f"mr_notice activity {a['activity']}: letter {a['letter']} not in dataset")
        else:
            notice[a['activity']] = desc
    if set(notice) != set(range(1, 13)):
        errs.append(f'mr_notice must cover activities 1-12; has {sorted(notice)}')
    else:
        dl = sum(notice[n]['points'] for n in notice if acts[n]['component'] == 'daily_living')
        mob = sum(notice[n]['points'] for n in notice if acts[n]['component'] == 'mobility')
        if ap['mr_notice']['daily_living'] != {'points': dl, 'rate': rate(dl)}:
            errs.append(f"mr_notice daily_living {ap['mr_notice']['daily_living']} != {dl} ({rate(dl)})")
        if ap['mr_notice']['mobility'] != {'points': mob, 'rate': rate(mob)}:
            errs.append(f"mr_notice mobility {ap['mr_notice']['mobility']} != {mob} ({rate(mob)})")

    bundle = ap['bundle_order']
    if 'notes' in bundle:
        errs.append('adviser notes must not be in the DWP bundle')
    for b in bundle:
        if b not in docs:
            errs.append(f'bundle_order names unknown document {b}')

    mr_letters = {x['activity']: x['adviser_letter'] for x in mr['expected_disputes']}
    issues = set()
    for x in ap['issues']:
        n = x['activity']
        issues.add(n)
        if n in notice and x['dm_letter'] != notice[n]['letter']:
            errs.append(f"issue {n}: dm_letter {x['dm_letter']} != MR notice letter {notice[n]['letter']}")
        if mr_letters.get(n) and x['adviser_letter'] != mr_letters[n]:
            errs.append(f"issue {n}: adviser_letter {x['adviser_letter']} != mr.json {mr_letters[n]}")
        adv = next((y for y in acts[n]['descriptors'] if y['letter'] == x['adviser_letter']), None)
        if adv is None:
            errs.append(f"issue {n}: adviser letter not in dataset")
        elif n in notice and adv['points'] <= notice[n]['points']:
            errs.append(f'issue {n}: adviser descriptor scores no more than the MR notice')
        quote_ok(x['dm_reasoning'], f'issue {n} dm_reasoning')
        if x['dm_reasoning']['doc'] != 'dwp_response':
            errs.append(f'issue {n}: dm_reasoning should quote dwp_response')
        if not x.get('evidence'):
            errs.append(f'issue {n}: needs evidence')
        for q in x.get('evidence', []):
            if q['doc'] not in bundle:
                errs.append(f"issue {n}: evidence from {q['doc']}, which is not in the bundle")
            quote_ok(q, f'issue {n} evidence')
        for q in x.get('not_in_bundle', []):
            if q['doc'] in bundle:
                errs.append(f"issue {n}: not_in_bundle quote from {q['doc']}, which IS in the bundle")
            quote_ok(q, f'issue {n} not_in_bundle')
        if not 3 <= len(x.get('hearing_questions', [])) <= 5:
            errs.append(f'issue {n}: want 3-5 hearing questions')
    agree = set(ap['agree'])
    if issues & agree:
        errs.append(f'both issue and agree: {sorted(issues & agree)}')
    if issues | agree != set(range(1, 13)):
        errs.append(f'every activity must be an issue or agreed; missing {sorted(set(range(1, 13)) - issues - agree)}')
    if not 3 <= len(ap.get('must_not_claim', [])) <= 6:
        errs.append('must_not_claim should have 3-6 items')
    return errs


if __name__ == '__main__':
    targets = sys.argv[1:] or sorted(str(p.parent) for p in (HERE / 'cases').glob('*/appeal.json'))
    bad = 0
    for t in targets:
        e = check(t)
        print(('FAIL ' if e else 'OK   ') + t)
        for x in e:
            print('  -', x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
