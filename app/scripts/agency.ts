// For us, not agencies: look at sign-ups, approve an agency (which creates its first
// admin's invitation), suspend or reinstate one, or set up a development agency.
// Usage: DATABASE_URL=... NEXTAUTH_URL=https://... node scripts/agency.ts <command>
//   list                         agencies and their status
//   approve <agency-id> <you>    approve a sign-up and print the first admin's invitation link
//   suspend <agency-id> <you>    stop everyone at an agency signing in
//   reinstate <agency-id> <you>
//   dev <agency name> <email>    create an active agency at once and invite its admin (development only)
import { pool } from '../src/lib/db.ts';
import { migrate } from '../src/lib/migrate.ts';
import { approveAgency, setAgencyStatus, signUpAgency } from '../src/lib/access.ts';

process.chdir(new URL('..', import.meta.url).pathname);
await migrate();
const [cmd, a, b] = process.argv.slice(2);
const link = (t: string) => `${(process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/invite/${t}`;
try {
  if (cmd === 'list') {
    const r = await pool().query("select id, name, status, registered_number, contact_name, contact_email, created_at::date as signed_up, approved_at::date as approved, (select count(*) from users u where u.agency_id = a.id and u.active) as people from agencies a order by created_at desc");
    console.table(r.rows);
  } else if (cmd === 'approve' && a && b) {
    const { token, email } = await approveAgency(a, b);
    console.log(`Approved. Send this to ${email}; it works once, for that address, for 7 days:\n${link(token)}`);
  } else if ((cmd === 'suspend' || cmd === 'reinstate') && a && b) {
    await setAgencyStatus(a, cmd === 'suspend' ? 'suspended' : 'active', b);
    console.log(cmd === 'suspend' ? 'Suspended: nobody at that agency can sign in.' : 'Reinstated.');
  } else if (cmd === 'dev' && a && b) {
    if (process.env.DATA_MODE !== 'synthetic-only') throw new Error('Only in the fictional-data environment (DATA_MODE=synthetic-only).');
    const id = await signUpAgency({ name: a, registeredNumber: '', contactName: 'Development admin', contactEmail: b, acceptTerms: true });
    const { token } = await approveAgency(id, 'development setup');
    console.log(`Agency ${id} ready. Admin invitation for ${b}:\n${link(token)}`);
  } else {
    console.log('Commands: list | approve <agency-id> <your name> | suspend <agency-id> <your name> | reinstate <agency-id> <your name> | dev <agency name> <admin email>');
  }
} catch (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }
await pool().end();
