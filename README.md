# Demo-first Escrow

**by Swift Bot Labs**

Swift Bot Labs builds custom bots and automations for businesses. Every engagement starts with a working demo: the client sees the bot running before any money changes hands. This contract makes that promise enforceable on-chain for both sides. The client locks USDC in escrow before the project begins. The builder delivers a link to the live demo and records its hash on-chain. The client reviews and releases. If the builder misses the deadline, the client gets a full refund. If the client goes silent after delivery, the builder can claim automatically once the review window closes.

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

The builder can walk away at any time before release by calling `cancel()`, which refunds the client. During the review window the client can call `requestChanges()`: the escrow goes back to Funded and the delivery deadline moves to at least one review period from now, so the builder always has time to fix.

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
| Arc Mainnet | coming soon | — |

The testnet contract source is verified on the explorer (Blockscout): solc 0.8.28, optimizer 200 runs, EVM `paris`.

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

---

## Tests

The Foundry test suite in `contracts/test/DemoFirstEscrow.t.sol` covers:

- **Happy paths:** create → deliver → release → withdraw; create → miss deadline → refund → withdraw; claim after review window; requestChanges → redeliver → release; builder cancel (funded and delivered states).
- **Revert paths:** all input validation errors (`ZeroValue`, `AmountTooLarge`, `ZeroAddress`, `SelfEscrow`, `InvalidDeadline`, `InvalidReviewPeriod`, `TitleEmpty`, `TitleTooLong`, `URIEmpty`, `URITooLong`, `NoteTooLong`); wrong-status reverts; deadline and review-window timing guards; access control on every role-gated function.
- **Fuzz:** amount round-trip over the full `uint128` range; review period over `[60, 30 days]`.
- **Invariant (256 runs x 500 calls):** with a handler that settles and withdraws, `address(contract).balance == totalLocked` and the totals stay consistent.
- **Reentrancy:** a malicious builder contract that calls `withdraw()` from its `receive()` is blocked by the inline `_locked` guard.

```bash
forge test
# or with gas report:
forge test --gas-report
```

---

## Built with Arc Studio

The contract, security review, Slither static analysis, unit tests, and testnet deployment were done in Arc Studio's Smart Contract mode. The React/TypeScript frontend was built in Arc Studio's Build mode.

---

## Run the app locally

```bash
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173). The app reads from Arc Testnet by default; no wallet is required to browse existing escrows.

---

## Limitations

- **No third-party arbiter.** Disputes are settled by the parties directly (client releases / builder cancels / deadline enforced automatically). There is no arbiter role by design — adding one would require custody of a private key or a separate governance contract.
- **Not audited by a paid third party.** The contract has been reviewed with automated tools and a structured internal review, but has not been independently audited. Do not use with large sums without a professional audit.
- **`escrowsOf` can be spammed.** Anyone who funds an escrow (any non-zero amount) naming your address as the builder adds an entry to your `escrowsOf` list. The list is append-only on-chain; treat escrows you did not agree to as noise.

---

## License

MIT — see [LICENSE](./LICENSE).
