# Icons Directory Structure

## Organization

```
src/icons/
├── _unused/              # Unused icons (candidates for deletion)
├── actions/              # Action icons (copy, paste, share, etc.)
├── auth/                 # Authentication icons (lock, eye, biometric)
├── biometry/             # Biometric auth icons
├── data/                 # Data indicators (DataUp, DataDown)
├── features/             # Feature-specific icons (earn, QR, rewards)
├── forms/                # Form icons
├── loading/              # Loading spinners
├── lottie-json/          # Lottie animations
├── misc/                 # Miscellaneous (celebration, thumbsup)
├── navigation/           # Navigation icons (arrows, chevrons)
├── navigator/            # Bottom tab icons
├── quick-actions/        # Quick actions (Add, Send, Receive)
├── settings/             # Settings icons (gear, bell, preferences)
├── status/               # Status icons (checkmark, error, warning)
├── tab-home/             # TabHome-specific card icons
├── tokens/               # Token icons (Pesos, Dollars, Gold)
├── ui/                   # General UI icons (clock, star, checkbox)
└── user/                 # User icons (user, profile)
```

## Token Icons (`tokens/`)

All token icons are SVG for consistency and scalability.

| File                | Token      | Usage                 |
| ------------------- | ---------- | --------------------- |
| `DollarsIcon.tsx`   | USDT, USD₮ | Dollar (Tether green) |
| `GoldBarIcon.tsx`   | XAUt0      | Gold - bar variant    |
| `GoldVaultIcon.tsx` | XAUt0      | Gold - vault variant  |
| `PesosIcon.tsx`     | COPm, cCOP | Colombian peso        |

## Category Details

### `actions/` - Action Icons

- AddFunds, CopyIcon, Paste, Share, SwapArrows, SwapAndDeposit
- Manage, OpenLinkIcon, PlusIcon, Refresh, ScanIcon, Search

### `auth/` - Authentication Icons

- Lock, EyeIcon, HiddenEyeIcon, KeylessBackup
- Apple, Google, Phone, Backspace

### `features/` - Feature-Specific Icons

- EarnGrowIcon, EarnCoins, QRCode, Reward, Trophy
- Activity, BankIcon, CrossChainIndicator, ShopToken, Stack

### `settings/` - Settings Icons

- GearIcon, NotificationBellIcon, Preferences, Help

### `ui/` - General UI Icons

- CircledIcon, GradientIcon, RadioButton, CheckBox
- ClockIcon, StarOutline, ImageErrorIcon, GreyOut
- Clipboard, HamburgerCard, TripleDotVertical

### `misc/` - Miscellaneous/Illustrations

- Celebration, ThumbsUpIllustration, MagicWand

### `user/` - User Icons

- User, ProfilePlus

## Arrow Icons (NOT duplicates)

| Icon                | Location    | Purpose               |
| ------------------- | ----------- | --------------------- |
| `ArrowDown.tsx`     | navigation/ | Full arrow (download) |
| `DownArrowIcon.tsx` | navigation/ | Chevron (dropdown)    |
| `DataDown.tsx`      | data/       | Triangle (price down) |
| `DataUp.tsx`        | data/       | Triangle (price up)   |
| `SwapArrows.tsx`    | actions/    | Bidirectional arrows  |

## Unused Icons (`_unused/`)

Icons with no imports in the project:

- `AddCCOP.tsx` - Old add pesos icon (replaced by PesosIcon)
- `CloudCheck.tsx` - Cloud sync
- `Envelope.tsx` - Duplicate of `keylessBackup/EnvelopeIcon.tsx`
- `ExploreTokens.tsx` - Token exploration
- `DollarsIcon.png` - Replaced by SVG
