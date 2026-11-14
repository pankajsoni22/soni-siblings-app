import { ROLE_LABELS } from '../api/types.ts';
import { useAuth } from '../auth/useAuth.ts';

export default function HomePage() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <section>
      <h1>Hi, {me.name}</h1>
      <p className="muted">
        Signed in as {ROLE_LABELS[me.role]}{me.isOwner ? ' (owner)' : ''}. The dashboard arrives in a later phase.
      </p>
    </section>
  );
}
