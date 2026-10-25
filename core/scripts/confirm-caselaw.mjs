// Moves expert-approved authorities from the research draft into the library
// letters may cite.   node core/scripts/confirm-caselaw.mjs "Expert name" id1 id2 ...
//                     node core/scripts/confirm-caselaw.mjs --remove id1 ...
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../data');
const draft = JSON.parse(fs.readFileSync(path.join(dir, 'caselaw.json'), 'utf8'));
const conf = JSON.parse(fs.readFileSync(path.join(dir, 'caselaw-confirmed.json'), 'utf8'));
const args = process.argv.slice(2);
if (args[0] === '--remove') {
  const ids = new Set(args.slice(1));
  conf.authorities = conf.authorities.filter(a => !ids.has(a.id));
} else {
  const [by, ...ids] = args;
  if (!by || !ids.length) { console.error('Usage: confirm-caselaw.mjs "<expert name>" <id> [<id> ...]'); process.exit(2); }
  const today = new Date().toISOString().slice(0, 10);
  for (const id of ids) {
    const a = draft.authorities.find(x => x.id === id);
    if (!a) { console.error(`Not in the draft: ${id}`); process.exit(1); }
    conf.authorities = conf.authorities.filter(x => x.id !== id);
    const { citation, name, court, benefit, topics, proposition, source_url } = a;
    conf.authorities.push({ id, citation, name, court, benefit, topics, proposition, source_url, confirmed_by: by, confirmed_on: today });
  }
}
conf.version = new Date().toISOString().slice(0, 10);
conf.authorities.sort((x, y) => x.id.localeCompare(y.id));
fs.writeFileSync(path.join(dir, 'caselaw-confirmed.json'), JSON.stringify(conf, null, 2) + '\n');
console.log(`${conf.authorities.length} confirmed authorities.`);
