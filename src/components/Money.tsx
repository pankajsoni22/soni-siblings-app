import { formatINR } from '../lib/money.ts';

/** An amount in rupees, Indian grouping, digits aligned in columns. */
export default function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={`money${className ? ` ${className}` : ''}`}>{value == null ? '—' : formatINR(value)}</span>;
}
