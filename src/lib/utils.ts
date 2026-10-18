import { formatEther, parseEther, keccak256, toHex, type Address } from 'viem'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format 18-decimal native USDC bigint → "12.50 USDC" */
export function fmtUsdc(raw: bigint | undefined): string {
  if (raw === undefined) return '—'
  const s = formatEther(raw)
  const n = parseFloat(s)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

/** Parse user-typed USDC string → bigint (18 decimals). Returns 0n on invalid. */
export function parseUsdc(value: string): bigint {
  try {
    return parseEther(value)
  } catch {
    return 0n
  }
}

/** Shorten address: 0x1234...abcd */
export function fmtAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type EscrowStatus = 0 | 1 | 2 | 3 | 4
export const STATUS_LABEL: Record<EscrowStatus, string> = {
  0: 'None',
  1: 'Funded',
  2: 'Delivered',
  3: 'Released',
  4: 'Refunded',
}
export const STATUS_COLOR: Record<EscrowStatus, string> = {
  0: '#8a849c',
  1: '#1061a6',
  2: '#b45309',
  3: '#1a8047',
  4: '#ba2b4c',
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

/** Seconds → human label: "2h 15m", "3d 4h", "45s", etc. */
export function fmtDuration(seconds: bigint): string {
  const s = Number(seconds)
  if (s <= 0) return '0s'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/** Unix seconds → "Oct 18, 2026, 4:32 PM" */
export function fmtTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Delivery hash — keccak256 of the URI bytes (mirrors contract expectation)
// ---------------------------------------------------------------------------

export function hashDeliveryURI(uri: string): `0x${string}` {
  return keccak256(toHex(uri))
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

export function sameAddr(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export type { Address }
