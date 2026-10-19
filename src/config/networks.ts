import { defineChain } from 'viem'
import artifact from '../../contracts/out/DemoFirstEscrow.sol/DemoFirstEscrow.json'

// ---------------------------------------------------------------------------
// Chain definitions
// ---------------------------------------------------------------------------

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
  testnet: false,
})

// ---------------------------------------------------------------------------
// Contract config per network
// ---------------------------------------------------------------------------

export type NetworkKey = 'testnet' | 'mainnet'

export interface NetworkConfig {
  chain: typeof arcTestnet
  contractAddress: `0x${string}` | ''
  deploymentBlock: bigint
  explorerUrl: string
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  testnet: {
    chain: arcTestnet,
    contractAddress: '0xbb250819e407a108e652cbcf36b45efdd6a3e4c0',
    deploymentBlock: 67913869n,
    explorerUrl: 'https://testnet.arcscan.app',
  },
  mainnet: {
    chain: arcMainnet as unknown as typeof arcTestnet,
    // Deployed 2026-10-19 (byte-identical to the Studio-audited testnet build), source verified on explorer.arc.io
    contractAddress: '0x7767a9bafc3ea961d0edf97a8aa69a7d5e38dae5',
    deploymentBlock: 26686214n,
    explorerUrl: 'https://explorer.arc.io',
  },
}

/** Picker order: production network first. */
export const NETWORK_KEYS: readonly NetworkKey[] = ['mainnet', 'testnet']

export function isNetworkKey(value: string): value is NetworkKey {
  return value === 'mainnet' || value === 'testnet'
}

/** Network shown on first load (links that name a network override it). Build with VITE_ARC_NETWORK=testnet for a testnet-first build. */
export const DEFAULT_NETWORK: NetworkKey = import.meta.env.VITE_ARC_NETWORK === 'testnet' ? 'testnet' : 'mainnet'

// ---------------------------------------------------------------------------
// ABI — imported from the Foundry artifact (single source of truth)
// ---------------------------------------------------------------------------

export const ESCROW_ABI = artifact.abi

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildTxUrl(networkKey: NetworkKey, hash: string): string {
  return `${NETWORKS[networkKey].explorerUrl}/tx/${hash}`
}

export function buildAddressUrl(networkKey: NetworkKey, address: string): string {
  return `${NETWORKS[networkKey].explorerUrl}/address/${address}`
}
