# Onboarding Flow Diagram

## Overview

The onboarding flow guides new users through wallet creation or import,
PIN setup, and optional biometric authentication.

## Flow Variants

```
┌─────────────────────────────────────────────────────────────────────┐
│                         App Launch                                   │
│                              │                                       │
│              Check: language, terms, PIN, onboarding                 │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │   New User?         │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌───────────┐    ┌───────────┐    ┌───────────┐
       │   NEW     │    │  IMPORT   │    │ RETURNING │
       │  WALLET   │    │  WALLET   │    │   USER    │
       └───────────┘    └───────────┘    └───────────┘
```

## New Wallet Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Welcome                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                        TuCOP                                │    │
│  │                                                             │    │
│  │                 Tu billetera colombiana                     │    │
│  │                                                             │    │
│  │            [Crear nueva billetera]                          │    │
│  │                                                             │    │
│  │            [Ya tengo una billetera]                         │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                    Tap "Crear nueva"                                 │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RegulatoryTerms                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                 Términos y Condiciones                      │    │
│  │                                                             │    │
│  │  ☐ Acepto los términos de servicio                         │    │
│  │  ☐ Acepto la política de privacidad                        │    │
│  │                                                             │    │
│  │                    [Continuar]                              │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                     Accept terms                                     │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PincodeSet                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                   Crear PIN de 6 dígitos                    │    │
│  │                                                             │    │
│  │                    ○ ○ ○ ○ ○ ○                              │    │
│  │                                                             │    │
│  │                   [1] [2] [3]                               │    │
│  │                   [4] [5] [6]                               │    │
│  │                   [7] [8] [9]                               │    │
│  │                       [0]                                   │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                      Enter PIN                                       │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                   Confirmar PIN                             │    │
│  │                                                             │    │
│  │                    ○ ○ ○ ○ ○ ○                              │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                    Confirm PIN                                       │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EnableBiometry                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                         🔐                                  │    │
│  │                                                             │    │
│  │               ¿Habilitar Face ID?                           │    │
│  │                                                             │    │
│  │   Desbloquea tu billetera más rápido                        │    │
│  │                                                             │    │
│  │            [Habilitar Face ID]                              │    │
│  │                                                             │    │
│  │                [Omitir]                                     │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                Enable or skip biometry                               │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ProtectWallet                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                   Protege tu billetera                      │    │
│  │                                                             │    │
│  │   Tu frase de recuperación es la única forma de             │    │
│  │   recuperar tu billetera si pierdes acceso.                 │    │
│  │                                                             │    │
│  │   ⚠️ Si pierdes tu frase, pierdes tus fondos               │    │
│  │                                                             │    │
│  │            [Ver frase de recuperación]                      │    │
│  │                                                             │    │
│  │                [Recordarme después]                         │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                  Show phrase or skip                                 │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OnboardingRecoveryPhrase                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │              Tu frase de recuperación                       │    │
│  │                                                             │    │
│  │   ┌─────────────────────────────────────────────────────┐  │    │
│  │   │  1. apple     7. guitar                             │  │    │
│  │   │  2. banana    8. house                              │  │    │
│  │   │  3. cherry    9. island                             │  │    │
│  │   │  4. dog      10. jungle                             │  │    │
│  │   │  5. elephant 11. kite                               │  │    │
│  │   │  6. forest   12. lemon                              │  │    │
│  │   └─────────────────────────────────────────────────────┘  │    │
│  │                                                             │    │
│  │   ⚠️ Escríbela en papel. Nunca la compartas.               │    │
│  │                                                             │    │
│  │            [Ya la anoté, continuar]                         │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                    User confirms                                     │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OnboardingSuccessScreen                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                         🎉                                  │    │
│  │                                                             │    │
│  │                  ¡Billetera creada!                         │    │
│  │                                                             │    │
│  │            Tu dirección: 0x1234...5678                      │    │
│  │                                                             │    │
│  │               [Empezar a usar TuCOP]                        │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                     Go to home                                       │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
                        TabNavigator
```

## Import Wallet Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ImportSelect                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │              ¿Cómo quieres importar?                        │    │
│  │                                                             │    │
│  │   ┌─────────────────────────────────────────────────────┐  │    │
│  │   │  📝 Frase de recuperación                           │  │    │
│  │   │     12 o 24 palabras                                │  │    │
│  │   └─────────────────────────────────────────────────────┘  │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ImportWallet                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │           Ingresa tu frase de recuperación                  │    │
│  │                                                             │    │
│  │   ┌─────────────────────────────────────────────────────┐  │    │
│  │   │                                                     │  │    │
│  │   │  apple banana cherry dog elephant forest...         │  │    │
│  │   │                                                     │  │    │
│  │   └─────────────────────────────────────────────────────┘  │    │
│  │                                                             │    │
│  │                     [Importar]                              │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                     Validate & import                                │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
                        PincodeSet
                              │
                              ▼
                       EnableBiometry
                              │
                              ▼
                   OnboardingSuccessScreen
```

## State Tracking

```typescript
interface AccountState {
  acceptedTerms: boolean
  pincodeType: PincodeType // Unset | CustomPin
  onboardingCompleted: boolean
  lastOnboardingStepScreen: string | null // Resume point
  recoveryPhraseInOnboardingStatus: 'NotStarted' | 'InProgress' | 'Completed'
}
```

## Resume Logic

```
┌─────────────────────────────────────────────────────────────────────┐
│                    getInitialRoute()                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  if (!language)                  → Screens.Language                  │
│  if (!acceptedTerms)             → Screens.RegulatoryTerms           │
│  if (pincodeType === Unset)      → Screens.PincodeSet                │
│  if (!onboardingCompleted &&                                         │
│      lastOnboardingStepScreen)   → lastOnboardingStepScreen          │
│  else                            → Screens.TabNavigator              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Files

| File                                                       | Purpose       |
| ---------------------------------------------------------- | ------------- |
| `src/onboarding/welcome/Welcome.tsx`                       | Entry point   |
| `src/onboarding/registration/RegulatoryTerms.tsx`          | Terms         |
| `src/pincode/PincodeSet.tsx`                               | PIN creation  |
| `src/onboarding/registration/EnableBiometry.tsx`           | Biometrics    |
| `src/onboarding/registration/ProtectWallet.tsx`            | Backup prompt |
| `src/onboarding/registration/OnboardingRecoveryPhrase.tsx` | Show phrase   |
| `src/onboarding/success/OnboardingSuccessScreen.tsx`       | Completion    |
| `src/import/ImportWallet.tsx`                              | Import flow   |
| `src/navigator/initialRoute.ts`                            | Resume logic  |
