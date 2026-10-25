// Runs the synthetic cases through the real extraction pipeline (scrub → model →
// citation check) and scores the result. Needs AI_ENDPOINT and an Azure sign-in
// with the Cognitive Services OpenAI User role. Synthetic data only.
//
//   node run.ts              all cases, evidence stage
//   node run.ts PIP-01 WCA-02
//   node run.ts --mr         PIP cases, reading the PA4 and decision letter
import fs from 'node:fs';
import path from 'node:path';
import { extractEvidence, extractAssessor, extractWcaAssessor, splitTextPages, parseUkDate, type ExtractionDoc } from '@hs/core';
import { scoreCase, scoreAssessor, scoreWcaAssessor, type CaseFile } from './score.ts';

const here = import.meta.dirname;
const casesDir = path.join(here, 'cases');
const args = process.argv.slice(2);
const mrStage = args.includes('--mr');
const named = args.filter(a => !a.startsWith('--'));
const ids = (named.length ? named : fs.readdirSync(casesDir).sort())
  .filter(id => !mrStage || fs.existsSync(path.join(casesDir, id, 'mr.json')));
if (!process.env.AI_ENDPOINT) { console.error('Set AI_ENDPOINT (and sign in with az login).'); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(here, 'results', mrStage ? `${stamp}-mr` : stamp);
fs.mkdirSync(outDir, { recursive: true });

if (mrStage) {
  const rows: any[] = [];
  for (const id of ids) {
    const read = (f: string) => fs.readFileSync(path.join(casesDir, id, 'documents', `${f}.md`), 'utf8');
    const mr = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'mr.json'), 'utf8'));
    if (mr.report) {
      const docs = [
        { id: `${id}/decision`, name: 'decision notice', kind: 'decision' as const, pages: splitTextPages(read('decision')) },
        { id: `${id}/${mr.report.doc}`, name: mr.report.type.toUpperCase(), kind: mr.report.type, pages: splitTextPages(read(mr.report.doc)) },
      ];
      process.stdout.write(`${id} … `);
      try {
        const r = await extractWcaAssessor(docs);
        const s = scoreWcaAssessor(mr, r);
        rows.push({ id, ...s, model: r.model });
        fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
        console.log(`findings ${s.lettersCorrect}/${s.of} right, ${s.lettersMissing} left for adviser, ${s.lettersWrong} wrong; date ${s.dateCorrect ? 'right' : 'WRONG/missing'}; award ${s.outcomeCorrect ? 'right' : 'WRONG/missing'}; dropped ${s.dropped}`);
      } catch (e) {
        console.log(`FAILED: ${(e as Error).message}`);
        rows.push({ id, error: (e as Error).message });
      }
      continue;
    }
    const docs = [
      { id: `${id}/decision`, name: 'decision letter', kind: 'decision' as const, pages: splitTextPages(read('decision')) },
      { id: `${id}/pa4`, name: 'PA4 assessment report', kind: 'pa4' as const, pages: splitTextPages(read('pa4')) },
    ];
    const letterDate = parseUkDate(read('decision').split('\n').find(l => parseUkDate(l)) ?? '');
    process.stdout.write(`${id} … `);
    try {
      const r = await extractAssessor(docs);
      const s = scoreAssessor(mr, r, letterDate, `${id}/pa4`);
      rows.push({ id, ...s, model: r.model });
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
      console.log(`descriptors ${s.lettersCorrect}/12 right, ${s.lettersMissing} left for adviser, ${s.lettersWrong} wrong; reasons found ${s.justificationsFound}/12; date ${s.dateCorrect ? 'right' : 'WRONG/missing'}; dropped ${s.dropped}`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
      rows.push({ id, error: (e as Error).message });
    }
  }
  const ok = rows.filter(r => !r.error);
  const sum = (k: string) => ok.reduce((n, r) => n + r[k], 0);
  const summary = { at: new Date().toISOString(), stage: 'mr', cases: ids, model: ok[0]?.model ?? null, lettersCorrect: sum('lettersCorrect'), lettersWrong: sum('lettersWrong'), lettersMissing: sum('lettersMissing'), of: ok.reduce((n, r) => n + (r.of ?? 12), 0), justificationsFound: sum('justificationsFound'), datesCorrect: ok.filter(r => r.dateCorrect).length, failed: rows.length - ok.length, rows };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nFindings right ${summary.lettersCorrect}/${summary.of}, wrong ${summary.lettersWrong} (the number that matters), left for the adviser ${summary.lettersMissing}. PIP reasons found ${summary.justificationsFound}. Dates right ${summary.datesCorrect}/${ok.length}.`);
  console.log(`Results: ${path.relative(process.cwd(), outDir)}`);
  process.exit(summary.failed || summary.lettersWrong ? 1 : 0);
}

const scores = [];
for (const id of ids) {
  const c = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'case.json'), 'utf8')) as CaseFile & { documents: Array<{ id: string; file: string; type: string }> };
  const docs: ExtractionDoc[] = c.documents.map(d => ({
    id: `${id}/${d.id}`, name: d.type,
    pages: splitTextPages(fs.readFileSync(path.join(casesDir, id, d.file), 'utf8')),
  }));
  process.stdout.write(`${id} … `);
  const t0 = Date.now();
  try {
    const r = await extractEvidence(c.benefit, docs);
    const s = scoreCase(c, doc => `${id}/${doc}`, r.verified, r.rejected.length, r.gaps);
    scores.push({ ...s, model: r.model, seconds: (Date.now() - t0) / 1000, identifiersRemoved: r.identifiersRemoved });
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
    console.log(`recall ${(s.recall * 100).toFixed(0)}% (${s.found}/${s.mustFind}), dropped ${s.dropped}/${s.suggested + s.dropped}, noise ${s.noise}`);
  } catch (e) {
    console.log(`FAILED: ${(e as Error).message}`);
    scores.push({ id, error: (e as Error).message });
  }
}

const ok = scores.filter((s: any) => !s.error) as any[];
const sum = (k: string) => ok.reduce((n, s) => n + s[k], 0);
const summary = {
  at: new Date().toISOString(), cases: ids, model: ok[0]?.model ?? null,
  recall: sum('mustFind') ? sum('found') / sum('mustFind') : null,
  found: sum('found'), mustFind: sum('mustFind'), foundWrongActivity: sum('foundWrongActivity'),
  dropRate: sum('suggested') + sum('dropped') ? sum('dropped') / (sum('suggested') + sum('dropped')) : null,
  noise: sum('noise'), failed: scores.length - ok.length, scores,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
const pct = (x: number | null) => x == null ? '—' : `${(x * 100).toFixed(1)}%`;
console.log(`\nOverall recall ${pct(summary.recall)} (${summary.found}/${summary.mustFind}); right passage, wrong activity ${summary.foundWrongActivity}; dropped by citation check ${pct(summary.dropRate)}; noise ${summary.noise}.`);
console.log(`Results: ${path.relative(process.cwd(), outDir)}`);
if (summary.failed) process.exit(1);
