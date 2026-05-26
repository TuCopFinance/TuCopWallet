import { ErrorContext } from 'src/components/ErrorMessage/types'

export function formatTechDetails(ctx: ErrorContext): string {
  const lines: string[] = []
  const push = (label: string, value?: string | number) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`${label}: ${value}`)
  }

  push('errorName', ctx.errorName)
  push('errorMessage', ctx.errorMessage)
  if (ctx.errorCause) push('errorCause', ctx.errorCause)
  if (ctx.screen) push('screen', ctx.screen)
  if (ctx.action) push('action', ctx.action)
  if (ctx.tokenSymbol) push('token', ctx.tokenSymbol)
  lines.push(`network: ${ctx.network} (chainId ${ctx.chainId})`)
  if (ctx.walletAddress) push('wallet', ctx.walletAddress)
  lines.push(`appVersion: ${ctx.appVersion} (${ctx.buildNumber})`)
  lines.push(`platform: ${ctx.platform} ${ctx.osVersion}`)
  push('language', ctx.language)
  push('timestamp', ctx.timestamp)

  if (ctx.errorStack) {
    lines.push('')
    lines.push('stack:')
    lines.push(ctx.errorStack)
  }

  return lines.join('\n')
}
