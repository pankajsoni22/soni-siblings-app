import type { ReactNode } from 'react';

/** Page title with optional actions on the right (they wrap below on phones). */
export default function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
