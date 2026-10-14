// es-CO number formatting for TuCOPRamp copy: dots for thousands, comma for
// decimals ("1.500.000", "0,5"). Done by hand rather than through Intl so the
// output does not depend on the JS engine's ICU data.

export function formatCop(value: number, maxDecimals = 2): string {
  const factor = 10 ** maxDecimals
  const rounded = Math.round(value * factor) / factor
  const [integerPart, decimalPart] = Math.abs(rounded).toFixed(maxDecimals).split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = (decimalPart ?? '').replace(/0+$/, '')
  return `${rounded < 0 ? '-' : ''}${grouped}${decimals ? `,${decimals}` : ''}`
}

export function formatPercent(value: number): string {
  return formatCop(value, 2)
}
