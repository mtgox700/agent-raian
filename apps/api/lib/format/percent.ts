/** "72,7 %": French decimal comma and non-breaking space before the sign. */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')}\u00a0%`
}
