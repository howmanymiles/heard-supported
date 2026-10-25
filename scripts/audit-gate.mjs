// Fails CI on any high or critical advisory in the production dependencies, except the
// ones accepted below. Each acceptance says why it doesn't apply and when to look again.
import { execSync } from 'node:child_process';

const ACCEPTED = {
  // MSAL Node authorization code flow. We never use that flow: the app gets Azure tokens
  // through managed identity (@azure/identity ManagedIdentityCredential), and users sign
  // in through next-auth, not MSAL. The fix is in msal-node 7.1, which @azure/identity
  // does not yet accept (it pins ^6). Remove when @azure/identity moves to msal-node 7.
  'GHSA-xcx6-jx8p-x3h5': { until: '2027-01-31' },
};

let out;
try { out = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
catch (e) { out = e.stdout; }                       // npm audit exits non-zero when it finds anything
const report = JSON.parse(out);
const today = new Date().toISOString().slice(0, 10);
const problems = [];
for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === 'string') continue;          // inherited from another package; reported there
    if (!['high', 'critical'].includes(via.severity)) continue;
    const id = via.url?.split('/').pop();
    const ok = ACCEPTED[id];
    if (ok && today <= ok.until) { console.log(`accepted until ${ok.until}: ${pkg} ${id} ${via.title}`); continue; }
    problems.push(`${via.severity}: ${pkg} ${id} ${via.title}${ok ? ' (acceptance expired)' : ''}`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('No unaccepted high or critical advisories in production dependencies.');
