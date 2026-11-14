import type { ReactNode } from 'react';

/**
 * A labelled form control with optional hint and error. The control must use `id`;
 * pass `describedBy(id)` (src/lib/a11y.ts) as its aria-describedby so screen readers read the
 * hint and error.
 *
 *   <FormField id="amount" label="Amount lent (₹)" error={errors.amount}>
 *     <input id="amount" aria-describedby={describedBy('amount')} … />
 *   </FormField>
 */
export default function FormField({ id, label, hint, error, children }: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div id={`${id}-hint`} className="field-hint">{hint}</div>}
      {error && <div id={`${id}-error`} className="field-error" role="alert">{error}</div>}
    </div>
  );
}
