/**
 * Event log fetcher for DemoFirstEscrow.
 *
 * Arc RPC limits eth_getLogs to <10 000 blocks per request.
 * We scan in 9 000-block chunks, a few in parallel, forward from deployment block.
 */

import {
  createPublicClient,
  http,
  decodeEventLog,
  type Log,
} from 'viem'
import { NETWORKS, ESCROW_ABI, type NetworkKey } from '../config/networks'

const CHUNK = 9_000n
const PARALLEL = 4

function clientFor(key: NetworkKey) {
  const net = NETWORKS[key]
  return createPublicClient({
    chain: net.chain,
    transport: http(net.chain.rpcUrls.default.http[0]),
    batch: { multicall: { wait: 16 } },
  })
}

/** Retry a promise up to `attempts` times with exponential backoff on rate-limit errors. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = String(e).toLowerCase()
      const isRateLimit = msg.includes('rate limit') || msg.includes('too many') || msg.includes('429')
      if (!isRateLimit || i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i))
    }
  }
  throw lastErr
}

export interface EscrowLog {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: `0x${string}`
}

/**
 * Fetch all events for a specific escrow id.
 * Scans forward from deployment block in 9k-block chunks (PARALLEL at a time).
 * Returns logs sorted oldest-first.
 */
export async function fetchEscrowLogs(
  networkKey: NetworkKey,
  escrowId: bigint,
): Promise<EscrowLog[]> {
  const net = NETWORKS[networkKey]
  if (!net.contractAddress) return []

  const client = clientFor(networkKey)
  const addr = net.contractAddress
  const head = await client.getBlockNumber()
  const start = net.deploymentBlock > 0n ? net.deploymentBlock : head - 180_000n

  // Build chunk ranges
  const ranges: Array<{ from: bigint; to: bigint }> = []
  let from = start
  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head
    ranges.push({ from, to })
    from = to + 1n
  }

  const results: EscrowLog[] = []

  // Process in groups of PARALLEL
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = ranges.slice(i, i + PARALLEL)
    const settled = await Promise.allSettled(
      batch.map(({ from, to }) =>
        client.getLogs({ address: addr, fromBlock: from, toBlock: to }),
      ),
    )
    for (const res of settled) {
      if (res.status !== 'fulfilled') continue
      for (const log of res.value) {
        const decoded = tryDecodeLog(log)
        if (!decoded) continue
        const args = decoded.args as Record<string, unknown>
        if ('id' in args && args.id === escrowId) {
          results.push({
            eventName: decoded.eventName,
            args,
            blockNumber: log.blockNumber ?? 0n,
            transactionHash: (log.transactionHash ?? '0x'),
          })
        }
      }
    }
  }

  return results.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1))
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
