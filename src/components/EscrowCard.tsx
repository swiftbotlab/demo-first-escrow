import { StatusChip } from './StatusChip'
import { Countdown } from './Countdown'
import { fmtUsdc, fmtAddr, sameAddr, type EscrowStatus } from '../lib/utils'
import type { NetworkKey } from '../config/networks'

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
  id: bigint
  escrow: RawEscrow
  connectedAddress?: string
  networkKey: NetworkKey
  onClick: () => void
}

export function EscrowCard({ id, escrow, connectedAddress, onClick }: Props) {
  const status = escrow.status as EscrowStatus
  const isClient = sameAddr(connectedAddress, escrow.client)
  const isBuilder = sameAddr(connectedAddress, escrow.builder)
  const role = isClient ? 'Client' : isBuilder ? 'Builder' : null

  // Which deadline to show
  const inReview = status === 2 && escrow.deliveredAt > 0n
  const deadlineSec = inReview
    ? escrow.deliveredAt + escrow.reviewPeriod
    : escrow.deliverBy

  const deadlineLabel = inReview ? 'Review window' : 'Deliver by'
  const isTerminal = status === 3 || status === 4

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.005] hover:shadow-sm active:scale-[0.998]"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>#{id.toString()}</span>
            {role && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
              >
                {role}
              </span>
            )}
          </div>
          <p className="truncate font-semibold" style={{ color: 'var(--ink)' }}>{escrow.title}</p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {fmtAddr(escrow.client)} → {fmtAddr(escrow.builder)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="display font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {fmtUsdc(escrow.amount)}
          </p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <StatusChip status={status} small />
        {!isTerminal && deadlineSec > 0n && (
          <Countdown
            targetSec={deadlineSec}
            label={deadlineLabel}
            className="text-xs"
          />
        )}
      </div>
    </button>
  )
}
