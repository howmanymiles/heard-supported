// Runs the synthetic cases through the real extraction pipeline (scrub → model →
// citation check) and scores the result. Needs AI_ENDPOINT and an Azure sign-in
// with the Cognitive Services OpenAI User role. Synthetic data only.
//
//   node run.ts              all cases
//   node run.ts PIP-01 WCA-02
import fs from 'node:fs';
import path from 'node:path';
import { extractEvidence, splitTextPages, type ExtractionDoc } from '@hs/core';
import { scoreCase, type CaseFile } from './score.ts';

const here = import.meta.dirname;
const casesDir = path.join(here, 'cases');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(casesDir).sort();
if (!process.env.AI_ENDPOINT) { console.error('Set AI_ENDPOINT (and sign in with az login).'); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(here, 'results', stamp);
fs.mkdirSync(outDir, { recursive: true });

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
