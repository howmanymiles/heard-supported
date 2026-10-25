// The client and their consent. With the client present, the adviser goes through the
// consent statement, records what the client agreed to, and only then creates the record.
// Cases sit under the client. The AI is used only while the client's consent to it stands,
// and the client's names are removed from every page before the AI sees it.

import type { PoolClient } from 'pg';
import { asAgency, audit, viewed } from './db.ts';
import type { Me } from './auth.ts';
import { limit, LIMITS } from './ratelimit.ts';

/** Draft wording for the agency and its data protection lead to approve. Change the version when the wording changes. */
export const CONSENT_STATEMENT = {
  version: 'draft-2026-10',
  intro: 'Read this to your client, or let them read it, before you record anything about them.',
  items: [
    { key: 'store_data', required: true, text: 'We will keep a record of your details, your benefit papers and the evidence you give us on a secure system, to help with your claim, reconsideration or appeal. Only advisers at this agency can see it.' },
    { key: 'ai_processing', required: false, text: 'The system can use an AI service to help your adviser find evidence in your papers and draft letters. Your name and identifying numbers are removed first, and the AI service runs in the EU. Your adviser checks everything it suggests. You can say no and we will still help you.' },
    { key: 'act_on_behalf', required: false, text: 'You agree that we can act on your behalf with the DWP and HM Courts and Tribunals Service about this claim, including asking for your papers and sending letters for you.' },
  ],
  withdraw: 'You can change your mind at any time by telling your adviser.',
} as const;

export const CONSENT_METHODS = { in_person: 'In person', phone: 'By phone', video: 'By video call', written: 'In writing' } as const;

export type ConsentInput = { method: string; givenOn: string; storeData: boolean; aiProcessing: boolean; actOnBehalf: boolean; confirmed: boolean };
export type ClaimantInput = { name: string; preferredName?: string | null; dateOfBirth?: string | null; agencyRef?: string | null };
export type ConsentRow = { id: string; statement_version: string; method: string; given_on: string; store_data: boolean; ai_processing: boolean; act_on_behalf: boolean;
  recorded_by_name: string | null; recorded_at: Date; withdrawn_at: Date | null; withdrawn_note: string | null };
export type ClaimantRow = { id: string; name: string; preferred_name: string | null; date_of_birth: string | null; agency_ref: string | null; created_at: Date;
  open_cases?: number; ai_ok?: boolean; consent_active?: boolean };

const iso = (d: string | null | undefined, what: string) => {
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Enter the ${what} as day, month and year.`);
  return d;
};

function checkConsent(k: ConsentInput, today: string) {
  if (!k.confirmed) throw new Error('Confirm that you went through the consent statement with your client.');
  if (!k.storeData) throw new Error('Without consent to keep their information, don’t create a record. You can still advise them without the system.');
  if (!(k.method in CONSENT_METHODS)) throw new Error('Choose how consent was given.');
  const given = iso(k.givenOn, 'date consent was given');
  if (!given) throw new Error('Enter the date consent was given.');
  if (given > today) throw new Error('The date consent was given cannot be in the future.');
  return given;
}

function checkClaimant(p: ClaimantInput, today: string) {
  const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (name.length < 2) throw new Error('Enter your client’s name.');
  const dob = iso(p.dateOfBirth, 'date of birth');
  if (dob && dob > today) throw new Error('The date of birth cannot be in the future.');
  return { name, preferred: p.preferredName?.trim().slice(0, 60) || null, dob, ref: p.agencyRef?.trim().slice(0, 40) || null };
}

async function insertConsent(c: PoolClient, me: Me, claimantId: string, k: ConsentInput, given: string) {
  await c.query(`insert into consents (agency_id, claimant_id, statement_version, method, given_on, store_data, ai_processing, act_on_behalf, recorded_by)
    values ($1, $2, $3, $4, $5, true, $6, $7, $8)`, [me.agencyId, claimantId, CONSENT_STATEMENT.version, k.method, given, k.aiProcessing, k.actOnBehalf, me.userId]);
  const what = [k.aiProcessing ? 'AI help' : 'no AI', k.actOnBehalf ? 'authority to act' : 'no authority to act'].join(', ');
  await audit(c, me.agencyId, me.userId, null, `Consent recorded (${CONSENT_STATEMENT.version}; storing information, ${what})`, claimantId);
}

/** Consent first, then the record: both in one transaction, so there is never a record without consent. */
export async function createClaimant(me: Me, p: ClaimantInput, k: ConsentInput, today = new Date().toISOString().slice(0, 10)): Promise<string> {
  const given = checkConsent(k, today);
  const x = checkClaimant(p, today);
  return asAgency(me.agencyId, async c => {
    const id = (await c.query('insert into claimants (agency_id, name, preferred_name, date_of_birth, agency_ref, created_by) values ($1, $2, $3, $4, $5, $6) returning id',
      [me.agencyId, x.name, x.preferred, x.dob, x.ref, me.userId])).rows[0].id;
    await insertConsent(c, me, id, k, given);
    await audit(c, me.agencyId, me.userId, null, 'Client record created', id);
    return id;
  });
}

export async function updateClaimant(me: Me, id: string, p: ClaimantInput, today = new Date().toISOString().slice(0, 10)) {
  const x = checkClaimant(p, today);
  await asAgency(me.agencyId, async c => {
    const r = await c.query('update claimants set name = $2, preferred_name = $3, date_of_birth = $4, agency_ref = $5 where id = $1', [id, x.name, x.preferred, x.dob, x.ref]);
    if (!r.rowCount) throw new Error('Client not found.');
    await audit(c, me.agencyId, me.userId, null, 'Client details changed', id);
  });
}

/** A fresh consent replaces the current one, for example when the client changes what they agree to. */
export async function recordConsent(me: Me, claimantId: string, k: ConsentInput, today = new Date().toISOString().slice(0, 10)) {
  const given = checkConsent(k, today);
  await asAgency(me.agencyId, async c => {
    if (!(await c.query('select 1 from claimants where id = $1', [claimantId])).rowCount) throw new Error('Client not found.');
    await c.query('update consents set withdrawn_at = now(), withdrawn_by = $2, withdrawn_note = $3 where claimant_id = $1 and withdrawn_at is null', [claimantId, me.userId, 'Replaced by a new consent']);
    await insertConsent(c, me, claimantId, k, given);
  });
}

/** The client withdraws consent. Nothing more is added or sent to the AI; the record stays until the agency’s retention rules remove it. */
export async function withdrawConsent(me: Me, claimantId: string, note: string) {
  await asAgency(me.agencyId, async c => {
    const r = await c.query('update consents set withdrawn_at = now(), withdrawn_by = $2, withdrawn_note = $3 where claimant_id = $1 and withdrawn_at is null', [claimantId, me.userId, note.trim().slice(0, 300) || null]);
    if (!r.rowCount) throw new Error('There is no current consent to withdraw.');
    await audit(c, me.agencyId, me.userId, null, 'Consent withdrawn', claimantId);
  });
}

async function currentConsent(c: PoolClient, claimantId: string) {
  return (await c.query('select * from consents where claimant_id = $1 and withdrawn_at is null order by recorded_at desc limit 1', [claimantId])).rows[0] ?? null;
}

export async function listClaimants(me: Me, q?: string): Promise<ClaimantRow[]> {
  const term = q?.trim().slice(0, 60);
  return asAgency(me.agencyId, async c => (await c.query(`
    select k.id, k.name, k.preferred_name, to_char(k.date_of_birth, 'YYYY-MM-DD') as date_of_birth, k.agency_ref, k.created_at,
      (select count(*)::int from cases x where x.claimant_id = k.id and x.closed_at is null) as open_cases,
      coalesce((select n.ai_processing from consents n where n.claimant_id = k.id and n.withdrawn_at is null order by n.recorded_at desc limit 1), false) as ai_ok,
      exists (select 1 from consents n where n.claimant_id = k.id and n.withdrawn_at is null) as consent_active
    from claimants k
    ${term ? "where k.name ilike '%' || $1 || '%' or k.preferred_name ilike '%' || $1 || '%' or k.agency_ref ilike '%' || $1 || '%'" : ''}
    order by k.created_at desc limit 200`, term ? [term.replace(/[%_\\]/g, m => `\\${m}`)] : [])).rows);
}

export async function getClaimant(me: Me, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return asAgency(me.agencyId, async c => {
    const k = (await c.query("select id, name, preferred_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, agency_ref, created_at from claimants where id = $1", [id])).rows[0] as ClaimantRow | undefined;
    if (!k) return null;
    const consents = (await c.query(`select n.id, n.statement_version, n.method, to_char(n.given_on, 'YYYY-MM-DD') as given_on, n.store_data, n.ai_processing, n.act_on_behalf,
      u.name as recorded_by_name, n.recorded_at, n.withdrawn_at, n.withdrawn_note
      from consents n left join users u on u.id = n.recorded_by where n.claimant_id = $1 order by n.recorded_at desc`, [id])).rows as ConsentRow[];
    const cases = (await c.query("select id, ref, external_ref, benefit, stage, to_char(closed_at, 'YYYY-MM-DD') as closed_on from cases where claimant_id = $1 order by created_at desc", [id])).rows;
    await viewed(c, me.agencyId, me.userId, { claimantId: id, action: 'Opened the client record' });
    return { claimant: k, consents, current: consents.find(n => !n.withdrawn_at) ?? null, cases };
  });
}

/**
 * Before any AI call on a case: the client's consent to AI help must stand. Returns the
 * names to remove from the pages. A case with no client is allowed only in the
 * fictional-data environment, for test cases.
 */
export async function aiGate(me: Me, caseId: string): Promise<{ names: string[] }> {
  limit(`ai:u:${me.userId}`, LIMITS.aiPerUser.max, LIMITS.aiPerUser.window, 'You have used the AI a lot in the last hour. Wait a while and try again, or ask your admin if this keeps happening.');
  limit(`ai:a:${me.agencyId}`, LIMITS.aiPerAgency.max, LIMITS.aiPerAgency.window, 'Your agency has reached today’s limit on AI use. It resets within 24 hours; contact us if you need it raised.');
  return asAgency(me.agencyId, async c => {
    const cs = (await c.query('select claimant_id, anonymised_at from cases where id = $1', [caseId])).rows[0];
    if (!cs) throw new Error('Case not found.');
    if (cs.anonymised_at) throw new Error('This case’s content has been deleted, so the AI can’t be used on it.');
    if (!cs.claimant_id) {
      if (process.env.DATA_MODE === 'synthetic-only') return { names: [] };
      throw new Error('Link this case to a client, with their consent recorded, before using the AI.');
    }
    const k = (await c.query('select name, preferred_name from claimants where id = $1', [cs.claimant_id])).rows[0];
    const n = await currentConsent(c, cs.claimant_id);
    if (!n) throw new Error('Your client has withdrawn consent. The AI can’t be used, and nothing more can be added, unless they give consent again.');
    if (!n.ai_processing) throw new Error('Your client did not agree to AI help. You can do this step yourself, or record a new consent if they change their mind.');
    return { names: [k.name, k.preferred_name].filter(Boolean) };
  });
}

/** Before adding documents: the client's consent to keep their information must stand. */
export async function storeGate(c: PoolClient, caseId: string | null, claimantId?: string) {
  const cs = caseId ? (await c.query('select claimant_id, anonymised_at from cases where id = $1', [caseId])).rows[0] : null;
  if (cs?.anonymised_at) throw new Error('This case’s content has been deleted under the retention rules, so nothing can be added to it.');
  const id = claimantId ?? cs?.claimant_id;
  if (!id) return;
  if (!(await c.query('select 1 from claimants where id = $1', [id])).rowCount) throw new Error('Client not found.');
  if (!(await currentConsent(c, id))) throw new Error('Your client has withdrawn consent, so nothing more can be added to their case.');
}

/** For the fictional test cases: an invented client, with a recorded consent so the AI steps work. */
export async function fictionalClaimant(me: Me, label: string): Promise<string> {
  return createClaimant(me, { name: 'Rowan Testcase', agencyRef: `TEST-${label}`.slice(0, 40) },
    { method: 'in_person', givenOn: new Date().toISOString().slice(0, 10), storeData: true, aiProcessing: true, actOnBehalf: true, confirmed: true });
}

/** The client a case belongs to, with what their current consent covers. */
export async function caseClient(me: Me, caseId: string) {
  return asAgency(me.agencyId, async c => {
    const k = (await c.query('select k.id, k.name, k.preferred_name from cases x join claimants k on k.id = x.claimant_id where x.id = $1', [caseId])).rows[0];
    if (!k) return null;
    const n = await currentConsent(c, k.id);
    return { id: k.id as string, name: k.name as string, preferred: k.preferred_name as string | null, consent: n ? { ai: !!n.ai_processing, act: !!n.act_on_behalf } : null };
  });
}
