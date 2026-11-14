import { useAuth } from '../auth/useAuth.ts';

export default function HomePage() {
  const { me } = useAuth();

  return (
    <section>
      <h1>Hi, {me?.name}</h1>
      <p className="muted">You are signed in. The screens will appear here once the functional spec is added.</p>
    </section>
  );
}
