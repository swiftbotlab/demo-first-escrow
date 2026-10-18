import { useEffect, useState, useCallback } from 'react'
import { useAccount, useWriteContract, useSwitchChain } from 'wagmi'
import { createPublicClient, http, keccak256, toHex } from 'viem'
import { ArrowLeft, ExternalLink, Clock } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { NETWORKS, ESCROW_ABI, buildTxUrl, buildAddressUrl, type NetworkKey } from '../config/networks'
import { StatusChip } from '../components/StatusChip'
import { Countdown } from '../components/Countdown'
import { TxButton } from '../components/TxButton'
import { fetchEscrowLogs, type EscrowLog } from '../lib/escrow'
import { fmtUsdc, fmtAddr, fmtTimestamp, sameAddr, nowSec, type EscrowStatus } from '../lib/utils'

interface RawEscrow {
  client: string
  builder: string
  amount: bigint
  deliverBy: bigint
  reviewPeriod: bigint
  deliveredAt: bigint
  status: number
  title: string
  deliveryURI: string
  deliveryHash: `0x${string}`
}

interface Props {
  escrowId: string
  networkKey: NetworkKey
  onNav: (page: string, params?: Record<string, string>) => void
}

export function EscrowDetailPage({ escrowId, networkKey, onNav }: Props) {
  const net = NETWORKS[networkKey]
  const contractAddress = net.contractAddress as `0x${string}` | undefined
  const id = BigInt(escrowId || '0')
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = !!address && chainId !== net.chain.id

  // --- Escrow data ---
  const [escrow, setEscrow] = useState<RawEscrow | null>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<EscrowLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const chainRpc = net.chain.rpcUrls.default.http[0]
  const chainObj = net.chain

  const refresh = useCallback(() => {
    if (!contractAddress || id === 0n) return
    const client = createPublicClient({ chain: chainObj, transport: http(chainRpc) })
    setLoading(true)
    client
      .readContract({ address: contractAddress, abi: ESCROW_ABI, functionName: 'getEscrow', args: [id] })
      .then((data) => setEscrow(data as RawEscrow))
      .catch(() => setEscrow(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, id, chainRpc])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!contractAddress || id === 0n) return
    let cancelled = false
    setLogsLoading(true)
    fetchEscrowLogs(networkKey, id)
      .then((l) => { if (!cancelled) setLogs(l) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLogsLoading(false) })
    return () => { cancelled = true }
  }, [contractAddress, id, networkKey])

  // --- Deliver form ---
  const [deliverURI, setDeliverURI] = useState('')
  const deliverHash = deliverURI ? keccak256(toHex(deliverURI)) : ('0x' + '0'.repeat(64) as `0x${string}`)

  // --- Changes note ---
  const [changesNote, setChangesNote] = useState('')

  const { writeContract, isPending: globalPending } = useWriteContract()

  function writeAction(fn: string, args: unknown[]) {
    if (!contractAddress) return
    writeContract(
      {
        address: contractAddress,
        abi: ESCROW_ABI,
        functionName: fn,
        args: args,
        chainId: net.chain.id,
        maxFeePerGas: 20_000_000_000n,
      },
      {
        onSuccess: () => toast.success(`${fn} submitted`),
        onError: (e) => {
          if (!e.message.includes('user rejected')) toast.error(e.message.split('\n')[0].slice(0, 100))
        },
      },
    )
  }

  if (!contractAddress) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <BackButton onNav={onNav} />
        <div className="rounded-2xl px-4 py-3 text-sm mt-4" style={{ background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', color: 'var(--warning)' }}>
          Mainnet contract not deployed yet.
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <BackButton onNav={onNav} />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />
          ))}
        </div>
      </main>
    )
  }

  if (!escrow || escrow.client === '0x0000000000000000000000000000000000000000') {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <BackButton onNav={onNav} />
        <p className="mt-6 text-sm" style={{ color: 'var(--muted)' }}>Escrow #{escrowId} not found.</p>
      </main>
    )
  }

  const status = escrow.status as EscrowStatus
  const isClient = sameAddr(address, escrow.client)
  const isBuilder = sameAddr(address, escrow.builder)
  const now = nowSec()
  const isTerminal = status === 3 || status === 4
  const inReview = status === 2 && escrow.deliveredAt > 0n
  const reviewExpired = inReview && now > escrow.deliveredAt + escrow.reviewPeriod
  const deadlinePassed = now > escrow.deliverBy
  const withinReviewWindow = inReview && now <= escrow.deliveredAt + escrow.reviewPeriod

  const explorerAddr = (addr: string) => `${net.explorerUrl}/address/${addr}`

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <BackButton onNav={onNav} />

      {/* Header card */}
      <div
        className="mt-4 rounded-3xl p-5"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Escrow #{escrowId}</span>
            <h1 className="display mt-0.5 text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {escrow.title}
            </h1>
          </div>
          <StatusChip status={status} />
        </div>

        {/* Amount */}
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {fmtUsdc(escrow.amount)}
          </span>
          <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
        </div>

        {/* Parties */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PartyRow label="Client" address={escrow.client} explorerUrl={explorerAddr(escrow.client)} you={isClient} />
          <PartyRow label="Builder" address={escrow.builder} explorerUrl={explorerAddr(escrow.builder)} you={isBuilder} />
        </div>

        {/* Deadlines */}
        {!isTerminal && (
          <div className="mt-4 space-y-1">
            {status === 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Clock size={13} style={{ color: 'var(--muted)' }} />
                <Countdown targetSec={escrow.deliverBy} label="Deliver by" expiredLabel="Deadline passed" className="text-sm" />
              </div>
            )}
            {inReview && (
              <div className="flex items-center gap-2 text-sm">
                <Clock size={13} style={{ color: 'var(--muted)' }} />
                <Countdown targetSec={escrow.deliveredAt + escrow.reviewPeriod} label="Review window" expiredLabel="Window expired" className="text-sm" />
              </div>
            )}
          </div>
        )}

        {/* Delivery link */}
        {escrow.deliveryURI && (
          <div
            className="mt-4 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>Delivery</p>
            <a
              href={escrow.deliveryURI}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm font-medium break-all"
              style={{ color: 'var(--accent-hover)' }}
            >
              {escrow.deliveryURI}
              <ExternalLink size={12} className="flex-shrink-0" />
            </a>
            <p className="mono mt-1 text-xs break-all" style={{ color: 'var(--subtle)' }}>
              hash: {escrow.deliveryHash}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isTerminal && address && !wrongChain && (
        <div
          className="mt-4 rounded-3xl p-5 space-y-3"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Actions</h2>

          {/* BUILDER: deliver */}
          {isBuilder && status === 1 && !deadlinePassed && (
            <div className="space-y-2">
              <input
                type="url"
                value={deliverURI}
                onChange={(e) => setDeliverURI(e.target.value.trim())}
                placeholder="https://your-demo-url.com"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-300"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              {deliverURI && (
                <p className="mono text-xs break-all" style={{ color: 'var(--subtle)' }}>
                  keccak256: {deliverHash}
                </p>
              )}
              <TxButton
                onClick={() => !wrongChain && writeAction('deliver', [id, deliverURI, deliverHash])}
                disabled={!deliverURI || deliverURI.length > 300}
                isPending={globalPending}
                disabledReason={!deliverURI ? 'Enter a demo URL' : 'URL too long'}
              >
                Submit delivery
              </TxButton>
            </div>
          )}
          {isBuilder && status === 1 && deadlinePassed && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>Delivery deadline has passed.</p>
          )}

          {/* BUILDER: cancel */}
          {isBuilder && (status === 1 || status === 2) && (
            <TxButton
              onClick={() => writeAction('cancel', [id])}
              isPending={globalPending}
              variant="ghost"
            >
              Cancel & refund client
            </TxButton>
          )}

          {/* CLIENT: release */}
          {isClient && (status === 1 || status === 2) && (
            <TxButton
              onClick={() => writeAction('release', [id])}
              isPending={globalPending}
            >
              Release payment
            </TxButton>
          )}

          {/* CLIENT: request changes */}
          {isClient && status === 2 && withinReviewWindow && (
            <div className="space-y-2">
              <input
                type="text"
                value={changesNote}
                onChange={(e) => setChangesNote(e.target.value)}
                placeholder="Describe the changes needed (optional, max 300 bytes)"
                maxLength={320}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-300"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <TxButton
                onClick={() => writeAction('requestChanges', [id, changesNote])}
                isPending={globalPending}
                variant="ghost"
                disabled={new TextEncoder().encode(changesNote).length > 300}
                disabledReason="Note too long (max 300 bytes)"
              >
                Request changes
              </TxButton>
            </div>
          )}

          {/* CLIENT: refund */}
          {isClient && status === 1 && (
            <TxButton
              onClick={() => writeAction('refund', [id])}
              isPending={globalPending}
              variant={deadlinePassed ? 'danger' : 'ghost'}
              disabled={!deadlinePassed}
              disabledReason={!deadlinePassed ? `Available after deadline · ${fmtTimestamp(escrow.deliverBy)}` : undefined}
            >
              Refund (deadline passed)
            </TxButton>
          )}

          {/* ANYONE: claim for builder */}
          {status === 2 && reviewExpired && (
            <TxButton
              onClick={() => writeAction('claim', [id])}
              isPending={globalPending}
            >
              Claim for builder (review window expired)
            </TxButton>
          )}
          {status === 2 && !reviewExpired && !isClient && !isBuilder && (
            <TxButton onClick={() => {}} disabled disabledReason={`Available after review window · ${fmtTimestamp(escrow.deliveredAt + escrow.reviewPeriod)}`}>
              Claim for builder
            </TxButton>
          )}
        </div>
      )}

      {/* Wrong chain */}
      {!isTerminal && address && wrongChain && (
        <div className="mt-4">
          <button
            onClick={() => switchChain({ chainId: net.chain.id })}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white"
            style={{ background: 'var(--warning)' }}
          >
            Switch to {net.chain.name} to take action
          </button>
        </div>
      )}

      {/* Connect prompt */}
      {!address && (
        <div className="mt-4 text-center">
          <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>Connect wallet to take action</p>
          <ConnectKitButton />
        </div>
      )}

      {/* Pull-payment notice after terminal */}
      {isTerminal && (
        <div
          className="mt-4 rounded-2xl px-4 py-3 text-sm"
          style={{ background: 'rgba(26,128,71,0.07)', border: '1px solid rgba(26,128,71,0.18)' }}
        >
          <span style={{ color: 'var(--success)' }}>Funds credited to the recipient.</span>
          <span style={{ color: 'var(--muted)' }}> Use the Withdraw button in the header if your address has a pending balance.</span>
        </div>
      )}

      {/* Event timeline */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Timeline
        </h2>
        {logsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No events found.{' '}
            <a
              href={buildAddressUrl(networkKey, net.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on explorer <ExternalLink size={11} />
            </a>
          </p>
        ) : (
          <div className="relative space-y-0">
            {logs.map((log, i) => (
              <TimelineEntry key={i} log={log} networkKey={networkKey} last={i === logs.length - 1} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackButton({ onNav }: { onNav: (p: string) => void }) {
  return (
    <button
      onClick={() => onNav('my-escrows')}
      className="flex items-center gap-1.5 text-sm font-medium"
      style={{ color: 'var(--muted)' }}
    >
      <ArrowLeft size={14} /> My Escrows
    </button>
  )
}

function PartyRow({ label, address, explorerUrl, you }: { label: string; address: string; explorerUrl: string; you: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{label}{you ? ' (you)' : ''}</p>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mono flex items-center gap-1 text-xs"
        style={{ color: 'var(--accent-hover)' }}
      >
        {fmtAddr(address)}
        <ExternalLink size={10} />
      </a>
    </div>
  )
}

function TimelineEntry({ log, networkKey, last }: { log: EscrowLog; networkKey: NetworkKey; last: boolean }) {
  const labels: Record<string, string> = {
    EscrowCreated: 'Escrow funded',
    Delivered: 'Demo delivered',
    ChangesRequested: 'Changes requested',
    Released: 'Payment released',
    Refunded: 'Refunded',
    Withdrawn: 'Withdrawn',
  }
  const colors: Record<string, string> = {
    EscrowCreated: 'var(--accent)',
    Delivered: 'var(--warning)',
    ChangesRequested: 'var(--muted)',
    Released: 'var(--success)',
    Refunded: 'var(--danger)',
    Withdrawn: 'var(--success)',
  }
  const label = labels[log.eventName] ?? log.eventName
  const color = colors[log.eventName] ?? 'var(--muted)'
  const txUrl = buildTxUrl(networkKey, log.transactionHash)

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="size-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: color }} />
        {!last && <div className="w-px flex-1 mt-1" style={{ background: 'var(--border)' }} />}
      </div>
      <div className={`pb-4 min-w-0 ${last ? '' : ''}`}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mono inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--accent-hover)' }}
        >
          {log.transactionHash.slice(0, 10)}…{log.transactionHash.slice(-6)}
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  )
}


