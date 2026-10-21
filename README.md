# Demo-first Escrow

**by Swift Bot Labs**

**Live app:** https://demo-first-escrow.netlify.app (Arc **mainnet** by default, Arc Testnet selectable in the header; no wallet needed to browse escrows). Mirror built from this repo by GitHub Actions: https://swiftbotlab.github.io/demo-first-escrow/

Escrow links name their network, e.g. [`#mainnet/escrow/2`](https://demo-first-escrow.netlify.app/#mainnet/escrow/2) or `#testnet/escrow/2`, so a shared link always opens the escrow it was copied from.

Swift Bot Labs builds custom bots and automations for businesses. Every engagement starts with a working demo: the client sees the bot running before any money changes hands. This contract puts that promise on-chain. The client locks USDC in escrow before the project begins. The builder delivers a link to the live demo and records its hash on-chain. The client reviews and releases. If the builder misses the deadline, the client gets a full refund. If the client goes silent after delivery, the builder can claim automatically once the review window closes.

---

## How it works

### Flow

```
Client                    Contract                  Builder
  |                          |                          |
  |-- createEscrow(value) -->|                          |
  |                          |-- status: Funded         |
  |                          |<------- deliver() -------|
  |                          |-- status: Delivered      |
  |-- release() ------------>|                          |
  |  (or claim() by anyone   |-- status: Released       |
  |   after review window)   |-- pendingWithdrawals[builder] += amount
  |                          |<------- withdraw() ------|
```

The builder can walk away at any time before release by calling `cancel()`, which refunds the client. During the review window the client can call `requestChanges()`: the escrow goes back to Funded and the delivery deadline moves to at least one review period from now. In this version (v1) the client picks the review period (minimum 60 s) and there is no cap on change requests; see Limitations. Version 2, in progress, caps change requests at two, gives the builder at least one day per fix, and lets the client turn down the final delivery.

### State table

| Status | Value | Meaning |
|---|---|---|
| None | 0 | ID does not exist |
| Funded | 1 | Client has locked USDC; waiting for delivery |
| Delivered | 2 | Builder has submitted a demo URI and hash |
| Released | 3 | Payment credited to builder's withdrawal balance |
| Refunded | 4 | Amount credited to client's withdrawal balance |

### Functions

| Function | Who can call | When | What happens |
|---|---|---|---|
| `createEscrow(builder, deliverBy, reviewPeriod, title)` | Anyone (becomes client) | Any time | Locks `msg.value` USDC; status → Funded |
| `deliver(id, uri, hash)` | Builder | Status = Funded, before `deliverBy` | Records demo URI + hash; status → Delivered |
| `requestChanges(id, note)` | Client | Status = Delivered, within review window | Resets delivery; extends `deliverBy`; status → Funded |
| `release(id)` | Client | Status = Funded or Delivered | Credits amount to builder; status → Released |
| `refund(id)` | Client | Status = Funded, after `deliverBy` | Credits amount to client; status → Refunded |
| `claim(id)` | Anyone | Status = Delivered, after review window | Credits amount to builder; status → Released |
| `cancel(id)` | Builder | Status = Funded or Delivered | Credits amount to client; status → Refunded |
| `withdraw()` | Anyone with a pending balance | Any time | Transfers pending balance to caller |

**Parameters:** `deliverBy` is a Unix timestamp (seconds). `reviewPeriod` is in seconds; minimum 60 s, maximum 30 days. `title` is 1–120 bytes. `uri` is 1–300 bytes. `note` (requestChanges) is 0–300 bytes.

---

## Why pull payments

On Arc, a native USDC transfer using `.call{value: amount}("")` can revert. An address on a blocklist or a precompile address will reject the transfer, and a hard-required push payout would permanently lock the escrow. To avoid this, settlement only credits a balance in `pendingWithdrawals[recipient]`. The actual native transfer happens in `withdraw()`, called at the recipient's discretion. If `withdraw()` reverts, the balance simply stays credited to the recipient and they can retry later; no escrow is stuck and no other escrow is affected.

---

## Arc specifics

**Native USDC and decimals.** On Arc, USDC is the native gas token. Amounts sent as `msg.value` have 18 decimals. The contract stores and operates on these 18-decimal amounts exclusively. A separate ERC-20 interface for USDC exists at `0x3600000000000000000000000000000000000000` with 6 decimals, but the escrow contract never calls it. The frontend uses `parseEther` / `formatEther` (18 decimals) throughout.

**Transaction fees.** Arc enforces a `maxFeePerGas` floor of 20 gwei. Transactions submitted below this floor are rejected.

**Log range limit.** `eth_getLogs` on Arc accepts ranges below 10,000 blocks per request. The frontend scans event history in 9,000-block chunks, a few in parallel, starting from the contract's deployment block.

**Finality.** Arc produces blocks with sub-second finality. Transaction receipts are typically available within one block.

---

## Deployments

| Chain | Address | Deploy tx |
|---|---|---|
| Arc Testnet | [`0xbb250819e407a108e652cbcf36b45efdd6a3e4c0`](https://explorer.testnet.arc.io/address/0xbb250819e407a108e652cbcf36b45efdd6a3e4c0) | [`0x72bdfc6e…`](https://explorer.testnet.arc.io/tx/0x72bdfc6e2c00e9b5ac5ed975f281a5bb731e8ec631995b719124a44f92039a0a) |
| Arc Mainnet (v1) | [`0x7767a9bafc3ea961d0edf97a8aa69a7d5e38dae5`](https://explorer.arc.io/address/0x7767a9bafc3ea961d0edf97a8aa69a7d5e38dae5) | [`0xde33dbfb…`](https://explorer.arc.io/tx/0xde33dbfb014e0b8475c672fbd42bc11e3f6c1155a7d19f455fd94dc9fc2a31ec) |

Both contracts are source-verified on the explorers (Blockscout): solc 0.8.28, optimizer 200 runs, EVM `paris`. The mainnet bytecode is byte-identical to the Studio-deployed testnet contract (Arc Studio deploys to testnet only).

**First mainnet escrow (#1, 0.20 USDC, our own end-to-end run):** [create](https://explorer.arc.io/tx/0xf979c266b63d443a6837b9b44922ef1174ac4911543a37e2634e00bfceef8211) → [deliver](https://explorer.arc.io/tx/0x0f48bf70c66478fb3024a5e13de44d5b752e4f9f68b2cca2bb414c048d30c0a7) → [release](https://explorer.arc.io/tx/0xc1416d0b36ca7d8dcb3105539a14af5a0b44698bb6641b1ba39b0d76c5baa17a) → [withdraw](https://explorer.arc.io/tx/0xc8952f1b509fcd6ba78a045e4e4aea5afb6352a5b0fa20b38b295fe88682ffa1)

**Mainnet escrow #2 through the live app UI (0.15 USDC, "Demo: landing page fix", 1-day deadline, 1-hour review):** [fund](https://explorer.arc.io/tx/0xfd9161d31b2e345f20f589641d8bd82ee4c5a8f86d9a8ecd03c4c6773986ff39) → [deliver](https://explorer.arc.io/tx/0x72830428398dce2bfb786f45d191a69e0e502816a244a044aeefc2fdae4d9bd4) → [release](https://explorer.arc.io/tx/0x49fd1902b8f1a8e7f2009a87d200b28e5dbefed2ea188473c7430674363c4533) → [withdraw](https://explorer.arc.io/tx/0x3edb2469c221e728aa334dc3bddb14b7eb4b0aaaecda4a122e00a8a8d4d22961) — open it: [`#mainnet/escrow/2`](https://demo-first-escrow.netlify.app/#mainnet/escrow/2)

**Mainnet escrow #3, refund path through the live app UI (0.05 USDC, 10-minute deadline, no delivery):** [fund](https://explorer.arc.io/tx/0xf367575b2a34bf21f571bb3f8152f445d2ada5d27fec40bbf233df0cb047447d) → deadline passes → [refund](https://explorer.arc.io/tx/0x9989b3277989560417c509e8163a42dd91cb79857a9e654c4e768dcbc76b62b1) → [withdraw (client)](https://explorer.arc.io/tx/0x868ddeb5e72022fa7ff53c86027341836fb15b7ac2229516d311608ef70990bc) — open it: [`#mainnet/escrow/3`](https://demo-first-escrow.netlify.app/#mainnet/escrow/3)

---

## Testnet runs

All transactions visible on [explorer.testnet.arc.io](https://explorer.testnet.arc.io).

**Escrow #2 — create → deliver → release → withdraw (builder)**

| Step | Tx hash |
|---|---|
| createEscrow | [0xf9109229…](https://explorer.testnet.arc.io/tx/0xf9109229c861b2f875365c516349c4d87d8631de47ac7f422d558b5e36c82282) |
| deliver | [0xe0ee8c11…](https://explorer.testnet.arc.io/tx/0xe0ee8c11427cab9834e2bc61f97c530fa9aa85240086ad8266368ac5a7deedea) |
| release | [0x5a0dbfd3…](https://explorer.testnet.arc.io/tx/0x5a0dbfd35f29aa1bdb826164791fa212e8909a950e520ff1488773ba91d2a305) |
| withdraw | [0x191a4098…](https://explorer.testnet.arc.io/tx/0x191a4098804265a9978f6ff4ab640dbb7f798d669ca8d5c5f03bee8c98564d3e) |

**Escrow #1 — create → deadline passes → refund → withdraw (client)**

| Step | Tx hash |
|---|---|
| createEscrow | [0x40b20e09…](https://explorer.testnet.arc.io/tx/0x40b20e09e1d41d2e5d4fe82e59387633f46972c7a657d39a0caa069759f0b7db) |
| refund | [0xd8379e65…](https://explorer.testnet.arc.io/tx/0xd8379e65f1b24e91dc87989ef9e1dad74c51eb3384bacd356f40835410a02fcd) |
| withdraw | [0xb95b1fe0…](https://explorer.testnet.arc.io/tx/0xb95b1fe095e4cb7ce262b7ad1187fecb37419b7043f466aa8cdb874ef714a61d) |

**Escrow #3 — create → deliver → client silent → claim → withdraw (builder)**

| Step | Tx hash |
|---|---|
| createEscrow | [0xbd731c72…](https://explorer.testnet.arc.io/tx/0xbd731c7215f9e07c6666c073520ab43fd9e01cf0662804023337b7216db5a530) |
| deliver | [0xf2d3d7c4…](https://explorer.testnet.arc.io/tx/0xf2d3d7c4c0fe4a7c4f74b781fd6adb959cfadee981d0ce9dcbbe044ba03aad33) |
| claim | [0xad60b377…](https://explorer.testnet.arc.io/tx/0xad60b3777368387ace1c37202e4ae277b23257ee00ac0f8efb85ab55eb4d80e8) |
| withdraw | [0xb8781aa5…](https://explorer.testnet.arc.io/tx/0xb8781aa5887d2885387fff092040c3daab4830cc119f8286e9b4f0a5d0dc25b1) |

**Through the live app UI** (same contract; transactions submitted by clicking through the web app with an injected EIP-1193 test wallet holding throwaway testnet keys)

| Escrow | Step | Tx hash |
|---|---|---|
| #4 | createEscrow (1.00 USDC) | [0x9800787b…](https://explorer.testnet.arc.io/tx/0x9800787bab6ec909f509c37dc19e5a8ba4a15ccae85993403377c08e77b0f365) |
| #4 | deliver | [0xec06e1c8…](https://explorer.testnet.arc.io/tx/0xec06e1c801800dd1d673919fff38340ac15190873172d86591dcf6a8d45d9dd8) |
| #4 | release | [0xd8d3c0e1…](https://explorer.testnet.arc.io/tx/0xd8d3c0e1b4db96101a565e1e328a3e9daf555475d3efcf7126191fe4910eedad) |
| #4 | withdraw (builder) | [0xe8d3b3f4…](https://explorer.testnet.arc.io/tx/0xe8d3b3f4c287b2c73a4f4cbec9857ad20e5399cf7006ed8035a765b48f70dbe4) |
| #5 | createEscrow (0.50 USDC) | [0xdf05c948…](https://explorer.testnet.arc.io/tx/0xdf05c94865989495bf8324f8af84bf5dfd737d0929989fc28837c11da1e1da03) |
| #5 | refund after missed deadline | [0xc584db0a…](https://explorer.testnet.arc.io/tx/0xc584db0a2a59fd3f23f1351734bd981b363a34ec2450ac59c8d43ce4051712f5) |
| #5 | withdraw (client) | [0x29be0d5f…](https://explorer.testnet.arc.io/tx/0x29be0d5f0136f45c82582e49e868f71afe3e3ba599e2ad25380fba63342c9db0) |

---

## Tests

The Foundry test suite in `contracts/test/DemoFirstEscrow.t.sol` covers:

- **Happy paths:** create → deliver → release → withdraw; create → miss deadline → refund → withdraw; claim after review window; requestChanges → redeliver → release; builder cancel (funded and delivered states).
- **Revert paths:** all input validation errors (`ZeroValue`, `AmountTooLarge`, `ZeroAddress`, `SelfEscrow`, `InvalidDeadline`, `InvalidReviewPeriod`, `TitleEmpty`, `TitleTooLong`, `URIEmpty`, `URITooLong`, `NoteTooLong`); wrong-status reverts; deadline and review-window timing guards; access control on every role-gated function.
- **Fuzz:** amount round-trip over the full `uint128` range; review period over `[60, 30 days]`.
- **Invariants (256 runs x 500 calls = 128,000 calls, 0 reverts):** a stateful handler with 3 clients and 3 builders randomly creates, delivers, requests changes, releases, refunds, claims, cancels, withdraws and warps time. After every call:
  - `address(escrow).balance == totalLocked + sum(pendingWithdrawals)`
  - `deposited == totalLocked + totalReleased + totalRefunded`
  - `deposited == address(escrow).balance + withdrawn`
  - `totalLocked ==` sum of amounts of Funded/Delivered escrows
  - Released and Refunded are terminal

Result: 56 unit/fuzz tests + 5 invariants pass (`forge test`).
- **Reentrancy:** a malicious builder contract that calls `withdraw()` from its `receive()` is blocked by the inline `_locked` guard.

```bash
forge test
# or with gas report:
forge test --gas-report
```

---

## Built with Arc Studio

Everything here was built in [Arc Studio](https://studio.arc.io/app/df27de16-e3d0-4d9c-b748-7a4c900c64e9):

**Video walkthrough:** https://github.com/swiftbotlab/demo-first-escrow/releases/download/v1.0.0/demo-first-escrow-arc-studio-mainnet.mp4


- **Smart Contract mode:** contract written from our spec, two rounds of security review (which moved settlement to pull payments and added the `uint128` bound), Slither, the Foundry test suite, then deploy to Arc Testnet. A later Smart Contract turn rewrote the invariant suite (tests only, contract untouched).
- **Build mode:** the React + wagmi/viem app against the deployed contract, with the testnet/mainnet network config, then fixes after an end-to-end test of the live app (refresh after confirmation, fee floor handling, RPC batching via Multicall3).
- **Integrations:** pushed to GitHub and deployed to Netlify from the Studio workbench.

---

## Run the app locally

```bash
bun install      # app deps, and OpenZeppelin for contracts/script (Studio's CREATE2 deploy helper)
forge build      # writes contracts/out/, where src/config/networks.ts imports the ABI from
bun run dev
```

Open [http://localhost:5173](http://localhost:5173). The app reads from Arc Testnet by default; no wallet is required to browse existing escrows. `forge test` also needs `bun install` first, for the same OpenZeppelin import.

---

## Limitations

- **No third-party arbiter.** Disputes are settled by the parties directly (client releases / builder cancels / deadline enforced automatically). There is no arbiter role by design — adding one would require custody of a private key or a separate governance contract.
- **Not audited by a paid third party.** The contract has been reviewed with automated tools and a structured internal review, but has not been independently audited. Do not use with large sums without a professional audit.
- **Change requests (v1).** `requestChanges()` has no cap, and the new deadline is now + `reviewPeriod`, which the client picks (minimum 60 s). An active client can keep asking for changes, so the builder can't force payment; and with a short review period the builder may get very little time to fix before the client can refund. Builders: don't accept short review periods.
- **After a delivery (v1).** Once the builder delivers on time, the client can't get a refund without the builder's cooperation (cancel), and if the client misses a review window anyone can trigger the payout to the builder. There is no arbiter.
- **Deadline (v1).** `deliverBy` has no upper bound; a far-future deadline means only the builder can free the funds (by cancelling).
- **Stray USDC.** USDC sent to the contract outside `createEscrow` (for example through the 6-decimal ERC-20 interface) is not credited to anyone and can't be recovered; there is no owner and no sweep.
- **Recipients.** A recipient that can't receive native USDC (blocklisted, or a contract without a payable `receive`) can't withdraw; the balance stays credited.
- **Public data.** Titles, demo links and change-request notes are public on-chain forever. The app's delivery hash is the hash of the link, not of the delivered build.
- **`escrowsOf` can be spammed.** Anyone who funds an escrow (any non-zero amount) naming your address as the builder adds an entry to your `escrowsOf` list. The list is append-only on-chain; treat escrows you did not agree to as noise.

---

## License

MIT — see [LICENSE](./LICENSE).
