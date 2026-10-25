"""Validate synthetic cases against FORMAT.md and the descriptor dataset.

Usage: python3 -I validate.py cases/PIP-01 [cases/...]   (or no args for all cases)
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / 'descriptors.json').read_text())
PIP = next(b for b in DATA['benefits'] if b['id'] == 'pip')
WCA = next(b for b in DATA['benefits'] if b['id'] == 'uc-wca')
ADP = next(b for b in DATA['benefits'] if b['id'] == 'adp')
STATUSES = {'good', 'partial', 'conflict', 'not_on_form', 'nodiff'}
PAGE = re.compile(r'^--- Page (\d+) ---\s*$', re.M)
norm = lambda s: re.sub(r'\s+', ' ', s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip()


def pages(text):
    parts = PAGE.split(text)
    out = {1: parts[0]}
    for i in range(1, len(parts), 2):
        out[int(parts[i])] = parts[i + 1]
    return out


def check(case_dir):
    errs = []
    d = Path(case_dir)
    try:
        c = json.loads((d / 'case.json').read_text())
    except Exception as e:
        return [f'case.json unreadable: {e}']
    for k in ('id', 'benefit', 'title', 'summary', 'exercises', 'client', 'documents', 'activities', 'must_not_claim', 'expert_review'):
        if k not in c:
            errs.append(f'missing key {k}')
    if errs:
        return errs

    docs = {}
    for doc in c['documents']:
        p = d / doc['file']
        if not p.exists():
            errs.append(f"document file missing: {doc['file']}")
            continue
        pg = pages(p.read_text())
        docs[doc['id']] = pg
        if len(pg) != doc.get('pages'):
            errs.append(f"{doc['id']}: case.json says {doc.get('pages')} pages, file has {len(pg)}")

    keys = [a['key'] for a in c['activities']]
    if len(keys) != len(set(keys)):
        errs.append('duplicate activity keys')
    if c['benefit'] in ('pip', 'adp'):   # ADP shares PIP's activity keys
        want = {f'pip:{n}' for n in range(1, 13)}
        if set(keys) != want:
            errs.append(f'PIP or ADP case must list exactly pip:1..pip:12; missing {sorted(want - set(keys))} extra {sorted(set(keys) - want)}')
    elif c['benefit'] == 'uc-wca':
        want = {f'sch6:{n}' for n in range(1, 18)}
        if not want <= set(keys):
            errs.append(f'WCA case must list all sch6:1..17; missing {sorted(want - set(keys))}')
    else:
        errs.append(f"unknown benefit {c['benefit']}")

    for a in c['activities']:
        k = a['key']
        if a.get('evidence_status') not in STATUSES:
            errs.append(f'{k}: bad evidence_status {a.get("evidence_status")}')
        for q in a.get('must_find', []):
            pg = docs.get(q['doc'], {}).get(q['page'])
            if pg is None:
                errs.append(f"{k}: no page {q['page']} in doc {q['doc']}")
            elif norm(q['quote']) not in norm(pg):
                errs.append(f"{k}: quote not found verbatim on {q['doc']} p{q['page']}: {q['quote']!r}")
            n = len(q['quote'].split())
            if not 4 <= n <= 30:
                errs.append(f"{k}: quote length {n} words (want 4-30): {q['quote']!r}")
        if a.get('evidence_status') == 'nodiff' and (a.get('must_find') or a.get('draft_descriptor')):
            errs.append(f'{k}: nodiff must have no must_find and a null draft_descriptor')
        if a.get('evidence_status') != 'nodiff' and not a.get('must_find'):
            errs.append(f'{k}: status {a.get("evidence_status")} needs at least one must_find quote')

        dd = a.get('draft_descriptor')
        if dd is None:
            continue
        scheme, num = k.split(':')
        num = int(num)
        if scheme == 'pip':
            act = next((x for x in (ADP if c['benefit'] == 'adp' else PIP)['activities'] if x['number'] == num), None)
            letters = {x['letter'] for x in act['descriptors']}
            for s in dd.get('satisfied', []):
                if s.get('letter') not in letters:
                    errs.append(f"{k}: descriptor letter {s.get('letter')} not in dataset")
                p = s.get('daysPercent')
                if p is not None and not 0 <= p <= 100:
                    errs.append(f'{k}: daysPercent {p} out of range')
        elif scheme == 'sch6':
            act = next((x for x in WCA['activities'] if x['number'] == num), None)
            letters = {x['letter'] for x in act['descriptors']}
            for s in dd.get('satisfied', []):
                l = s['letter'] if isinstance(s, dict) else s
                if l not in letters:
                    errs.append(f'{k}: Sch 6 letter {l} not in dataset')
        elif scheme == 'sch7':
            ids = {x['number'] for a7 in WCA['lcwra_activities'] for x in a7['descriptors']}
            for s in dd.get('satisfied', []):
                if s not in ids:
                    errs.append(f'{k}: Sch 7 descriptor {s} not in dataset')

    if c['benefit'] == 'uc-wca':
        ta = c.get('treated_as', {})
        if set(ta.get('sch8', [])) - {1, 2, 3, 4, 5, 6} or set(ta.get('sch9', [])) - {1, 2, 3, 4, 5}:
            errs.append('treated_as paragraph out of range')
    if not 3 <= len(c['must_not_claim']) <= 6:
        errs.append('must_not_claim should have 3-6 items')
    return errs


if __name__ == '__main__':
    targets = sys.argv[1:] or sorted(str(p) for p in (HERE / 'cases').iterdir() if p.is_dir())
    bad = 0
    for t in targets:
        e = check(t)
        if e:
            bad += 1
            print(f'FAIL {t}')
            for x in e:
                print('  -', x)
        else:
            print(f'OK   {t}')
    sys.exit(1 if bad else 0)
