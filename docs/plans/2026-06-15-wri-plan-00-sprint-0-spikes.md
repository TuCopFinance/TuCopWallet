<!-- markdownlint-disable MD032 MD060 MD040 -->

# Wallet Robustness Initiative — Plan 00: Sprint 0 Spikes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the 5 research spikes (S1-S5) defined in the design spec section 5 to resolve the technical unknowns that gate the rest of the initiative.

**Architecture:** Five parallel research workstreams, each time-boxed and producing a written outcome document under `docs/spikes/`. No production code is merged from this plan. Spike branches stay isolated; results inform the per-track plans.

**Tech Stack:** viem 2.24.1, Foundry (forge / cast / anvil), TypeScript (tsx for one-off scripts), GitHub CLI for outreach drafting.

**Source spec:** [docs/specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md) (sections 5.S1-5.S5).

**Git workflow:** Each spike on its own branch `spike/wri-s<N>-<short>`. Spike output documents are committed to `docs/spikes/`. Per locked decision #11, all on-chain work uses Celo mainnet with a dedicated low-stakes spike wallet (less than USD 5 total exposure). NEVER Sepolia / Alfajores / testnet.

**Spike-wallet conventions:**

- Single dedicated EOA used across S1, S3, S4. Mnemonic stored in `~/.tucop-spike-wallet.txt` (chmod 600, gitignored at repo root via `.git/info/exclude`).
- Funded with USD 5 max total: 0.50 CELO (gas), 2 USDm, 2 COPm. Funded by user manually before T0 of S1.
- Address is recorded in `docs/spikes/wallet.txt` after generation.

---

## Task 0: Bootstrap shared spike resources

**Files:**

- Create: `docs/spikes/README.md`
- Create: `docs/spikes/wallet.txt`
- Create: `contracts-spike/` (new directory, not in `src/`)
- Create: `contracts-spike/foundry.toml`
- Create: `contracts-spike/.gitignore`
- Modify: `.git/info/exclude`

- [ ] **Step 1: Add spike-only files to local git exclude**

Run:

```bash
printf '%s\n' \
  '/.tucop-spike-wallet.txt' \
  '/docs/spikes/wallet.txt' \
  '/contracts-spike/out/' \
  '/contracts-spike/cache/' \
  '/contracts-spike/broadcast/' \
  >> .git/info/exclude
```

Expected: silent.

- [ ] **Step 2: Verify Foundry is installed (forge, cast, anvil)**

Run:

```bash
forge --version && cast --version && anvil --version
```

Expected: three version lines printed, all non-empty. If `command not found`, install via `curl -L https://foundry.paradigm.xyz | bash && foundryup` and re-run.

- [ ] **Step 3: Create the spike workspace and Foundry project skeleton**

Run:

```bash
mkdir -p contracts-spike docs/spikes
cd contracts-spike && forge init --no-commit --no-git --offline --quiet . && cd ..
```

Expected: `contracts-spike/{src,test,script,lib,foundry.toml}` exists.

- [ ] **Step 4: Configure Foundry for Celo mainnet**

Write `contracts-spike/foundry.toml`:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.26"
optimizer = true
optimizer_runs = 200
evm_version = "prague"

[rpc_endpoints]
celo = "https://forno.celo.org"

[etherscan]
celo = { key = "${CELOSCAN_API_KEY}", url = "https://api.celoscan.io/api" }
```

Note: `evm_version = "prague"` is required so Foundry emits EIP-7702 (tx type 0x04) compatible bytecode and ABI behavior. The Celo Isthmus fork (active since 2025-07-09) implements Prague.

- [ ] **Step 5: Write README for the spike workspace**

Write `docs/spikes/README.md`:

```markdown
# WRI Sprint 0 Spike Outputs

This directory holds research outcomes from the 5 Sprint 0 spikes defined in
[../specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md).

| Spike | File                                                     | Outcome |
| ----- | -------------------------------------------------------- | ------- |
| S1    | [`s1-cip64-7702.md`](s1-cip64-7702.md)                   | pending |
| S2    | [`s2-ethers-v5-deps.md`](s2-ethers-v5-deps.md)           | pending |
| S3    | [`s3-squid-attribution.md`](s3-squid-attribution.md)     | pending |
| S4    | [`s4-self-audit-protocol.md`](s4-self-audit-protocol.md) | pending |
| S5    | [`s5-tx-in-flight-api.md`](s5-tx-in-flight-api.md)       | pending |

`wallet.txt` (gitignored) holds the dedicated spike-wallet address used by S1, S3, S4.

`contracts-spike/` (sibling of `src/` in repo root) holds the Foundry workspace
for S1 and S4 contract experiments. Not shipped to users.
```

- [ ] **Step 6: Commit and open PR**

Run:

```bash
git checkout -b spike/wri-s0-bootstrap
git add docs/spikes/README.md contracts-spike/foundry.toml contracts-spike/.gitignore
git commit -m "chore: bootstrap WRI Sprint 0 spike workspace"
git push -u origin spike/wri-s0-bootstrap
gh pr create --base Development --title "chore: bootstrap WRI Sprint 0 spike workspace" --body "Initial Foundry + docs/spikes scaffolding for the 5 Sprint 0 research spikes. No production code touched. See [spec section 5](../specs/2026-06-15-wallet-robustness-initiative-design.md)."
gh pr checks --watch
```

Expected: CI green, then auto-merge per locked decision #10 of the spec.

---

## Task 1 (S1): Spike wallet generation and funding

**Files:**

- Create: `~/.tucop-spike-wallet.txt` (outside repo, chmod 600)
- Create: `docs/spikes/wallet.txt` (gitignored)

- [ ] **Step 1: Generate a fresh EOA mnemonic locally**

Run:

```bash
node -e "const { generateMnemonic, english } = require('viem/accounts'); console.log(generateMnemonic(english))" > ~/.tucop-spike-wallet.txt
chmod 600 ~/.tucop-spike-wallet.txt
```

Expected: 12-word mnemonic written to file. File is outside the repo; will not appear in `git status`.

- [ ] **Step 2: Derive the address and record it**

Run:

```bash
MNEMONIC="$(cat ~/.tucop-spike-wallet.txt)" node -e "
const { mnemonicToAccount } = require('viem/accounts');
const acct = mnemonicToAccount(process.env.MNEMONIC);
console.log(acct.address);
" > docs/spikes/wallet.txt
cat docs/spikes/wallet.txt
```

Expected: a 42-character `0x...` address printed to the file and stdout. Confirm the address starts with `0x` and has 40 hex chars after.

- [ ] **Step 3: Halt and notify the user to fund the wallet**

REPORT TO USER:

```
Spike wallet generated: 0x[full-address-from-step-2].
Please fund this address on Celo mainnet with:
  - 0.50 CELO (for gas headroom across spikes)
  - 2.00 USDm (for S1 CIP-64 test)
  - 2.00 COPm (for S1 CIP-64 test)
Total exposure: < USD 5.
Reply "funded" once tokens arrive (verify on https://celoscan.io/address/0x...).
```

Wait for user confirmation. Do not proceed to S1 Task 2 until user says "funded".

- [ ] **Step 4: Verify on-chain balances**

Once user confirms, run:

```bash
ADDR="$(cat docs/spikes/wallet.txt)"
cast balance "$ADDR" --rpc-url https://forno.celo.org
cast call 0x765de816845861e75a25fca122bb6898b8b1282a "balanceOf(address)(uint256)" "$ADDR" --rpc-url https://forno.celo.org
cast call 0x8a567e2ae79ca692bd748ab832081c45de4041ea "balanceOf(address)(uint256)" "$ADDR" --rpc-url https://forno.celo.org
```

Expected: all three balances non-zero. CELO at least 0.4e18, USDm at least 1e18, COPm at least 1e18.

If any zero, halt and re-prompt user.

---

## Task 2 (S1): Write minimal BatchExecutor stub

**Files:**

- Create: `contracts-spike/src/BatchExecutor.sol`
- Create: `contracts-spike/test/BatchExecutor.t.sol`

- [ ] **Step 1: Write the failing test**

Write `contracts-spike/test/BatchExecutor.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract BatchExecutorTest is Test {
    BatchExecutor exec;

    function setUp() public {
        exec = new BatchExecutor();
    }

    function test_executesSequentialCalls() public {
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](2);
        calls[0] = BatchExecutor.Call({target: address(this), value: 0, data: abi.encodeWithSignature("ping()")});
        calls[1] = BatchExecutor.Call({target: address(this), value: 0, data: abi.encodeWithSignature("ping()")});
        exec.execute(calls);
        assertEq(pingCount, 2);
    }

    uint256 public pingCount;
    function ping() external {
        pingCount++;
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd contracts-spike && forge test --match-test test_executesSequentialCalls -vvv
```

Expected: FAIL with `BatchExecutor` not found / compilation error.

- [ ] **Step 3: Write the BatchExecutor contract**

Write `contracts-spike/src/BatchExecutor.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal batch call executor for EIP-7702 delegation spike.
/// @dev SPIKE-ONLY. NOT for mainnet deployment with user funds.
contract BatchExecutor {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error CallFailed(uint256 index, bytes reason);

    function execute(Call[] calldata calls) external payable {
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
forge test --match-test test_executesSequentialCalls -vvv
```

Expected: PASS, `pingCount == 2`.

- [ ] **Step 5: Commit**

Run:

```bash
cd ..
git checkout -b spike/wri-s1-cip64-7702
git add contracts-spike/src/BatchExecutor.sol contracts-spike/test/BatchExecutor.t.sol
git commit -m "test(spike): add minimal BatchExecutor for S1"
```

---

## Task 3 (S1): Deploy BatchExecutor to Celo mainnet

**Files:**

- Create: `contracts-spike/script/DeployBatchExecutor.s.sol`
- Modify: `docs/spikes/wallet.txt` (append deployed address)

- [ ] **Step 1: Write deployment script**

Write `contracts-spike/script/DeployBatchExecutor.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract DeployBatchExecutor is Script {
    function run() external {
        uint256 pk = vm.envUint("SPIKE_WALLET_PK");
        vm.startBroadcast(pk);
        BatchExecutor exec = new BatchExecutor();
        console2.log("BatchExecutor deployed at:", address(exec));
        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Export the spike-wallet private key for the script**

Run:

```bash
MNEMONIC="$(cat ~/.tucop-spike-wallet.txt)" node -e "
const { mnemonicToAccount } = require('viem/accounts');
const acct = mnemonicToAccount(process.env.MNEMONIC);
process.stdout.write(acct.getHdKey().privateKey ? Buffer.from(acct.getHdKey().privateKey).toString('hex') : '');
" > ~/.tucop-spike-wallet.pk
chmod 600 ~/.tucop-spike-wallet.pk
```

- [ ] **Step 3: Deploy to Celo mainnet**

Run:

```bash
cd contracts-spike
SPIKE_WALLET_PK="0x$(cat ~/.tucop-spike-wallet.pk)" \
  forge script script/DeployBatchExecutor.s.sol --rpc-url celo --broadcast --slow
cd ..
```

Expected: console output line `BatchExecutor deployed at: 0x[FULL_ADDRESS]`. Capture the full address.

- [ ] **Step 4: Record the deployed address**

Run:

```bash
echo "S1 BatchExecutor: 0x[FULL_DEPLOYED_ADDRESS]" >> docs/spikes/wallet.txt
```

Replace `[FULL_DEPLOYED_ADDRESS]` with the exact 40-hex-char string from Step 3. Per global rule, no truncation.

- [ ] **Step 5: Verify on Celoscan**

Open `https://celoscan.io/address/0x[FULL_DEPLOYED_ADDRESS]` in browser. Confirm bytecode is present and contract is a Celo mainnet contract. Note: verification of source on Celoscan is optional for the spike.

---

## Task 4 (S1): Sign EIP-7702 authorization and submit tx type 0x04 with feeCurrency=USDm

**Files:**

- Create: `contracts-spike/scripts/s1-submit-7702-with-feecurrency.ts`
- Create: `contracts-spike/package.json`

- [ ] **Step 1: Initialize Node workspace in spike dir**

Run:

```bash
cd contracts-spike
cat > package.json <<'EOF'
{
  "name": "tucop-spike-scripts",
  "private": true,
  "type": "module",
  "scripts": {
    "s1": "tsx scripts/s1-submit-7702-with-feecurrency.ts"
  },
  "dependencies": {
    "viem": "2.24.1"
  },
  "devDependencies": {
    "tsx": "4.19.2",
    "typescript": "5.5.4"
  }
}
EOF
mkdir -p scripts
yarn install
cd ..
```

Expected: `yarn install` exits 0.

- [ ] **Step 2: Write the EIP-7702 submission script**

Write `contracts-spike/scripts/s1-submit-7702-with-feecurrency.ts`:

```ts
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  parseUnits,
} from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const SPIKE_WALLET = readFileSync(`${homedir()}/.tucop-spike-wallet.txt`, 'utf8').trim()
const BATCH_EXECUTOR = process.argv[2] // pass deployed address as CLI arg
const FEE_CURRENCY = process.argv[3] // 'USDm' | 'COPm'

const USDM = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
const COPM = '0x8a567e2ae79ca692bd748ab832081c45de4041ea'

const account = mnemonicToAccount(SPIKE_WALLET)
const publicClient = createPublicClient({ chain: celo, transport: http() })
const walletClient = createWalletClient({ account, chain: celo, transport: http() })

const feeCurrencyAddress = FEE_CURRENCY === 'USDm' ? USDM : COPM

console.log('Submitting EIP-7702 tx with feeCurrency=', FEE_CURRENCY, feeCurrencyAddress)
console.log('Account:', account.address)
console.log('Delegating to:', BATCH_EXECUTOR)

const authorization = await walletClient.signAuthorization({
  account,
  contractAddress: BATCH_EXECUTOR as `0x${string}`,
})

const calldata = encodeFunctionData({
  abi: parseAbi(['function execute((address target, uint256 value, bytes data)[] calls)']),
  functionName: 'execute',
  args: [[{ target: account.address, value: 0n, data: '0x' as `0x${string}` }]],
})

try {
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    data: calldata,
    authorizationList: [authorization],
    // @ts-expect-error feeCurrency is Celo-specific, viem types may not include it
    feeCurrency: feeCurrencyAddress,
  })
  console.log('Tx submitted:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Receipt status:', receipt.status, 'gasUsed:', receipt.gasUsed)
  console.log(
    'Receipt feeCurrency in tx?',
    JSON.stringify(receipt, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
  )
} catch (err) {
  console.error('SUBMIT FAILED:', err)
  process.exit(2)
}
```

- [ ] **Step 3: Run with USDm as feeCurrency**

Run:

```bash
cd contracts-spike
BATCH_EXEC="$(grep 'S1 BatchExecutor' ../docs/spikes/wallet.txt | awk '{print $NF}')"
yarn s1 "$BATCH_EXEC" USDm 2>&1 | tee ../docs/spikes/s1-usdm-output.txt
cd ..
```

Possible outcomes:

- **PASS**: tx submitted, receipt status 1, USDm balance debited. Note the tx hash.
- **FAIL (node reject)**: error log contains rejection. Capture exact message.
- **FAIL (gas only in CELO)**: tx succeeds but USDm balance unchanged; CELO balance debited.

- [ ] **Step 4: Run with COPm as feeCurrency**

Run:

```bash
cd contracts-spike
BATCH_EXEC="$(grep 'S1 BatchExecutor' ../docs/spikes/wallet.txt | awk '{print $NF}')"
yarn s1 "$BATCH_EXEC" COPm 2>&1 | tee ../docs/spikes/s1-copm-output.txt
cd ..
```

Same possible outcomes as Step 3.

- [ ] **Step 5: Re-check balances**

Run:

```bash
ADDR="$(head -1 docs/spikes/wallet.txt)"
cast balance "$ADDR" --rpc-url https://forno.celo.org
cast call 0x765de816845861e75a25fca122bb6898b8b1282a "balanceOf(address)(uint256)" "$ADDR" --rpc-url https://forno.celo.org
cast call 0x8a567e2ae79ca692bd748ab832081c45de4041ea "balanceOf(address)(uint256)" "$ADDR" --rpc-url https://forno.celo.org
```

Note pre/post balances. Difference reveals which currency paid the gas.

- [ ] **Step 6: Commit captured outputs**

Run:

```bash
git add docs/spikes/s1-usdm-output.txt docs/spikes/s1-copm-output.txt
git commit -m "chore(spike): capture S1 raw output for USDm and COPm fee currency tests"
```

---

## Task 5 (S1): Write the S1 outcome document

**Files:**

- Create: `docs/spikes/s1-cip64-7702.md`

- [ ] **Step 1: Synthesize findings**

Write `docs/spikes/s1-cip64-7702.md`:

```markdown
# S1: CIP-64 + tx type 0x04 viability on Celo mainnet

**Status:** [PASS | FAIL | CONDITIONAL]
**Date:** YYYY-MM-DD
**Spike branch:** spike/wri-s1-cip64-7702
**Spike wallet:** 0x[FULL_ADDRESS_FROM_WALLET_TXT]
**BatchExecutor deployed:** 0x[FULL_DEPLOYED_ADDRESS]

## Question

Does Celo mainnet (post-Isthmus) accept EIP-7702 transactions (type 0x04) that
also use CIP-64 `feeCurrency` to pay gas in an ERC-20 (USDm, COPm)?

## Method

1. Deployed a minimal `BatchExecutor.sol` to Celo mainnet (low-stakes wallet,
   < USD 5 exposure).
2. Signed an EIP-7702 authorization delegating spike-EOA -> BatchExecutor.
3. Submitted a tx type 0x04 with `feeCurrency = USDm` to call
   `BatchExecutor.execute` (no-op inner call back to EOA).
4. Repeated with `feeCurrency = COPm`.
5. Captured raw RPC output (`s1-usdm-output.txt`, `s1-copm-output.txt`).
6. Diff'd pre / post balances to confirm which currency paid the gas.

## Results

### USDm fee currency

- Tx submission: [accepted | rejected with error: "..."]
- Tx hash: 0x[FULL_HASH]
- Receipt status: [1 | 0]
- CELO debited: X wei
- USDm debited: X wei
- Conclusion: [feeCurrency honored | feeCurrency ignored, CELO paid]

### COPm fee currency

- Tx submission: [accepted | rejected with error: "..."]
- Tx hash: 0x[FULL_HASH]
- Receipt status: [1 | 0]
- CELO debited: X wei
- COPm debited: X wei
- Conclusion: [feeCurrency honored | feeCurrency ignored, CELO paid]

## Verdict

[ PASS - Both USDm and COPm work as feeCurrency under tx type 0x04. Track C is unblocked. ]
[ CONDITIONAL - Only USDm (or only COPm) works. Track C proceeds with the working currency only. ]
[ FAIL - Neither works. Track C is descoped from this initiative. ]

## Implications for Track C (per spec gate effect)

[Concrete next steps based on verdict, citing spec section 8 paragraphs that change.]

## Raw output references

- [s1-usdm-output.txt](s1-usdm-output.txt)
- [s1-copm-output.txt](s1-copm-output.txt)
```

Fill in the bracketed values with actual data from Tasks 1-4. No placeholders left.

- [ ] **Step 2: Update the spikes README**

Modify `docs/spikes/README.md` line for S1:

```diff
- | S1 | [`s1-cip64-7702.md`](s1-cip64-7702.md) | pending |
+ | S1 | [`s1-cip64-7702.md`](s1-cip64-7702.md) | [PASS | CONDITIONAL | FAIL] |
```

- [ ] **Step 3: Commit and PR**

Run:

```bash
git add docs/spikes/s1-cip64-7702.md docs/spikes/README.md
git commit -m "docs(spike): record S1 CIP-64 + tx 0x04 verdict"
git push -u origin spike/wri-s1-cip64-7702
gh pr create --base Development --title "spike(S1): CIP-64 + EIP-7702 viability outcome" --body "Outcome document for Spike S1 per spec section 5. Verdict: see [s1-cip64-7702.md](docs/spikes/s1-cip64-7702.md)."
gh pr checks --watch
```

- [ ] **Step 4: If verdict is FAIL, halt and notify user**

If S1 verdict is FAIL, REPORT TO USER:

```
Spike S1 FAILED: Celo does not accept tx type 0x04 with CIP-64 feeCurrency.
Track C (EIP-7702 migration) is non-viable for users who do not hold CELO.
Per spec gate effect: Track C is descoped from this initiative.
Options to discuss: (a) wait for Celo upstream support, (b) accept CELO-paid gas for power users only, (c) cancel Track C entirely.
```

Stop. Do not proceed with S3 spike-wallet on-chain test (S3 falls back to docs/outreach only).

---

## Task 6 (S2): ethers v5 transitive dep audit

**Files:**

- Create: `docs/spikes/s2-ethers-v5-deps.md`
- Create: `docs/spikes/s2-ethers-tree.txt` (raw `yarn why` output)

- [ ] **Step 1: Capture the full dep tree for ethers**

Run:

```bash
git checkout Development
git pull
git checkout -b spike/wri-s2-ethers-v5-deps
yarn why ethers 2>&1 | tee docs/spikes/s2-ethers-tree.txt
```

Expected: full tree with `ethers@5.7.2` and every dependent listed.

- [ ] **Step 2: Capture knip dead-code report scoped to dependencies**

Run:

```bash
yarn knip --no-gitignore --include dependencies 2>&1 | tee docs/spikes/s2-knip-deps.txt
```

Expected: list of potentially unused dependencies. ethers may or may not appear (it's used in `src/`).

- [ ] **Step 3: Identify direct uses in `src/`**

Run:

```bash
grep -rn "from 'ethers'\|from \"ethers\"\|require('ethers')\|require(\"ethers\")" src/ \
  > docs/spikes/s2-ethers-direct-uses.txt
wc -l docs/spikes/s2-ethers-direct-uses.txt
```

Expected: list of files importing ethers. Number is the count of direct call sites to migrate.

- [ ] **Step 4: For each top-level dep that pulls ethers, document upgrade path**

Identify the unique top-level dependents from `docs/spikes/s2-ethers-tree.txt`. For each, look up the latest version on npm and whether it has dropped ethers v5.

Write `docs/spikes/s2-ethers-v5-deps.md`:

```markdown
# S2: ethers v5 transitive dependency audit

**Status:** [PASS | CONDITIONAL]
**Date:** YYYY-MM-DD
**Branch:** spike/wri-s2-ethers-v5-deps

## Direct usage in `src/`

[paste output of grep, count of call sites]

## Top-level dependencies that pull ethers v5

| Dep                          | Current version | Latest version | Ethers requirement in latest | Upgrade verdict         |
| ---------------------------- | --------------- | -------------- | ---------------------------- | ----------------------- |
| @fiatconnect/fiatconnect-sdk | 0.5.62          | [check npm]    | [v5 / v6 / dropped]          | [upgrade / pin / block] |
| @walletconnect/sign-client   | 2.19.0          | [check npm]    | [v5 / v6 / dropped]          | [upgrade / pin / block] |
| @walletconnect/core          | 2.21.4          | [check npm]    | [v5 / v6 / dropped]          | [upgrade / pin / block] |
| @reown/walletkit             | 1.2.1           | [check npm]    | [v5 / v6 / dropped]          | [upgrade / pin / block] |
| react-native-persona         | 2.2.23          | [check npm]    | [v5 / v6 / dropped]          | [upgrade / pin / block] |
| [add other rows as found]    |                 |                |                              |                         |

## Verdict

[PASS — all transitive dependents have an upgrade path away from ethers v5. Track D migrates direct uses AND upgrades dependents.]

[CONDITIONAL — some deps have no upgrade path. Track D migrates direct uses but ethers v5 stays as transitive. The package.json removal is descoped. Specific blockers listed.]

## Implications for Track D

[Concrete adjustments to spec section 9.2 ethers v5 removal scope.]

## Raw output

- [s2-ethers-tree.txt](s2-ethers-tree.txt)
- [s2-knip-deps.txt](s2-knip-deps.txt)
- [s2-ethers-direct-uses.txt](s2-ethers-direct-uses.txt)
```

Fill in actual rows. Verify each via `npm view <pkg> peerDependencies` and `npm view <pkg> dependencies`.

- [ ] **Step 5: Commit and PR**

Run:

```bash
git add docs/spikes/s2-*
git commit -m "docs(spike): record S2 ethers v5 dep audit verdict"
git push -u origin spike/wri-s2-ethers-v5-deps
gh pr create --base Development --title "spike(S2): ethers v5 transitive deps audit outcome" --body "Outcome document for Spike S2 per spec section 5."
gh pr checks --watch
```

---

## Task 7 (S3): Squid IntegratorId behavior under EIP-7702

**Files:**

- Create: `docs/spikes/s3-squid-attribution.md`
- Create: `docs/spikes/s3-squid-discord-draft.md`

- [ ] **Step 1: Re-read Squid public docs for IntegratorId mechanics**

Run:

```bash
git checkout Development
git pull
git checkout -b spike/wri-s3-squid-attribution
mkdir -p docs/spikes
curl -s https://docs.squidrouter.com/llms-full.txt -o docs/spikes/s3-squid-docs.txt
grep -in "integrator\|attribut\|tx.origin\|msg.sender" docs/spikes/s3-squid-docs.txt | tee docs/spikes/s3-squid-docs-greps.txt
```

Expected: any mention of how IntegratorId is parsed. If silent on `tx.origin` vs `msg.sender`, escalate to outreach (next step).

- [ ] **Step 2: Draft a Discord message to Squid team**

Write `docs/spikes/s3-squid-discord-draft.md`:

```markdown
# Discord outreach draft to Squid team

**Channel:** #integrator-support (or equivalent on Squid Discord)

**Message:**

Hi team! Quick question for the TuCop Finance integration (IntegratorId: [TUCOP_INTEGRATOR_ID_FROM_STATSIG_CONFIG]).

We are evaluating EIP-7702 to batch multiple Squid swaps in a single transaction. Under 7702, the user's EOA temporarily delegates execution to a contract (`BatchExecutor`), so the `msg.sender` your router sees from inside the swap call is still the EOA, but the outer transaction shape is different (tx type 0x04, authorization list, etc).

Two questions:

1. Is IntegratorId attribution parsed strictly from the calldata's IntegratorId field, or does any part of attribution depend on `tx.origin` vs `msg.sender` semantics?
2. Are there known issues or caveats with EIP-7702 / batched call patterns interacting with your router or aggregation logic on Celo?

We have a low-stakes mainnet test wallet ready to run a real integration test if useful. Happy to share traces.

Thanks!
[name]
```

- [ ] **Step 3: Send the Discord message (manual step — user action)**

REPORT TO USER:

```
Drafted Discord message for Squid team at docs/spikes/s3-squid-discord-draft.md.
Action required: please send this message in the Squid Discord and reply here with their response.
If no response within 3 business days, S3 falls back to the on-chain test (Step 4).
```

Wait for user response.

- [ ] **Step 4: If Squid response is clear (PASS or FAIL), document and skip Step 5-6**

If user reports "Squid confirmed IntegratorId is calldata-only, 7702 OK", set verdict to PASS, fill outcome doc, commit.

If user reports "Squid confirmed attribution requires direct EOA->Router", set verdict to FAIL, fill outcome doc, commit.

If unclear / no response after 3 days, proceed to Step 5 (on-chain test).

- [ ] **Step 5: On-chain test — one real Squid quote via BatchExecutor**

ONLY RUN IF S1 PASSED. If S1 failed, skip this and mark S3 verdict as UNKNOWN with Squid's documented behavior as the best-available info.

Write `contracts-spike/scripts/s3-squid-via-batch.ts`:

```ts
import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi } from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const SPIKE_WALLET = readFileSync(`${homedir()}/.tucop-spike-wallet.txt`, 'utf8').trim()
const BATCH_EXECUTOR = process.argv[2]
const account = mnemonicToAccount(SPIKE_WALLET)

const publicClient = createPublicClient({ chain: celo, transport: http() })
const walletClient = createWalletClient({ account, chain: celo, transport: http() })

// Fetch a real quote from Valora backend (which proxies Squid)
const quoteRes = await fetch(
  `https://api.mainnet.valora.xyz/getSwapQuote?` +
    new URLSearchParams({
      sellToken: '0x765DE816845861e75A25fCA122bb6898B8B1282a', // USDm
      buyToken: '0x8a567e2ae79ca692bd748ab832081c45de4041ea', // COPm
      sellAmount: '1000000000000000000', // 1 USDm
      sellNetworkId: 'celo-mainnet',
      buyNetworkId: 'celo-mainnet',
      sellIsNative: 'false',
      buyIsNative: 'false',
      userAddress: account.address,
      slippagePercentage: '0.5',
    }).toString()
)
const quote = await quoteRes.json()
console.log('Squid provider:', quote.details?.swapProvider)
console.log('AllowanceTarget:', quote.unvalidatedSwapTransaction?.allowanceTarget)

const tx = quote.unvalidatedSwapTransaction
const approveAbi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])

const authorization = await walletClient.signAuthorization({
  account,
  contractAddress: BATCH_EXECUTOR as `0x${string}`,
})

const calls = [
  {
    target: tx.sellTokenAddress as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: approveAbi,
      functionName: 'approve',
      args: [tx.allowanceTarget as `0x${string}`, BigInt(tx.sellAmount)],
    }),
  },
  {
    target: tx.to as `0x${string}`,
    value: BigInt(tx.value || 0),
    data: tx.data as `0x${string}`,
  },
]

const calldata = encodeFunctionData({
  abi: parseAbi(['function execute((address target, uint256 value, bytes data)[] calls)']),
  functionName: 'execute',
  args: [calls],
})

const hash = await walletClient.sendTransaction({
  account,
  to: account.address,
  data: calldata,
  authorizationList: [authorization],
  // @ts-expect-error Celo feeCurrency
  feeCurrency: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
})

console.log('Submitted swap via 7702:', hash)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
console.log('Receipt status:', receipt.status)
console.log('Logs:', receipt.logs.length)
console.log('NEXT: check Squid dashboard for attribution to integrator ID.')
```

Run:

```bash
cd contracts-spike
BATCH_EXEC="$(grep 'S1 BatchExecutor' ../docs/spikes/wallet.txt | awk '{print $NF}')"
yarn add tsx
npx tsx scripts/s3-squid-via-batch.ts "$BATCH_EXEC" 2>&1 | tee ../docs/spikes/s3-onchain-output.txt
cd ..
```

- [ ] **Step 6: After 24 hours, check Squid dashboard for attribution**

REPORT TO USER:

```
On-chain test submitted: tx hash 0x[FULL_HASH] from s3-onchain-output.txt.
Squid analytics typically update within 24 hours.
Please check the Squid integrator dashboard for IntegratorId attribution
on this tx and reply with the result.
```

Wait for user response. Set verdict based on result.

- [ ] **Step 7: Write the S3 outcome document**

Write `docs/spikes/s3-squid-attribution.md` similar structure to S1's outcome:

```markdown
# S3: Squid IntegratorId behavior under EIP-7702

**Status:** [PASS | FAIL | CONDITIONAL | UNKNOWN]
**Date:** YYYY-MM-DD
**Branch:** spike/wri-s3-squid-attribution

## Question

Does Squid attribution preserve IntegratorId when swap is called via an EIP-7702 BatchExecutor delegation pattern (msg.sender = EOA, tx structure = type 0x04)?

## Method

[Reference docs review, Discord outreach, optional on-chain test as applicable.]

## Results

### Doc review

[Findings from grep on llms-full.txt]

### Discord outreach

[Response from Squid team, with date and quote.]

### On-chain test (if run)

- Tx hash: 0x[FULL_HASH]
- Dashboard check (24h later): [attribution intact | attribution missing | dashboard ambiguous]

## Verdict

[Final assessment per pass/fail criteria.]

## Implications for Track C

[Concrete adjustments to spec section 8.]
```

- [ ] **Step 8: Commit and PR**

Run:

```bash
git add docs/spikes/s3-*
git commit -m "docs(spike): record S3 Squid attribution under 7702 verdict"
git push -u origin spike/wri-s3-squid-attribution
gh pr create --base Development --title "spike(S3): Squid IntegratorId under EIP-7702 outcome"
gh pr checks --watch
```

---

## Task 8 (S4): Self-audit protocol for BatchExecutor

**Files:**

- Create: `docs/spikes/s4-self-audit-protocol.md`
- Create: `contracts-spike/src/BatchExecutorV2.sol` (production candidate, draft)
- Create: `contracts-spike/test/BatchExecutorV2.invariant.t.sol`

- [ ] **Step 1: Draft a production-candidate BatchExecutor with safety primitives**

Run:

```bash
git checkout Development
git pull
git checkout -b spike/wri-s4-self-audit-protocol
cd contracts-spike
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

Write `contracts-spike/src/BatchExecutorV2.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "openzeppelin-contracts/security/ReentrancyGuard.sol";
import {Address} from "openzeppelin-contracts/utils/Address.sol";

/// @title BatchExecutor V2 — production candidate for EIP-7702 delegation
/// @notice When delegated to via EIP-7702, this contract runs in the context
///         of the user's EOA. msg.sender == user's EOA throughout inner calls.
contract BatchExecutorV2 is ReentrancyGuard {
    using Address for address;

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error CallFailed(uint256 index, bytes reason);
    error EmptyBatch();
    error OnlySelfDelegated();

    /// @dev Only callable by the delegated EOA itself.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelfDelegated();
        _;
    }

    /// @notice Execute a batch of calls atomically.
    /// @dev Reentrancy-guarded. Callable only by self (the delegated EOA).
    function execute(Call[] calldata calls) external payable nonReentrant onlySelf {
        uint256 len = calls.length;
        if (len == 0) revert EmptyBatch();
        for (uint256 i = 0; i < len; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }
}
```

- [ ] **Step 2: Write Foundry invariant tests**

Write `contracts-spike/test/BatchExecutorV2.invariant.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BatchExecutorV2} from "../src/BatchExecutorV2.sol";

contract BatchExecutorV2InvariantTest is Test {
    BatchExecutorV2 exec;

    function setUp() public {
        exec = new BatchExecutorV2();
        targetContract(address(exec));
    }

    /// @dev Contract balance must remain zero between external calls
    function invariant_contractHoldsNoBalance() public view {
        assertEq(address(exec).balance, 0);
    }
}
```

- [ ] **Step 3: Run invariant tests with 50k runs**

Update `contracts-spike/foundry.toml` to set invariant config:

```toml
[invariant]
runs = 50000
depth = 100
fail_on_revert = false
```

Run:

```bash
forge test --match-contract BatchExecutorV2InvariantTest -vvv
```

Expected: invariant holds across 50k runs.

- [ ] **Step 4: Run Slither static analysis**

Install Slither if missing: `pip install slither-analyzer`.

Run:

```bash
slither src/BatchExecutorV2.sol --solc-remaps "openzeppelin-contracts/=lib/openzeppelin-contracts/contracts/" --filter-paths lib 2>&1 | tee ../docs/spikes/s4-slither-output.txt
```

Expected: zero issues at high or medium severity.

- [ ] **Step 5: Document the audit checklist**

Write `docs/spikes/s4-self-audit-protocol.md`:

```markdown
# S4: Self-audit protocol for BatchExecutor.sol

**Status:** APPROVED [pending user confirmation]
**Date:** YYYY-MM-DD
**Branch:** spike/wri-s4-self-audit-protocol

## Contract under audit

[`contracts-spike/src/BatchExecutorV2.sol`](../../contracts-spike/src/BatchExecutorV2.sol) — final version (or path to wherever Track C lands).

## Invariants

1. **Self-call only**: `execute()` reverts unless `msg.sender == address(this)`. Enforced by `onlySelf` modifier. Under EIP-7702 delegation, msg.sender inside `execute` is the delegated EOA (== address(this)).
2. **No held balance**: contract holds no balance between external entry points. Verified by `invariant_contractHoldsNoBalance` over 50k runs.
3. **Reentrancy safe**: `nonReentrant` on `execute`. Inner calls cannot re-enter `execute`.
4. **Atomic batch**: any inner call failure reverts the entire batch (no partial state).
5. **No delegatecall surface**: all inner calls use `call`, not `delegatecall`. No way for an inner call to overwrite contract state.

## Audit checklist (run before mainnet flag flip)

- [ ] Foundry invariant tests: minimum 50k runs, depth 100. Output: [s4-invariant-output.txt](s4-invariant-output.txt).
- [ ] Slither: zero high/medium severity. Output: [s4-slither-output.txt](s4-slither-output.txt).
- [ ] Mythril symbolic execution on `execute()`. Output: [s4-mythril-output.txt](s4-mythril-output.txt).
- [ ] Fork test against Celo mainnet state, 100 randomized batches. Test file: `contracts-spike/test/BatchExecutorV2.fork.t.sol`.
- [ ] Differential test: batched vs. sequential equivalence for the same input set. Test file: `contracts-spike/test/BatchExecutorV2.differential.t.sol`.
- [ ] Manual review by two reviewers using SWC registry checklist (SWC-107 reentrancy, SWC-101 overflow, SWC-105 unprotected ether withdrawal, SWC-114 transaction order dependence, SWC-116 timestamp dependence). Sign-off file: [s4-manual-review-signoff.md](s4-manual-review-signoff.md).
- [ ] Internal team dogfood on Celo mainnet for 30 days with small personal funds before public flag flip.

## Rollback / recovery plan

If a bug is discovered post-deployment with users delegated to this contract:

1. **Detect**: anomaly in dollarsSpend Sentry metrics (success rate drop, stuck-delegation reports).
2. **Kill switch**: flip Statsig flag `wri_dollars_spend_7702_v1` to false. The app falls back to the sequential code path immediately.
3. **Revoke**: in the next dollarsSpend flow, the app signs an authorization with `contractAddress = 0x0...0` to clear the delegation atomically. This requires a small mainnet helper script `scripts/revoke-7702-delegation.ts` (delivered with Track C).
4. **Communicate**: in-app banner explaining the issue, link to support.

## Verdict

[ APPROVED — protocol is sufficient given no external audit. Track C may proceed once this checklist is run for the production contract. ]
[ NEEDS REVISION — protocol gaps identified, see comments. ]

## Implications for Track C

- The production `BatchExecutor.sol` lands in `src/contracts/` (new) or stays in `contracts-spike/` until graduation.
- The Track C plan must include each checklist item as a task.
```

- [ ] **Step 6: Notify user for protocol approval**

REPORT TO USER:

```
S4 protocol drafted: docs/spikes/s4-self-audit-protocol.md.
This is the checklist we will follow before deploying BatchExecutor with user funds, given no external audit budget.
Please review the invariants, checklist, and rollback plan, and reply "APPROVED" or list any items to adjust.
```

Wait for user approval before merging.

- [ ] **Step 7: Commit, PR, await approval, merge**

Run:

```bash
git add docs/spikes/s4-* contracts-spike/src/BatchExecutorV2.sol contracts-spike/test/BatchExecutorV2.invariant.t.sol contracts-spike/foundry.toml
git commit -m "docs(spike): record S4 self-audit protocol for BatchExecutor"
git push -u origin spike/wri-s4-self-audit-protocol
gh pr create --base Development --title "spike(S4): BatchExecutor self-audit protocol outcome"
gh pr checks --watch
```

Per locked decision rule, do NOT auto-merge until user reports APPROVED in Step 6.

---

## Task 9 (S5): useTransactionInFlight API via 3 throwaway prototypes

**Files:**

- Create: `src/lib/useTransactionInFlight/useTransactionInFlight.ts` (prototype, not merged to main)
- Create: `src/lib/useTransactionInFlight/types.ts`
- Modify: `src/swap/SwapScreen.tsx` (prototype usage, not merged)
- Modify: `src/dollarsSpend/saga.ts` (prototype usage, not merged)
- Modify: `src/buckspay/saga.ts` (prototype usage, not merged)
- Create: `docs/spikes/s5-tx-in-flight-api.md`

> **Important:** This spike is exploratory. The branch `spike/wri-s5-tx-in-flight` is NOT merged to `Development`. Only the outcome doc `s5-tx-in-flight-api.md` is merged (in a separate small PR).

- [ ] **Step 1: Create spike branch off Development**

Run:

```bash
git checkout Development && git pull
git checkout -b spike/wri-s5-tx-in-flight
mkdir -p src/lib/useTransactionInFlight
```

- [ ] **Step 2: Draft v1 of the hook (skeleton API)**

Write `src/lib/useTransactionInFlight/types.ts`:

```ts
import type { NetworkId } from 'src/transactions/types'
import type { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

export type InFlightStatus =
  | 'idle'
  | 'preparing'
  | 'awaiting-pin'
  | 'submitting'
  | 'pending-confirmation'
  | 'progress' // multi-step only
  | 'succeeded'
  | 'partial-failure' // multi-step only
  | 'failed'

export interface InFlightDescriptor {
  flowId: string
  flowKind:
    | 'swap'
    | 'dollarsSpend'
    | 'send'
    | 'buckspay'
    | 'earn'
    | 'gold'
    | 'jumpstart'
    | 'subsidy'
  steps: number // 1 for single-step flows
  currentStep: number // 0-indexed
  status: InFlightStatus
  preparedTransactions: SerializableTransactionRequest[]
  networkId: NetworkId
  lastErrorClass?: ErrorClass
  retryCount: number
  startedAt: number
}

export interface ErrorClass {
  kind:
    | 'gas-insufficient'
    | 'slippage'
    | 'revert'
    | 'rpc-timeout'
    | 'user-rejected'
    | 'connectivity'
    | 'app-backgrounded'
    | 'unknown'
  message: string
  retryable: boolean
}
```

- [ ] **Step 3: Draft useTransactionInFlight v1 hook**

Write `src/lib/useTransactionInFlight/useTransactionInFlight.ts`:

```ts
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'src/redux/hooks'
import type { InFlightDescriptor, InFlightStatus } from './types'

export interface UseTransactionInFlightArgs {
  flowKind: InFlightDescriptor['flowKind']
}

export interface UseTransactionInFlightResult {
  current: InFlightDescriptor | null
  start: (
    steps: InFlightDescriptor['steps'],
    descriptor: Omit<
      InFlightDescriptor,
      'flowId' | 'currentStep' | 'status' | 'retryCount' | 'startedAt'
    >
  ) => string
  advance: (flowId: string, toStatus: InFlightStatus, patch?: Partial<InFlightDescriptor>) => void
  retry: (flowId: string) => void
  abort: (flowId: string) => void
}

export function useTransactionInFlight(
  _args: UseTransactionInFlightArgs
): UseTransactionInFlightResult {
  // v1 SKELETON — implementation to evolve across the 3 integrations.
  const dispatch = useDispatch()
  const current = useSelector((_state) => null as InFlightDescriptor | null)
  const start = useCallback(() => 'flow-id-placeholder', [])
  const advance = useCallback(() => undefined, [])
  const retry = useCallback(() => undefined, [])
  const abort = useCallback(() => undefined, [])
  return { current, start, advance, retry, abort }
}
```

- [ ] **Step 4: Prototype integration A — SwapScreen**

Open `src/swap/SwapScreen.tsx`. Locate the `handleConfirmSwap` (or equivalent) handler. Replace its inline swap-dispatch logic with a call into `useTransactionInFlight`. Capture: what extra params did the swap flow need that aren't in the v1 hook?

Note observed gaps in a scratch file `docs/spikes/s5-gaps-swap.txt`:

```text
GAP A1: swap needs slippage param to retry — extend descriptor
GAP A2: swap needs quote-refresh hook — extend retry to accept fresh quote callback
GAP A3: ...
```

- [ ] **Step 5: Update hook to v2 — incorporate Swap gaps**

Refactor `src/lib/useTransactionInFlight/useTransactionInFlight.ts` to address gaps A1, A2, A3. Re-run the SwapScreen integration to verify it now compiles cleanly.

- [ ] **Step 6: Prototype integration B — dollarsSpend saga**

Open `src/dollarsSpend/saga.ts`. Refactor `executeMultiSwapSaga` to use the hook via dispatched actions (since sagas don't use hooks directly, the hook's underlying actions must be available as saga puts).

This step reveals whether the hook can be expressed as Redux actions cleanly. Capture gaps in `docs/spikes/s5-gaps-dollarsSpend.txt`.

- [ ] **Step 7: Update hook to v3 — incorporate dollarsSpend gaps**

Add multi-step support (`currentStep`, `steps`, `partial-failure` status). Re-run dollarsSpend integration.

- [ ] **Step 8: Prototype integration C — buckspay saga**

Open `src/buckspay/saga.ts`. buckspay polls a webhook status for 24h. Refactor to use the hook with an extended `pending-confirmation` status that accepts a custom poll function.

Capture gaps in `docs/spikes/s5-gaps-buckspay.txt`.

- [ ] **Step 9: Update hook to v4 — final API with two pre-agreed extension points**

The two extension points per spec section 5.S5 pass criteria:

1. `customPoll`: callback for `pending-confirmation` status (used by buckspay).
2. `retryClassifier`: function `(error) => ErrorClass` for feature-specific error classification.

Verify all three prototypes compile against v4 of the hook with NO further hook changes needed.

- [ ] **Step 10: Document final API in outcome doc**

Write `docs/spikes/s5-tx-in-flight-api.md`:

````markdown
# S5: useTransactionInFlight final API

**Status:** [APPROVED | NEEDS REVISION]
**Date:** YYYY-MM-DD
**Branch:** spike/wri-s5-tx-in-flight (NOT merged; throwaway)

## Final TypeScript signatures

```ts
// src/lib/useTransactionInFlight/types.ts (final shape)
[paste actual types from v4]

// src/lib/useTransactionInFlight/useTransactionInFlight.ts (final shape)
[paste actual hook signature from v4]
```
````

## Extension points

1. **`customPoll`**: passed at hook init, called when status enters `pending-confirmation`. Returns final status or null to keep polling.
2. **`retryClassifier`**: passed at hook init, called when a tx fails. Returns ErrorClass.

## Integration evidence

- Swap: see `src/swap/SwapScreen.tsx` diff on this branch. Lines reduced from X to Y.
- DollarsSpend: see `src/dollarsSpend/saga.ts` diff. Saga shrinks from X to Y lines, partial-failure handling moves into hook.
- Buckspay: see `src/buckspay/saga.ts` diff. Webhook polling moves to `customPoll`.

## Gaps captured during prototyping

- [s5-gaps-swap.txt](s5-gaps-swap.txt)
- [s5-gaps-dollarsSpend.txt](s5-gaps-dollarsSpend.txt)
- [s5-gaps-buckspay.txt](s5-gaps-buckspay.txt)

## Verdict

[APPROVED — the v4 API satisfies all three integration cases. Track A may proceed with the spec section 6.1.4 design updated to match these signatures.]

## Implications for Track A

- Update spec section 6.1.4 with the final type signatures.
- Track A's `useTransactionInFlight` PR uses this branch's hook as a starting point (cherry-picked, then refined for production quality: tests, documentation, edge cases).

````

- [ ] **Step 11: Update spec section 6.1.4 with final API**

Modify `docs/specs/2026-06-15-wallet-robustness-initiative-design.md` section 6.1.4 to replace the placeholder API skeleton with the final S5-validated signatures.

- [ ] **Step 12: Stash the prototype branch, merge ONLY the outcome doc**

Run:
```bash
git checkout Development
git checkout -b spike/wri-s5-tx-in-flight-outcome
# Cherry-pick ONLY the docs/spikes/s5-* files
git checkout spike/wri-s5-tx-in-flight -- docs/spikes/s5-*
git add docs/spikes/s5-*
git commit -m "docs(spike): record S5 useTransactionInFlight final API"
# Also merge the spec section 6.1.4 update
git checkout spike/wri-s5-tx-in-flight -- docs/specs/2026-06-15-wallet-robustness-initiative-design.md
git add docs/specs/2026-06-15-wallet-robustness-initiative-design.md
git commit -m "docs(spec): update useTransactionInFlight API per S5 outcome"
git push -u origin spike/wri-s5-tx-in-flight-outcome
gh pr create --base Development --title "spike(S5): useTransactionInFlight final API outcome"
gh pr checks --watch
````

The prototype branch `spike/wri-s5-tx-in-flight` stays as a reference but is NOT merged.

---

## Task 10: Sprint 0 closure — final report and gate decisions

**Files:**

- Create: `docs/spikes/sprint-0-summary.md`
- Modify: `docs/spikes/README.md` (final status table)

- [ ] **Step 1: Aggregate all 5 spike verdicts**

Read each `s1-*.md` through `s5-*.md` outcome doc on `Development` (now merged). Collect verdicts.

- [ ] **Step 2: Write Sprint 0 summary**

Write `docs/spikes/sprint-0-summary.md`:

```markdown
# Sprint 0 Summary — Gate Decisions for the WRI

**Date:** YYYY-MM-DD

## Verdicts

| Spike                          | Verdict                     | Source                                                 |
| ------------------------------ | --------------------------- | ------------------------------------------------------ |
| S1: CIP-64 + tx 0x04           | [PASS / CONDITIONAL / FAIL] | [s1-cip64-7702.md](s1-cip64-7702.md)                   |
| S2: ethers v5 deps             | [PASS / CONDITIONAL]        | [s2-ethers-v5-deps.md](s2-ethers-v5-deps.md)           |
| S3: Squid attribution          | [PASS / FAIL / UNKNOWN]     | [s3-squid-attribution.md](s3-squid-attribution.md)     |
| S4: Self-audit protocol        | [APPROVED / NEEDS REVISION] | [s4-self-audit-protocol.md](s4-self-audit-protocol.md) |
| S5: useTransactionInFlight API | [APPROVED]                  | [s5-tx-in-flight-api.md](s5-tx-in-flight-api.md)       |

## Gate decisions

- Track A: [PROCEED with API from S5]
- Track B: [PROCEED — no Sprint 0 dependency]
- Track C: [PROCEED / DESCOPE / PARTIAL] — driven by S1 + S3 + S4 verdicts.
- Track D: [PROCEED, scope is X items] — driven by S2.

## Next step

Write the per-track plans:

- Plan 01: Track A — Foundations
- Plan 02: Track B — Critical Fixes
- Plan 03: Track C — EIP-7702 Migration (if PROCEED or PARTIAL)
- Plan 04: Track D — Stack Hygiene + Sepolia Removal + Valora Acceleration
```

- [ ] **Step 3: Update spikes README final status**

Modify `docs/spikes/README.md`:

```diff
- | S1 | [`s1-cip64-7702.md`](s1-cip64-7702.md) | pending |
+ | S1 | [`s1-cip64-7702.md`](s1-cip64-7702.md) | [verdict] |
[etc for S2-S5]
```

- [ ] **Step 4: Notify user and request approval to proceed with per-track plans**

REPORT TO USER:

```
Sprint 0 complete. Summary at docs/spikes/sprint-0-summary.md.

Verdicts:
- S1: [PASS/FAIL]
- S2: [PASS/CONDITIONAL]
- S3: [PASS/FAIL/UNKNOWN]
- S4: APPROVED
- S5: APPROVED

Per the gate decisions:
- Track C status: [PROCEED/DESCOPE/PARTIAL]
- Track D scope: [items confirmed]

Authorize me to write Plans 01-04 (Tracks A-D)?
```

Wait for user authorization before invoking writing-plans for the per-track plans.

- [ ] **Step 5: Commit and PR**

Run:

```bash
git checkout Development && git pull
git checkout -b spike/wri-sprint-0-summary
git add docs/spikes/sprint-0-summary.md docs/spikes/README.md
git commit -m "docs(spike): record Sprint 0 summary and gate decisions"
git push -u origin spike/wri-sprint-0-summary
gh pr create --base Development --title "spike: Sprint 0 summary and gate decisions"
gh pr checks --watch
```

---

## Self-Review

### Spec coverage check

| Spec section                      | Plan task | Notes                                                 |
| --------------------------------- | --------- | ----------------------------------------------------- |
| 5.S1 (CIP-64 + 0x04 viability)    | Tasks 1-5 | Wallet, contract, deploy, run, document.              |
| 5.S2 (ethers v5 deps)             | Task 6    | Single task, no on-chain.                             |
| 5.S3 (Squid IntegratorId)         | Task 7    | Docs + outreach + optional on-chain.                  |
| 5.S4 (self-audit protocol)        | Task 8    | Contract draft, invariants, checklist, rollback plan. |
| 5.S5 (useTransactionInFlight API) | Task 9    | 3 prototypes, evolving hook.                          |
| Sprint 0 gate decisions           | Task 10   | Aggregation.                                          |

### Placeholder scan

Scanned plan for TBD/TODO/FIXME — none in steps. Bracketed `[FULL_ADDRESS]`, `[verdict]`, `[PASS/FAIL]` etc. are intentional template placeholders that the implementing agent fills in with actual results.

### Type consistency

`InFlightDescriptor`, `InFlightStatus`, `ErrorClass` defined consistently in Task 9 Step 2 and referenced in Step 3. No drift.

Hook method names consistent: `start`, `advance`, `retry`, `abort`. Used same in all 3 prototype integrations.

### Open concerns

- viem 2.24.1 supports EIP-7702 since 2.21.x per release notes. Confirm at S1 Task 4 Step 2 if `signAuthorization` is available; if not, bump viem in `contracts-spike/package.json` to 2.21+.
- The S1 Task 4 script casts `feeCurrency` via `@ts-expect-error`. viem may have proper Celo chain types; check viem celo extension first. Acceptable workaround for the spike either way.
