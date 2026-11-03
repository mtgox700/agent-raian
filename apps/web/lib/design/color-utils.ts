/**
 * withAlpha: alpha-suffix helper safe for BOTH raw hex and CSS variables.
 *
 * The codebase's data-driven color pattern was `${color}40` (8-digit hex).
 * After the white-label pass some of those colors became `var(--brand-primary)`
 * - and `var(--x)40` is invalid CSS. This helper keeps the exact previous
 * behavior for hex values (plain concatenation) and maps known brand vars to
 * their `--*-rgb` twins as `rgba(var(--x-rgb), a)`.
 */

const VAR_RGB_TWIN: Record<string, string> = {
  'var(--brand-primary)':      '--brand-primary-rgb',
  'var(--brand-primary-deep)': '--brand-primary-deep-rgb',
  'var(--gold)':               '--gold-rgb',
  'var(--ai)':                 '--ai-rgb',
}

/** @param alphaHex two hex digits, e.g. '40' (≈ 0.25), '15' (≈ 0.08) */
export function withAlpha(color: string | undefined, alphaHex: string): string {
  // Preserve the historical template-literal behavior for undefined inputs
  // (`${undefined}18` -> invalid CSS -> property ignored, same as before).
  if (!color) return `${color}${alphaHex}`
  const twin = VAR_RGB_TWIN[color]
  if (twin) {
    const alpha = Math.round((parseInt(alphaHex, 16) / 255) * 1000) / 1000
    return `rgba(var(${twin}), ${alpha})`
  }
  // Hex (or any non-var color): identical to the historical `${color}${alpha}`.
  return `${color}${alphaHex}`
}
