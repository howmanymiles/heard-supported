"""Transcribe Adult Disability Payment descriptors from legislation.gov.uk.

Source: The Disability Assistance for Working Age People (Scotland) Regulations 2022
(SSI 2022/54), Schedule 1 (descriptors) and regulations 7 to 10 (how they apply),
fetched as the revised XML. Text is kept as published, with whitespace normalised.
Prints every difference from the PIP descriptors already in descriptors.json.

Usage: python3 engine/scripts/transcribe-adp.py <folder with the fetched XML>
  The folder holds sch1.xml and reg7.xml ... reg10.xml (curl …/ssi/2022/54/schedule/1/data.xml).
"""
import json, re, sys, html, datetime, pathlib

src = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parents[1]
data_path = root / 'data' / 'descriptors.json'
BASE = 'https://www.legislation.gov.uk/ssi/2022/54'

def text(fragment: str) -> str:
    t = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip().replace(' ,', ',').replace(' .', '.').replace('( ', '(').replace(' )', ')').replace(' ;', ';')

def body(xml: str) -> str:
    m = re.search(r'<Body.*?</Body>', xml, re.S)
    b = m.group(0) if m else xml
    return re.sub(r'<Commentary[ >].*?</Commentary>', '', b, flags=re.S)

sch = body((src / 'sch1.xml').read_text())

def table_rows(part_title: str):
    """Rows of the descriptor table in the Part whose title contains part_title."""
    i = sch.find(part_title)
    if i < 0: raise SystemExit(f'Part not found: {part_title}')
    j = sch.find('<tbody', i); k = sch.find('</tbody>', j)
    rows = re.findall(r'<tr>(.*?)</tr>', sch[j:k], re.S)
    out = []
    for r in rows:
        cells = re.findall(r'<td([^>]*)>(.*?)</td>', r, re.S)
        out.append([(attrs, text(c)) for attrs, c in cells])
    return out

def activities(part_title: str, component: str, start: int):
    acts, cur = [], None
    for cells in table_rows(part_title):
        if len(cells) == 3:
            name = cells[0][1]
            m = re.match(r'(\d+)\.\s*(.+?)\.?$', name)
            cur = {'component': component, 'number': start + len(acts), 'number_in_table': int(m.group(1)), 'name': m.group(2),
                   'ref': 'Sch 1 Pt 2' if component == 'daily_living' else 'Sch 1 Pt 3', 'heading_verbatim': name, 'descriptors': [], 'evidence_prompts': [], 'verified': True}
            acts.append(cur)
            cells = cells[1:]
        d, p = cells[0][1], cells[1][1]
        m = re.match(r'([a-h])\.\s*(.+)$', d)
        cur['descriptors'].append({'letter': m.group(1), 'text': m.group(2), 'points': int(p), 'verified': True})
    return acts

daily = activities('Daily Living Activities', 'daily_living', 1)
mob = activities('Mobility Activities', 'mobility', len(daily) + 1)

# Part 1 definitions: each top-level item of the definition list, with its (a), (b) limbs.
import xml.etree.ElementTree as ET
def local(t): return t.split('}')[-1]
def flat(el, depth=0):
    """Text of an element, numbering ordered-list items (a), (b) … or (i), (ii) … as published."""
    out = []
    if el.text: out.append(el.text)
    for ch in el:
        if local(ch.tag) == 'OrderedList':
            kind = ch.get('Type', 'alpha')
            for n, li in enumerate([c for c in ch if local(c.tag) == 'ListItem']):
                label = 'abcdefghij'[n] if kind == 'alpha' else ['i', 'ii', 'iii', 'iv', 'v', 'vi'][n]
                out.append(f' ({label}) ' + flat(li, depth + 1))
        elif local(ch.tag) != 'CommentaryRef':
            out.append(flat(ch, depth + 1))
        if ch.tail: out.append(ch.tail)
    return ''.join(out)
tree = ET.fromstring((src / 'sch1.xml').read_text())
defs = []
for ul in tree.iter():
    if local(ul.tag) == 'UnorderedList' and ul.get('Class') == 'Definition':
        for li in [c for c in ul if local(c.tag) == 'ListItem']:
            term_el = next((e for e in li.iter() if local(e.tag) == 'Term'), None)
            if term_el is None: continue
            t = re.sub(r'\s+', ' ', flat(li)).strip()
            t = re.sub(r'“\s+', '“', re.sub(r'\s+”', '”', t)).replace(' ,', ',')
            t = re.sub(r',(?=[A-Za-z])', ', ', t)
            defs.append({'term': ''.join(term_el.itertext()).strip(), 'text': t, 'ref': 'Sch 1 Pt 1 para 1', 'verified': True})
        break

rules = []
for n in (7, 8, 9, 10):
    t = text(body((src / f'reg{n}.xml').read_text()))
    t = re.sub(r'^.*?(?=\b' + str(n) + r' 1 )', '', t, count=1)
    rules.append({'id': f'reg-{n}', 'ref': f'reg {n}', 'text': t, 'verified': True})

data = json.loads(data_path.read_text())
pip = next(b for b in data['benefits'] if b['id'] == 'pip')

# Every difference from PIP, activity by activity.
diffs = []
for a in daily + mob:
    p = next((x for x in pip['activities'] if x['component'] == a['component'] and x['number_in_table'] == a['number_in_table']), None)
    if not p: diffs.append(f"{a['component']} {a['number_in_table']}: no PIP equivalent"); continue
    if p['name'] != a['name']: diffs.append(f"{a['component']} {a['number_in_table']} name: PIP '{p['name']}' / ADP '{a['name']}'")
    for d in a['descriptors']:
        q = next((x for x in p['descriptors'] if x['letter'] == d['letter']), None)
        if not q: diffs.append(f"{a['number']}{d['letter']}: not in PIP"); continue
        norm = lambda s: re.sub(r'\s+', ' ', s.replace('’', "'")).strip().rstrip('.;')
        if norm(q['text']) != norm(d['text']): diffs.append(f"{a['number']}{d['letter']} text:\n   PIP: {q['text']}\n   ADP: {d['text']}")
        if q['points'] != d['points']: diffs.append(f"{a['number']}{d['letter']} points: PIP {q['points']} / ADP {d['points']}")
    if len(p['descriptors']) != len(a['descriptors']): diffs.append(f"{a['number']}: PIP has {len(p['descriptors'])} descriptors, ADP {len(a['descriptors'])}")

today = datetime.date.today().isoformat()
adp = {
    'id': 'adp', 'name': 'Adult Disability Payment', 'instrument': 'SSI 2022/54', 'version': f'adp-{today}',
    'effective_from': 'as revised on legislation.gov.uk when fetched', 'source_url': f'{BASE}/schedule/1',
    'source_urls': [f'{BASE}/schedule/1/data.xml'] + [f'{BASE}/regulation/{n}/data.xml' for n in (7, 8, 9, 10)],
    'thresholds': {'daily_living': {'standard': 8, 'enhanced': 12, 'ref': 'reg 8(3)'}, 'mobility': {'standard': 8, 'enhanced': 12, 'ref': 'reg 9(3)'}},
    'rules': rules, 'definitions': defs, 'activities': daily + mob,
}
data['benefits'] = [b for b in data['benefits'] if b['id'] != 'adp'] + [adp]
data['meta'].setdefault('versions', []).append({'id': adp['version'], 'instrument': 'SSI 2022/54', 'provision': 'Sch 1; regs 7-10', 'fetched': today})
data_path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
print(f"ADP: {len(daily)} daily living and {len(mob)} mobility activities, {sum(len(a['descriptors']) for a in daily + mob)} descriptors, {len(defs)} definitions.")
print('Differences from PIP:' if diffs else 'No differences from PIP in activities, descriptor wording or points.')
for d in diffs: print(' -', d)
