// Mandatory reconsideration time limits (PIP and UC). A request must be made
// within one month of the date of the decision notice. A late request can be
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

export function mrTiming(decisionDate: string, on: string): MrTiming {
  const deadline = addMonths(decisionDate, 1);
  const lateLimit = addMonths(decisionDate, 13);
  const status = on <= deadline ? 'in_time' : on <= lateLimit ? 'late' : 'out_of_time';
  return { decisionDate, deadline, lateLimit, on, status, daysLeft: days(on, deadline) };
}

/** Appeal to the First-tier Tribunal: within one month after the MR notice was sent
 * (Tribunal Procedure (FtT) (SEC) Rules 2008, r22(2)(d)); time can be extended by
 * no more than 12 months (r22(8)), so 13 months from the notice at most. */
export function appealTiming(mrNoticeDate: string, on: string): MrTiming {
  return mrTiming(mrNoticeDate, on);
}

export type NextDeadline = { kind: 'mr' | 'appeal'; due: string; lateLimit: string; status: MrTiming['status']; daysLeft: number };

/** The deadline a case is working to now, or null if nothing is pending. */
export function nextDeadline(c: { decisionDate: string | null; mrRequestDate: string | null; mrNoticeDate: string | null; appealSentDate: string | null }, today: string): NextDeadline | null {
  if (c.mrNoticeDate) {
    if (c.appealSentDate) return null;
    const t = appealTiming(c.mrNoticeDate, today);
    return { kind: 'appeal', due: t.deadline, lateLimit: t.lateLimit, status: t.status, daysLeft: t.daysLeft };
  }
  if (c.decisionDate && !c.mrRequestDate) {
    const t = mrTiming(c.decisionDate, today);
    return { kind: 'mr', due: t.deadline, lateLimit: t.lateLimit, status: t.status, daysLeft: t.daysLeft };
  }
  return null;
}
