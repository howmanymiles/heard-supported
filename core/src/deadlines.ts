// Time limits for challenging a decision.
//
// PIP and UC (DWP): a mandatory reconsideration must be asked for within one month
// of the date of the decision notice. A late request can be
// accepted up to 13 months from that date if the claimant explains why it is
// late. Calendar months: a decision dated 31 January must be challenged by the
// end of February.

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export type MrTiming = {
  decisionDate: string;
  deadline: string;          // last day for an in-time request
  lateLimit: string;         // last day a late request can be accepted
  on: string;                // the date assessed (request date, or today)
  status: 'in_time' | 'late' | 'out_of_time';
  daysLeft: number;          // to the deadline (negative once passed)
};

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Adult Disability Payment (Social Security Scotland). A re-determination can be asked
 * for within 42 days beginning with the day the client is told of the determination
 * (SSI 2022/54 reg 54(1)), so the 42nd day counts that day as the first. A late
 * request needs a good reason and must be made within one year of being told
 * (Social Security (Scotland) Act 2018 s41(4)(b)). Social Security Scotland then has
 * 56 days from receiving the request (reg 54(2)); if it misses that, the client can
 * appeal the original determination (s46(2)).
 */
function adpRedetermination(informed: string, on: string): MrTiming {
  const deadline = addDays(informed, 41);
  const lateLimit = addMonths(informed, 12);
  const status = on <= deadline ? 'in_time' : on <= lateLimit ? 'late' : 'out_of_time';
  return { decisionDate: informed, deadline, lateLimit, on, status, daysLeft: days(on, deadline) };
}

/** ADP appeal to the First-tier Tribunal for Scotland: within 31 days beginning with the day the
 * client is told of the re-determination; later only with the tribunal's permission, and never
 * after one year beginning with that day (2018 Act s48). The form goes to Social Security Scotland. */
function adpAppeal(informed: string, on: string): MrTiming {
  const deadline = addDays(informed, 30);
  const lateLimit = addDays(addMonths(informed, 12), -1);
  const status = on <= deadline ? 'in_time' : on <= lateLimit ? 'late' : 'out_of_time';
  return { decisionDate: informed, deadline, lateLimit, on, status, daysLeft: days(on, deadline) };
}

/** When Social Security Scotland should have re-determined by: 56 days beginning with receipt of the request. */
export function adpRedeterminationDue(requestReceived: string): string {
  return addDays(requestReceived, 55);
}

export type Scheme = 'dwp' | 'scotland';
export const schemeOf = (benefit: string): Scheme => (benefit === 'adp' ? 'scotland' : 'dwp');

export function mrTiming(decisionDate: string, on: string, benefit: string = 'pip'): MrTiming {
  if (schemeOf(benefit) === 'scotland') return adpRedetermination(decisionDate, on);
  const deadline = addMonths(decisionDate, 1);
  const lateLimit = addMonths(decisionDate, 13);
  const status = on <= deadline ? 'in_time' : on <= lateLimit ? 'late' : 'out_of_time';
  return { decisionDate, deadline, lateLimit, on, status, daysLeft: days(on, deadline) };
}

/** Appeal to the First-tier Tribunal: within one month after the MR notice was sent
 * (Tribunal Procedure (FtT) (SEC) Rules 2008, r22(2)(d)); time can be extended by
 * no more than 12 months (r22(8)), so 13 months from the notice at most. */
export function appealTiming(mrNoticeDate: string, on: string, benefit: string = 'pip'): MrTiming {
  if (schemeOf(benefit) === 'scotland') return adpAppeal(mrNoticeDate, on);
  return mrTiming(mrNoticeDate, on);
}

export type NextDeadline = { kind: 'mr' | 'appeal'; due: string; lateLimit: string; status: MrTiming['status']; daysLeft: number };

/** The deadline a case is working to now, or null if nothing is pending. */
export function nextDeadline(c: { benefit?: string; decisionDate: string | null; mrRequestDate: string | null; mrNoticeDate: string | null; appealSentDate: string | null }, today: string): NextDeadline | null {
  const b = c.benefit ?? 'pip';
  if (c.mrNoticeDate) {
    if (c.appealSentDate) return null;
    const t = appealTiming(c.mrNoticeDate, today, b);
    return { kind: 'appeal', due: t.deadline, lateLimit: t.lateLimit, status: t.status, daysLeft: t.daysLeft };
  }
  if (c.decisionDate && !c.mrRequestDate) {
    const t = mrTiming(c.decisionDate, today, b);
    return { kind: 'mr', due: t.deadline, lateLimit: t.lateLimit, status: t.status, daysLeft: t.daysLeft };
  }
  return null;
}
