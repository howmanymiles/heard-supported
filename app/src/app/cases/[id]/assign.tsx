import { requireMe } from '@/lib/auth';
import { listUsers, canManage } from '@/lib/casework';
import { assignAction } from '../../actions';

/** Who holds the case; supervisors and admins can reassign, an adviser can take it. */
export async function AssignBox({ caseId, adviserId, adviserName }: { caseId: string; adviserId: string | null; adviserName: string | null }) {
  const me = await requireMe();
  const manage = canManage(me);
  const users = manage ? await listUsers(me) : [];
  return (
    <div className="row small" style={{ alignItems: 'center' }}>
      <span>Adviser: <b>{adviserName ?? 'Unassigned'}</b></span>
      {manage ? (
        <form action={assignAction} className="inline">
          <input type="hidden" name="caseId" value={caseId} />
          <label className="inline">Give to
            <select name="userId" defaultValue={adviserId ?? ''} aria-label="Assign to">{users.map(u => <option key={u.id} value={u.id}>{u.name ?? 'Unnamed'}</option>)}</select>
          </label>
          <button className="btn btn-small">Assign</button>
        </form>
      ) : adviserId !== me.userId ? (
        <form action={assignAction}><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="userId" value={me.userId} /><button className="btn btn-small">Take this case</button></form>
      ) : null}
    </div>
  );
}
