# Connecting DApps

TuCOP Wallet supports [WalletConnect v2](https://docs.walletconnect.com/2.0/) for connecting DApps. [WalletConnect v1 is end-of-life](https://docs.walletconnect.com/2.0/advanced/migration-from-v1.x/overview) and not supported.

If you're building a DApp we recommend [rainbowkit](https://github.com/rainbow-me/rainbowkit) or [Web3Modal](https://github.com/WalletConnect/web3modal) to make it easy to connect your DApp to TuCOP Wallet via WalletConnect. Take a look at a [complete example](https://docs.celo.org/developer/rainbowkit-celo) to help you get started.

## WalletConnect Details

Supported actions: `src/walletConnect/constants.ts`

Docs for WalletConnect v2: https://docs.walletconnect.com/2.0

## Troubleshooting Tips

When building the connection between your DApp and TuCOP Wallet, it can be challenging to determine the source of a connection error. We recommend using the official WalletConnect example DApp and wallet to help with this.

- If TuCOP Wallet cannot connect to your DApp but is able to connect to the [WalletConnect v2 example react DApp](https://react-app.walletconnect.com/) correctly, the issue likely lies with your DApp. It can be helpful to check the [implementation details](https://github.com/WalletConnect/web-examples/tree/main/dapps/react-dapp-v2) of this example DApp against your own implementation.
- If your DApp is unable to connect to the [WalletConnect v2 example wallet](https://react-wallet.walletconnect.com/), there is likely an issue with your DApp. As above, we recommend comparing the implementation details between your DApp and the example DApp provided.

If these troubleshooting steps don't help, please open an issue on the [TuCOP Wallet repository](https://github.com/TuCopFinance/TuCopWallet/issues).
