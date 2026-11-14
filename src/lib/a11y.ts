/** aria-describedby for a control inside <FormField id={id}>: points at its hint and error. */
export function describedBy(id: string): string {
  return `${id}-hint ${id}-error`;
}
