// Offices: where advisers work. A case belongs to the office of the adviser holding it,
// and keeps that office for its results even if the adviser later moves.

import { asAgency, audit, pool } from './db.ts';
import type { Me } from './auth.ts';
import { canManage } from './casework.ts';

export type OfficeRow = { id: string; name: string; advisers: number; open_cases: number };

export async function listOffices(me: Me): Promise<OfficeRow[]> {
  return asAgency(me.agencyId, async c => (await c.query(`
    select o.id, o.name,
      (select count(*)::int from users u where u.office_id = o.id and u.agency_id = o.agency_id) as advisers,
      (select count(*)::int from cases x where x.office_id = o.id and x.closed_at is null) as open_cases
    from offices o order by o.name`)).rows);
}

const cleanName = (n: string) => {
  const t = n.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (t.length < 2) throw new Error('Enter the office name.');
  return t;
};
const dup = (e: unknown) => { if (e instanceof Error && e.message.includes('duplicate key')) throw new Error('There is already an office with that name.'); throw e; };

export async function addOffice(me: Me, name: string): Promise<string> {
  if (!canManage(me)) throw new Error('Only a supervisor or admin can change offices.');
  const n = cleanName(name);
  return asAgency(me.agencyId, async c => {
    const id = (await c.query('insert into offices (agency_id, name) values ($1, $2) returning id', [me.agencyId, n])).rows[0].id;
    await audit(c, me.agencyId, me.userId, null, `Office added: ${n}`);
    return id;
  }).catch(dup);
}

export async function renameOffice(me: Me, id: string, name: string) {
  if (!canManage(me)) throw new Error('Only a supervisor or admin can change offices.');
  const n = cleanName(name);
  await asAgency(me.agencyId, async c => {
    if (!(await c.query('update offices set name = $2 where id = $1', [id, n])).rowCount) throw new Error('Office not found.');
    await audit(c, me.agencyId, me.userId, null, `Office renamed: ${n}`);
  }).catch(dup);
}

/** Moving an adviser moves their open cases with them; closed cases keep the office they were run from. */
export async function setUserOffice(me: Me, userId: string, officeId: string | null) {
  if (!canManage(me)) throw new Error('Only a supervisor or admin can set an adviser’s office.');
  const u = (await pool().query('select id, name from users where id = $1 and agency_id = $2', [userId, me.agencyId])).rows[0];
  if (!u) throw new Error('That person is not in your agency.');
  await asAgency(me.agencyId, async c => {
    if (officeId && !(await c.query('select 1 from offices where id = $1', [officeId])).rowCount) throw new Error('Office not found.');
    await c.query('update users set office_id = $2 where id = $1 and agency_id = $3', [userId, officeId, me.agencyId]);
    await c.query('update cases set office_id = $2 where adviser_id = $1 and closed_at is null', [userId, officeId]);
    await audit(c, me.agencyId, me.userId, null, `${u.name ?? 'Adviser'} moved to ${officeId ? 'another office' : 'no office'}`);
  });
}

export async function officeOfUser(c: import('pg').PoolClient, agencyId: string, userId: string): Promise<string | null> {
  return (await c.query('select office_id from users where id = $1 and agency_id = $2', [userId, agencyId])).rows[0]?.office_id ?? null;
}
