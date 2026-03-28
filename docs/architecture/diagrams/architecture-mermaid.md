# TuCOP Wallet - Architecture Diagrams (Mermaid)

## High-Level Architecture

```mermaid
graph TB
    subgraph "Mobile App"
        UI[React Native UI]
        Nav[React Navigation]
        Redux[Redux Store]
        Saga[Redux Saga]
    end

    subgraph "Blockchain Layer"
        Viem[Viem Client]
        WC[WalletConnect v2]
    end

    subgraph "External Services"
        Backend[TuCOP Backend]
        BucksPay[BucksPay API]
        Squid[Squid Router]
        CoinGecko[CoinGecko API]
        Sentry[Sentry]
        Statsig[Statsig]
        Firebase[Firebase]
    end

    subgraph "Celo Network"
        Mainnet[Celo Mainnet]
        Sepolia[Celo Sepolia]
    end

    UI --> Nav
    UI --> Redux
    Redux --> Saga
    Saga --> Viem
    Saga --> Backend
    Saga --> BucksPay
    Saga --> Squid
    Saga --> CoinGecko
    Viem --> Mainnet
    Viem --> Sepolia
    WC --> Viem
    UI --> Sentry
    UI --> Statsig
    UI --> Firebase
```

## Navigation Architecture

```mermaid
graph TB
    subgraph "Root Navigator"
        Root[RootNavigator]
    end

    subgraph "Auth Flow"
        Welcome[Welcome]
        Pincode[PincodeSet]
        Biometry[EnableBiometry]
        Recovery[RecoveryPhrase]
    end

    subgraph "Main App"
        Tabs[TabNavigator]
        Home[TabHome]
        Wallet[TabWallet]
        Discover[TabDiscover]
    end

    subgraph "Feature Screens"
        Send[Send Flow]
        Swap[Swap Screen]
        Earn[Earn Home]
        Gold[Gold Home]
        BucksPay[BucksPay Flow]
    end

    subgraph "Modals"
        QR[QR Scanner]
        Actions[Action Sheet]
    end

    Root --> Welcome
    Welcome --> Pincode
    Pincode --> Biometry
    Biometry --> Recovery
    Recovery --> Tabs

    Tabs --> Home
    Tabs --> Wallet
    Tabs --> Discover

    Home --> Send
    Home --> Swap
    Home --> Earn
    Home --> Gold
    Wallet --> Send
    Discover --> BucksPay

    Send --> QR
    Swap --> Actions
```

## Redux State Architecture

```mermaid
graph LR
    subgraph "Redux Store"
        subgraph "Core Slices"
            web3[web3]
            account[account]
            app[app]
        end

        subgraph "Token Slices"
            tokens[tokens]
            localCurrency[localCurrency]
            exchange[exchange]
        end

        subgraph "Transaction Slices"
            send[send]
            transactions[transactions]
            fees[fees]
        end

        subgraph "Feature Slices"
            swap[swap]
            earn[earn]
            gold[gold]
            buckspay[buckspay]
        end

        subgraph "Identity Slices"
            identity[identity]
            recipients[recipients]
        end
    end

    subgraph "Sagas"
        tokensSaga[Tokens Saga]
        sendSaga[Send Saga]
        swapSaga[Swap Saga]
        goldSaga[Gold Saga]
    end

    tokens --> tokensSaga
    send --> sendSaga
    swap --> swapSaga
    gold --> goldSaga
```

## Send Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as SendScreen
    participant R as Redux
    participant S as Saga
    participant V as Viem
    participant C as Celo Chain

    U->>UI: Enter recipient
    UI->>R: Update recipient state
    U->>UI: Enter amount
    UI->>R: Update amount state
    UI->>S: Prepare transaction
    S->>V: Estimate gas
    V->>C: eth_estimateGas
    C-->>V: Gas estimate
    V-->>S: PreparedTransaction
    S-->>R: Set prepared tx
    R-->>UI: Show confirmation
    U->>UI: Confirm send
    UI->>R: Dispatch SEND_PAYMENT
    R->>S: sendPaymentSaga
    S->>V: sendTransaction
    V->>C: eth_sendRawTransaction
    C-->>V: txHash
    S->>V: waitForReceipt
    V->>C: eth_getTransactionReceipt
    C-->>V: Receipt
    V-->>S: Success
    S-->>R: SEND_PAYMENT_SUCCESS
    R-->>UI: Navigate home
```

## Swap Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as SwapScreen
    participant H as useSwapQuote
    participant Squid as Squid Router
    participant V as Viem
    participant C as Celo Chain

    U->>UI: Select tokens & amount
    UI->>H: fetchQuote(from, to, amount)
    H->>Squid: POST /v1/route
    Squid-->>H: Quote + transactions
    H-->>UI: Display quote
    U->>UI: Confirm swap
    UI->>V: sendTransaction(swap tx)
    V->>C: Execute swap
    C-->>V: txHash
    V-->>UI: Success
    UI->>UI: Refresh balances
```

## Gold Buy Flow

```mermaid
flowchart TD
    A[GoldHome] --> B{User Action}
    B -->|Buy| C[GoldBuyEnterAmount]
    B -->|Sell| D[GoldSellEnterAmount]

    C --> E[Enter USDT amount]
    E --> F[Fetch Quote from Squid]
    F --> G[Show XAUt0 amount]
    G --> H[GoldBuyConfirmation]
    H --> I{Confirm?}
    I -->|Yes| J[Execute Swap]
    I -->|No| C
    J --> K[Success]
    K --> A

    D --> L[Enter XAUt0 amount]
    L --> M[Fetch Quote]
    M --> N[Show USDT amount]
    N --> O[GoldSellConfirmation]
    O --> P{Confirm?}
    P -->|Yes| Q[Execute Swap]
    P -->|No| D
    Q --> R[Success]
    R --> A
```

## BucksPay Offramp Flow

```mermaid
flowchart TD
    A[FiatExchange] --> B[SelectOfframpProvider]
    B --> C[BucksPayBankForm]
    C --> D[Enter Details]
    D --> E[Fetch Quote]
    E --> F[BucksPayConfirm]
    F --> G{User Confirms?}
    G -->|No| C
    G -->|Yes| H[PIN Verification]
    H --> I[Prepare COPm Transfer]
    I --> J[Sign & Send TX]
    J --> K[Register with BucksPay API]
    K --> L[BucksPayStatus]
    L --> M{Status?}
    M -->|Pending| N[Poll Status]
    N --> M
    M -->|Processing| N
    M -->|Completed| O[Success]
    M -->|Failed| P[Show Error]
```

## Token Balance Architecture

```mermaid
graph TB
    subgraph "Data Sources"
        API[Backend API]
        Chain[On-chain ERC20]
        Cache[Local Cache]
    end

    subgraph "Redux"
        Slice[tokens slice]
        Selectors[Selectors]
    end

    subgraph "Hooks"
        useTokenInfo[useTokenInfo]
        useTotalBalance[useTotalTokenBalance]
        useSwappable[useSwappableTokens]
    end

    subgraph "UI Components"
        TabWallet[TabWallet]
        TokenDetails[TokenDetails]
        TokenBalanceItem[TokenBalanceItem]
    end

    API --> Slice
    Chain --> Slice
    Cache --> Slice
    Slice --> Selectors
    Selectors --> useTokenInfo
    Selectors --> useTotalBalance
    Selectors --> useSwappable
    useTokenInfo --> TokenBalanceItem
    useTotalBalance --> TabWallet
    useSwappable --> TokenDetails
```

## Onboarding State Machine

```mermaid
stateDiagram-v2
    [*] --> Welcome

    Welcome --> PincodeSet: Create Wallet
    Welcome --> ImportSelect: Restore Wallet

    ImportSelect --> SignInWithEmail: Cloud Backup
    ImportSelect --> ImportWallet: Recovery Phrase

    PincodeSet --> EnableBiometry: PIN Set
    EnableBiometry --> ProtectWallet: Biometry Done
    ProtectWallet --> RecoveryPhrase: Continue
    RecoveryPhrase --> VerificationStart: Phrase Saved

    ImportWallet --> VerificationStart: Imported
    SignInWithEmail --> VerificationStart: Verified

    VerificationStart --> ChooseAdventure: Phone Verified
    VerificationStart --> ChooseAdventure: Skip

    ChooseAdventure --> TabHome: Continue
    ChooseAdventure --> TabHome: Later

    TabHome --> [*]
```

## Error Handling Flow

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type}

    B -->|Render Error| C[Error Boundary]
    B -->|Saga Error| D[Saga Catch]
    B -->|Network Error| E[Fetch Retry]
    B -->|Blockchain Error| F[TX Handler]

    C --> G[Log to Sentry]
    D --> G
    E --> G
    F --> G

    G --> H{User Impact?}

    H -->|Yes| I[showErrorOrFallback]
    H -->|No| J[Silent Log]

    I --> K[Alert Dialog]
    K --> L[User Acknowledges]
    L --> M[Recovery Action]
```

## Feature Flag Architecture

```mermaid
graph TB
    subgraph "Statsig"
        Console[Statsig Console]
        SDK[Statsig SDK]
    end

    subgraph "App"
        Init[Initialize]
        Gates[Feature Gates]
        Configs[Dynamic Configs]
        Experiments[Experiments]
    end

    subgraph "Features"
        Gold[Gold Feature]
        BucksPay[BucksPay]
        Points[Points System]
        Earn[Earn Feature]
    end

    Console --> SDK
    SDK --> Init
    Init --> Gates
    Init --> Configs
    Init --> Experiments

    Gates -->|show_gold_feature| Gold
    Gates -->|show_buckspay| BucksPay
    Gates -->|show_points| Points
    Gates -->|show_earn| Earn
```

## Related Documentation

- [Architecture Overview](../OVERVIEW.md)
- [Redux Documentation](../modules/redux.md)
- [Navigation Documentation](../modules/navigation.md)
- [ADR Index](../../adr/)
