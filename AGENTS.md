# Demo-first Escrow — Swift Bot Labs

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

DemoFirstEscrow: a minimal, auditable native-USDC escrow for software jobs. A client funds an escrow for a builder, the builder delivers a working demo, the client releases payment. Uses pull-payment model for safe settlement on Arc.

## Deployed Contracts

| Contract | Chain | Address | Explorer |
|---|---|---|---|
| DemoFirstEscrow | Arc Testnet | 0xbb250819e407a108e652cbcf36b45efdd6a3e4c0 | https://explorer.testnet.arc.io/address/0xbb250819e407a108e652cbcf36b45efdd6a3e4c0 |

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002) / Arc Mainnet (Chain ID: 5042)
- Token: NATIVE USDC — Arc exposes USDC as the native gas token (msg.value, 18 decimals). Parse/format with parseEther/formatEther (NOT parseUnits(x, 6)). The 6-decimal ERC-20 interface exists at 0x3600000000000000000000000000000000000000 but the contract and app use native 18-decimal amounts exclusively.
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
