// Design tokens for the TuCop Wallet. Every feature file consumes colors
// from this enum. Raw hex literals in feature code are forbidden per
// .claude/rules/design-system.md — extend the enum, don't inline.
enum Colors {
  // black & white
  black = '#2E3338',
  white = '#FFFFFF',
  white30 = 'rgba(255, 255, 255, 0.3)',
  white11 = 'rgba(255, 255, 255, 0.11)',
  transparent = 'transparent',

  // grays
  gray6 = '#455073',
  gray5 = '#505050',
  gray4 = '#666666',
  gray3 = '#757575',
  gray2 = '#E6E6E6',
  gray1 = '#F8F9F9',
  // Neutral near-black used for full-bleed gradient stops (welcome
  // screen background, radial gradient). Slightly darker than
  // `Colors.black` which is a warm dark gray optimized for text.
  nearBlack = '#0D0D0D',

  // primary
  primary = '#2F4ACD',
  accent = '#2F4ACD',
  lightPrimary = 'rgba(80, 97, 232, 0.1)',
  primary10 = '#EEEFFF',
  primary80 = '#2F4ACDCC',

  // secondary
  secondary = '#2E3142',

  // status
  successDark = '#137211',
  successLight = '#F1FDF1',
  warningDark = '#9C6E00',
  warningLight = '#FFF9EA',
  error = '#EA6042',
  errorDark = '#C93717',
  errorLight = '#FBF2F0',
  infoDark = '#0768AE',
  infoLight = '#E8F8FF',

  // gradient stops
  gradientBorderLeft = '#2F4ACD',
  gradientBorderRight = '#182567',

  // BalanceCard gradient stops (Apple-Wallet style card stack).
  // Kept as named tokens so future palette tweaks flow to every card
  // instead of hunting hex through BalanceCard.tsx.
  balanceCardBlueStart = '#1B3DB2',
  balanceCardBlueMid = '#0A1840',
  balanceCardBlueEnd = '#000D2E',
  balanceCardGoldStart = '#3A2A05',
  balanceCardGoldPeak = '#FFE17A',
  balanceCardGoldMid = '#D4A017',
  balanceCardGoldEnd = '#8B6914',
  balanceCardGreenStart = '#26A17B',
  balanceCardGreenMid = '#1A6F55',
  balanceCardGreenEnd = '#0F4733',

  // gold accents (Oro feature: chart loaders, sell borders, currency
  // display highlights). Was `goldBrand` — kept the value, renamed to
  // remove the "brand" framing that made it feel general-purpose.
  goldAccent = '#FBCC5C',
  goldAccentLight = '#FFF8E1',

  // shadows
  softShadow = 'rgba(156, 164, 169, 0.4)',
  lightShadow = 'rgba(48, 46, 37, 0.15)',
  barShadow = 'rgba(129, 134, 139, 0.5)',
}

export default Colors
