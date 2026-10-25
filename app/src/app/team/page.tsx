import { requireMe } from '@/lib/auth';
import { canManage } from '@/lib/casework';
import { listOffices } from '@/lib/offices';
import { pool } from '@/lib/db';
import { AddOfficeForm, RenameOfficeForm, UserOfficeForm } from './forms';

export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { adviser: 'Adviser', supervisor: 'Supervisor', admin: 'Admin' };

export default async function Team() {
  const me = await requireMe();
  const manage = canManage(me);
  const offices = await listOffices(me);
  // users has no row-level security, so the agency is filtered here.
  const people = (await pool().query('select u.id, u.name, u.role, u.office_id from users u where u.agency_id = $1 order by u.name', [me.agencyId])).rows;
  const officeName = Object.fromEntries(offices.map(o => [o.id, o.name]));
  return (
    <div className="stack-lg">
      <div className="head"><h1>Team</h1><p className="soft">Your agency’s offices and who works from each. A case belongs to the office of the adviser holding it, and reports can be run by office.</p></div>
      <section className="panel stack" aria-label="Offices">
        <h2 className="eyebrow">Offices</h2>
        {offices.length === 0 ? <p className="soft small">No offices yet.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Office</th><th scope="col">Advisers</th><th scope="col">Open cases</th></tr></thead>
            <tbody>{offices.map(o => <tr key={o.id}><td>{manage ? <RenameOfficeForm id={o.id} name={o.name} /> : o.name}</td><td className="mono">{o.advisers}</td><td className="mono">{o.open_cases}</td></tr>)}</tbody>
          </table></div>
        )}
        {manage && <AddOfficeForm />}
      </section>
      <section className="panel stack" aria-label="People">
        <h2 className="eyebrow">People</h2>
        <div className="table-wrap"><table className="list">
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Office</th></tr></thead>
          <tbody>{people.map(p => (
            <tr key={p.id}><td>{p.name ?? 'Unnamed'}</td><td>{ROLE[p.role] ?? p.role}</td>
              <td>{manage && offices.length ? <UserOfficeForm userId={p.id} name={p.name ?? 'this person'} officeId={p.office_id} offices={offices} /> : (officeName[p.office_id] ?? <span className="soft">No office set</span>)}</td></tr>
          ))}</tbody>
        </table></div>
        {manage && <p className="soft small">Moving someone moves their open cases with them. Closed cases stay with the office they were run from, so past results don’t move.</p>}
      </section>
    </div>
  );
}
