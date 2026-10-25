// Bundles the synthetic test cases' documents (not their answer files) so the
// app can load them as demo cases. Runs before dev and build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../evals/cases');
const out = [];
for (const id of fs.readdirSync(root).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(root, id, 'case.json'), 'utf8'));
  const names = Object.fromEntries(c.documents.map(d => [path.basename(d.file), d.type]));
  const docs = fs.readdirSync(path.join(root, id, 'documents')).sort().map(f => ({
    name: `${id} ${(names[f] ?? f.replace('.md', '')).replace(/_/g, ' ')}.md`,
    text: fs.readFileSync(path.join(root, id, 'documents', f), 'utf8'),
  }));
  // Claim-stage documents only: the PA4, decision and appeal papers belong to later stages.
  const claimDocs = docs.filter(d => !/ (pa4|decision|mr request|mr notice|sscs1|dwp response)\.md$/.test(d.name));
  // The MR papers, loaded separately on the reconsideration page.
  const mrDocs = [['pa4', 'pa4'], ['decision', 'decision']]
    .filter(([f]) => fs.existsSync(path.join(root, id, 'documents', `${f}.md`)))
    .map(([f, kind]) => ({ name: `${id} ${f === 'pa4' ? 'PA4 assessment report' : 'decision letter'}.md`, kind, text: fs.readFileSync(path.join(root, id, 'documents', `${f}.md`), 'utf8') }));
  out.push({ id, benefit: c.benefit, title: c.title, docs: claimDocs, mrDocs });
}
const target = path.resolve(import.meta.dirname, '../src/data/synthetic.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out));
console.log(`Bundled ${out.length} synthetic cases.`);
