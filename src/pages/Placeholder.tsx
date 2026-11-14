import PageHeader from '../components/PageHeader.tsx';
import { EmptyState } from '../components/States.tsx';

/** Stand-in for a screen that a later phase builds. */
export default function Placeholder({ title, phase, children }: { title: string; phase: number; children?: string }) {
  return (
    <section>
      <PageHeader title={title} />
      <div className="card">
        <EmptyState title={`Arrives in phase ${phase}`}>{children}</EmptyState>
      </div>
    </section>
  );
}
