/**
 * Partner colours in partner order: the first three categorical slots, validated together for
 * colour-blind separation in light and dark mode. A fourth or later partner is grey rather than
 * a new, unvalidated hue.
 */
export function partnerColor(index: number): string {
  return index < 3 ? `var(--series-${index + 1})` : 'var(--muted)';
}
