import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { canManage } from '@/lib/casework';
import { listOffices } from '@/lib/offices';
import { listPeople, listInvites, ROLES } from '@/lib/access';
import { checkAudit } from '@/lib/auditlog';
import { AddOfficeForm, RenameOfficeForm, UserOfficeForm, InviteForm, RoleForm, DeactivateButton, ReactivateButton, RevokeInviteButton } from './forms';

export const dynamic = 'force-dynamic';
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '–');

export default async function Team() {
  const me = await requireMe();
  const manage = canManage(me), admin = me.role === 'admin';
  const [offices, people, invites] = await Promise.all([listOffices(me), listPeople(me), manage ? listInvites(me) : Promise.resolve([])]);
  const officeName = Object.fromEntries(offices.map(o => [o.id, o.name]));
  const active = people.filter(p => p.active), removed = people.filter(p => !p.active);
  const orphaned = removed.filter(p => p.open_cases > 0);
  const chain = admin ? await checkAudit(me) : null;

  return (
    <div className="stack-lg">
      <div className="head"><h1>Team</h1><p className="soft">Who can use Heard &amp; Supported at your agency, and where they work. People get in only by an invitation from here.</p></div>

      {orphaned.length > 0 && <p className="msg msg-error" role="status">{orphaned.map(p => `${p.name ?? p.email} (${p.open_cases})`).join(', ')}: open cases held by people who no longer have access. <Link href="/?view=all">Reassign them</Link>.</p>}

      {manage && (
        <section className="panel stack" aria-label="Invite">
          <h2 className="eyebrow">Invite someone</h2>
          <p className="soft small">They sign in with their Microsoft work account. The invitation only works for the email you enter here.{!admin ? ' Supervisors can invite advisers; an admin invites supervisors and admins.' : ''}</p>
          <InviteForm offices={offices} canInviteAll={admin} />
          {invites.length > 0 && (
            <div className="table-wrap"><table className="list">
              <thead><tr><th scope="col">Invited</th><th scope="col">Role</th><th scope="col">Office</th><th scope="col">Sent</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{invites.map(i => <tr key={i.id}><td>{i.email}</td><td>{ROLES[i.role as keyof typeof ROLES]}</td><td>{i.office ?? '–'}</td><td>{day(i.created_at)}</td>
                <td>{i.expired ? <span className="chip chip-lower">Expired</span> : `Waiting · expires ${day(i.expires_at)}`}</td><td><RevokeInviteButton inviteId={i.id} /></td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      )}

      <section className="panel stack" aria-label="People">
        <h2 className="eyebrow">People with access</h2>
        <div className="table-wrap"><table className="list">
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Office</th><th scope="col">Open cases</th><th scope="col">Last signed in</th>{admin && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{active.map(p => (
            <tr key={p.id}>
              <td>{p.name ?? '–'}<br /><span className="soft small">{p.email}</span></td>
              <td>{admin && p.id !== me.userId ? <RoleForm userId={p.id} name={p.name ?? p.email} role={p.role} /> : ROLES[p.role as keyof typeof ROLES]}</td>
              <td>{manage && offices.length ? <UserOfficeForm userId={p.id} name={p.name ?? 'this person'} officeId={p.office_id} offices={offices} /> : (officeName[p.office_id] ?? <span className="soft">No office set</span>)}</td>
              <td className="mono">{p.open_cases}</td>
              <td>{day(p.last_sign_in_at)}{p.last_sign_in_at && <><br /><span className="soft small">{p.last_sign_in_mfa ? 'With a second step' : p.last_sign_in_mfa === false ? 'Password only' : ''}</span></>}</td>
              {admin && <td>{p.id !== me.userId && <DeactivateButton userId={p.id} name={p.name ?? p.email} />}</td>}
            </tr>
          ))}</tbody>
        </table></div>
        {manage && <p className="soft small">Moving someone to another office moves their open cases with them; closed cases stay with the office they were run from. Removing access takes effect on their next click; their cases stay and need reassigning.</p>}
      </section>

      {removed.length > 0 && (
        <section className="panel stack" aria-label="Access removed">
          <h2 className="eyebrow">Access removed</h2>
          <ul className="plain">{removed.map(p => <li key={p.id}>{p.name ?? p.email} <span className="soft small">{p.email} · {p.open_cases} open cases</span> {admin && <ReactivateButton userId={p.id} />}</li>)}</ul>
        </section>
      )}

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

      {chain && (
        <section className="panel stack" aria-label="Audit record">
          <h2 className="eyebrow">Audit record</h2>
          {chain.intact
            ? <p className="msg msg-ok">Intact: all {chain.checked.toLocaleString('en-GB')} entries check out. Nothing has been changed or removed.</p>
            : <p className="msg msg-error" role="alert">{chain.problem} (entry {chain.badId}). Contact us straight away: this may mean someone has tampered with the record.</p>}
          <p className="soft small">Every change, and every time someone opens a client’s record, case or document, is recorded. Each entry is sealed with the one before, so an entry can’t be altered or removed without it showing here.
            {chain.lastHash && <> Latest seal <span className="mono">{chain.lastHash.slice(0, 16)}</span>.</>}</p>
        </section>
      )}
    </div>
  );
}
