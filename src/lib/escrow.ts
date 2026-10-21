/**
 * Event log fetcher for DemoFirstEscrow.
 *
 * Arc's public RPC caps eth_getLogs at a ~10k-block range and throttles parallel
 * bursts with -32005. We scan SEQUENTIALLY in 9k-block chunks with retry/backoff
 * (see ./logscan) and cache decoded results in localStorage so reloads only scan
 * the new tail instead of rescanning from the deployment block.
 */

import {
  createPublicClient,
  http,
  decodeEventLog,
  type Log,
} from 'viem'
import { NETWORKS, ESCROW_ABI, type NetworkKey } from '../config/networks'
import {
  scanLogsSequential,
  readScanCache,
  writeScanCache,
  isRateLimitError,
} from './logscan'

function clientFor(key: NetworkKey) {
  const net = NETWORKS[key]
  return createPublicClient({
    chain: net.chain,
    transport: http(net.chain.rpcUrls.default.http[0]),
    batch: { multicall: { wait: 16 } },
  })
}

/** Retry a promise up to `attempts` times with exponential backoff on rate-limit errors. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseMs = 500): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isRateLimitError(e) || i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.floor(Math.random() * 200)))
    }
  }
  throw lastErr
}

export interface EscrowLog {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex?: number
}

export interface FetchLogsResult {
  logs: EscrowLog[]
  /** false if some chunks still failed after retries — the timeline is partial. */
  complete: boolean
}

function sortLogs(logs: EscrowLog[]): EscrowLog[] {
  return [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1
    return (a.logIndex ?? 0) - (b.logIndex ?? 0)
  })
}

function dedupe(logs: EscrowLog[]): EscrowLog[] {
  const seen = new Set<string>()
  const out: EscrowLog[] = []
  for (const l of logs) {
    const key = `${l.transactionHash}:${l.blockNumber.toString()}:${l.eventName}:${l.logIndex ?? 0}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out
}

/**
 * Fetch all events for a specific escrow id.
 * Sequential 9k-block scan with retry/backoff, incremental localStorage cache.
 * Returns logs oldest-first plus `complete` (false => timeline is still partial).
 */
export async function fetchEscrowLogs(
  networkKey: NetworkKey,
  escrowId: bigint,
): Promise<FetchLogsResult> {
  const net = NETWORKS[networkKey]
  if (!net.contractAddress) return { logs: [], complete: true }

  const client = clientFor(networkKey)
  const addr = net.contractAddress
  const chainId = net.chain.id
  const deployStart = net.deploymentBlock > 0n ? net.deploymentBlock : 0n
  const cacheKey = `escrow:${chainId}:${addr.toLowerCase()}:${escrowId.toString()}`

  const cached = readScanCache<EscrowLog>(cacheKey)
  const haveCache = !!cached && cached.lastScanned >= deployStart - 1n
  const existing: EscrowLog[] = haveCache ? cached!.items : []
  const fromBlock = haveCache ? cached!.lastScanned + 1n : deployStart

  const head = await withRetry(() => client.getBlockNumber())

  if (fromBlock > head) {
    return { logs: sortLogs(existing), complete: true }
  }

  const { logs: raw, complete, lastScanned } = await scanLogsSequential(
    client,
    fromBlock,
    head,
    { address: addr },
  )

  const fresh: EscrowLog[] = []
  for (const log of raw) {
    const decoded = tryDecodeLog(log as unknown as Log)
    if (!decoded) continue
    const args = decoded.args as Record<string, unknown>
    if ('id' in args && args.id === escrowId) {
      fresh.push({
        eventName: decoded.eventName,
        args,
        blockNumber: (log.blockNumber as bigint | null) ?? 0n,
        transactionHash: ((log.transactionHash as string | null) ?? '0x') as `0x${string}`,
        logIndex: (log.logIndex as number | null) ?? 0,
      })
    }
  }

  const sorted = sortLogs(dedupe([...existing, ...fresh]))

  // Persist up to the last fully-scanned block so a partial run resumes correctly.
  writeScanCache(cacheKey, complete ? head : lastScanned, sorted)

  return { logs: sorted, complete }
}

/**
 * Fetch global stats directly from contract view functions.
 */
export async function fetchContractStats(networkKey: NetworkKey) {
  const net = NETWORKS[networkKey]
  if (!net.contractAddress) {
    return { escrowCount: 0n, totalLocked: 0n, totalReleased: 0n, totalRefunded: 0n }
  }
  const client = clientFor(networkKey)
  const addr = net.contractAddress
  // These four reads are batched into one multicall by viem's batch transport.
  const [escrowCount, totalLocked, totalReleased, totalRefunded] = await withRetry(() =>
    Promise.all([
      client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'escrowCount' }),
      client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'totalLocked' }),
      client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'totalReleased' }),
      client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'totalRefunded' }),
    ])
  )
  return {
    escrowCount: escrowCount as bigint,
    totalLocked: totalLocked as bigint,
    totalReleased: totalReleased as bigint,
    totalRefunded: totalRefunded as bigint,
  }
}

/**
 * Fetch the latest N escrows by reading ids from escrowCount down to max(1, count-n+1).
 * Each escrow is a direct getEscrow call — no log scanning needed.
 */
export interface EscrowSummary {
  id: bigint
  client: `0x${string}`
  builder: `0x${string}`
  amount: bigint
  status: number
  title: string
  deliverBy: bigint
}

export async function fetchRecentEscrows(
  networkKey: NetworkKey,
  count = 10,
): Promise<EscrowSummary[]> {
  const net = NETWORKS[networkKey]
  if (!net.contractAddress) return []
  const client = clientFor(networkKey)
  const addr = net.contractAddress
  const total = (await withRetry(() => client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'escrowCount' }))) as bigint
  if (total === 0n) return []
  const from = total > BigInt(count) ? total - BigInt(count) + 1n : 1n
  const ids: bigint[] = []
  for (let id = total; id >= from; id--) ids.push(id)
  // All getEscrow calls are batched into one multicall by viem's batch transport.
  const results = await withRetry(() => Promise.allSettled(
    ids.map((id) => client.readContract({ address: addr, abi: ESCROW_ABI, functionName: 'getEscrow', args: [id] })),
  ))
  const out: EscrowSummary[] = []
  for (let i = 0; i < ids.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const e = r.value as {
      client: `0x${string}`; builder: `0x${string}`; amount: bigint
      status: number; title: string; deliverBy: bigint
    }
    out.push({ id: ids[i], client: e.client, builder: e.builder, amount: e.amount, status: e.status, title: e.title, deliverBy: e.deliverBy })
  }
  return out
}

// ---------------------------------------------------------------------------
// Internal: try decoding a raw log against the ABI
// ---------------------------------------------------------------------------

type DecodedLog = { eventName: string; args: unknown }

function tryDecodeLog(log: Log): DecodedLog | null {
  try {
    const decoded: unknown = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics })
    if (!decoded || typeof decoded !== 'object') return null
    const d = decoded as Record<string, unknown>
    if (typeof d['eventName'] !== 'string') return null
    return { eventName: d['eventName'], args: d['args'] }
  } catch {
    return null
  }
}
