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
    contractAddress: '', // deploy yourself, then fill this in
    deploymentBlock: 0n,
    explorerUrl: 'https://explorer.arc.io',
  },
}

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
