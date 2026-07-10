# Research wallets

Dedicated low-stakes EOAs used to run on-chain experiments for the spikes in
[../](../). All wallets operate on **Celo mainnet** (TuCop never uses
testnet — locked design decision). Balances are kept under single-digit USD;
private keys live ONLY in the gitignored `.wallets.txt` here, never on
other devices or in any backend.

## What lives here

- `.wallets.txt` (gitignored, perms 0600) — full inventory: addresses, mnemonics,
  private keys, balance state, what each wallet was used for, what is still
  live versus burned/superseded.
- `README.md` (this file) — public navigation. Safe to commit.

## Why this folder is gitignored at the file level (not the folder)

`.wallets.txt` is excluded via `.git/info/exclude`
(pattern: `/docs/research/wallets/.wallets.txt`). The folder itself stays in
git so this README can document what is here without leaking secrets.

## Audit trail

For tx hashes, contract addresses, and per-wallet decisions, see
[../README.md](../README.md) (Sprint 0 outcomes) and the matching ADRs under
[../../adr/](../../adr/).
