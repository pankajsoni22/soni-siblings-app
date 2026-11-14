import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/ApiError.ts';
import { initialsOf } from '../components/shell/navItems.ts';
import { ROLE_LABELS, type AppUser, type Role } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import { useAuth } from '../auth/useAuth.ts';
import ConfirmDialog from '../components/ConfirmDialog.tsx';
import FormField from '../components/FormField.tsx';
import PageHeader from '../components/PageHeader.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { describedBy } from '../lib/a11y.ts';

const ROLES: Role[] = ['ADMIN', 'USER_W', 'USER_RO'];
const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, including partners, users and settings',
  USER_W: 'Add, edit and delete entries',
  USER_RO: 'View only'
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Pending =
  | { kind: 'role'; user: AppUser; role: Role }
  | { kind: 'remove'; user: AppUser };

export default function UsersPage() {
  const api = useApi();
  const toast = useToast();
  const { me } = useAuth();
  const list = useQuery('users', a => a.listUsers());

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('USER_RO');
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const fail = (err: unknown) => {
    if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setAddError('Enter a Google email address, like name@gmail.com'); return; }
    const existing = list.data?.find(u => u.email === clean);
    if (existing?.active) { setAddError(`${clean} already has access as ${ROLE_LABELS[existing.role]}. Change the role below instead.`); return; }
    setBusy(true);
    try {
      await api.saveUser(clean, role);
      toast(`${clean} can now sign in as ${ROLE_LABELS[role]}`);
      setEmail('');
      setAddError(null);
      list.reload();
    } catch (err) {
      if (ApiError.is(err, 'VALIDATION')) setAddError(err.message);
      else fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'role') {
        await api.saveUser(pending.user.email, pending.role);
        toast(`${pending.user.email} is now ${ROLE_LABELS[pending.role]}`);
      } else {
        await api.removeUser(pending.user.email);
        toast(`${pending.user.email} can no longer sign in`);
      }
      setPending(null);
      list.reload();
    } catch (err) {
      setPending(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const isSelf = (u: AppUser) => u.email === me?.email;

  return (
    <section>
      <PageHeader title="Users" subtitle="Only people on this list can sign in. Changes apply on their next action." />

      <form className="card add-user" onSubmit={e => void add(e)} noValidate>
        <div className="form-section-title"><h2>Give someone access</h2></div>
        <div className="form-grid">
          <FormField id="new-email" label="Google email" error={addError}>
            <input id="new-email" type="email" value={email} autoComplete="off" placeholder="name@gmail.com"
              aria-describedby={describedBy('new-email')} aria-invalid={Boolean(addError)}
              onChange={e => { setEmail(e.target.value); setAddError(null); }} />
          </FormField>
          <FormField id="new-role" label="Role" hint={ROLE_HELP[role]}>
            <select id="new-role" value={role} aria-describedby={describedBy('new-role')} onChange={e => setRole(e.target.value as Role)}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </FormField>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy}><UserPlus size={16} aria-hidden="true" /> Add person</button>
        </div>
      </form>

      {list.error && !list.data ? <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
        : !list.data ? <div className="card"><Loading /></div>
          : (
            <div className="card">
            <div className="card-head"><h2>People with access</h2><span className="card-sub">{list.data.filter(u => u.active).length} active</span></div>
            <ul className="user-list">
              {list.data.map(u => (
                <li key={u.email} className={`user-row${u.active ? '' : ' user-removed'}`}>
                  <div className="user-who">
                    <span className="avatar" aria-hidden="true">{initialsOf(u.email)}</span>
                    <span className="user-text">
                      <span className="user-email">{u.email}{isSelf(u) && <span className="muted"> (you)</span>}</span>
                      <span className="user-note">
                        {u.isOwner ? 'Owner · always an admin' : u.active ? ROLE_HELP[u.role] : 'No access'}
                      </span>
                    </span>
                  </div>
                  <div className="user-actions">
                    {u.isOwner ? (
                      <span className="badge badge-good"><ShieldCheck size={13} aria-hidden="true" /> Admin</span>
                    ) : u.active ? (
                      <>
                        <label className="visually-hidden" htmlFor={`role-${u.email}`}>Role for {u.email}</label>
                        <select id={`role-${u.email}`} value={u.role} disabled={busy}
                          onChange={e => setPending({ kind: 'role', user: u, role: e.target.value as Role })}>
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                        <button type="button" className="btn btn-ghost btn-danger-text" disabled={busy}
                          onClick={() => setPending({ kind: 'remove', user: u })}>Remove</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost" disabled={busy}
                        onClick={() => setPending({ kind: 'role', user: u, role: u.role })}>Give access again</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            </div>
          )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'remove' ? `Remove ${pending.user.email}?`
            : pending.user.active ? `Make ${pending.user.email} ${ROLE_LABELS[pending.role]}?` : `Give ${pending.user.email} access again?`}
          confirmLabel={pending.kind === 'remove' ? 'Remove' : 'Confirm'}
          danger={pending.kind === 'remove' || (isSelf(pending.user) && pending.kind === 'role' && pending.role !== 'ADMIN')}
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          {pending.kind === 'remove'
            ? `${isSelf(pending.user) ? 'You will be signed out of the app on your next action. ' : ''}They lose access on their next action, even if the app is open. Their past entries stay.`
            : isSelf(pending.user) && pending.role !== 'ADMIN'
              ? 'You will lose admin access, including this page.'
              : `${ROLE_LABELS[pending.role]}: ${ROLE_HELP[pending.role]}. Applies on their next action.`}
        </ConfirmDialog>
      )}
    </section>
  );
}
