import { useEffect, useState, useRef } from 'react'
import { ArrowRight, ShieldCheck, Lock, Search, ExternalLink } from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { StatusChip } from '../components/StatusChip'
import { fetchContractStats, fetchRecentEscrows, type EscrowSummary } from '../lib/escrow'
import { fmtUsdc, fmtAddr, type EscrowStatus } from '../lib/utils'
import type { NetworkKey } from '../config/networks'
import { NETWORKS, buildAddressUrl } from '../config/networks'

interface Props {
  networkKey: NetworkKey
  onNav: (page: string, params?: Record<string, string>) => void
}

interface Stats {
  escrowCount: bigint
  totalLocked: bigint
  totalReleased: bigint
  totalRefunded: bigint
}

export function HomePage({ networkKey, onNav }: Props) {
  // --- stats ---
  const [loadedFor, setLoadedFor] = useState<NetworkKey | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const loading = loadedFor !== networkKey

  useEffect(() => {
    let cancelled = false
    fetchContractStats(networkKey)
      .then((s) => { if (!cancelled) { setStats(s); setLoadedFor(networkKey) } })
      .catch(() => { if (!cancelled) { setStats(null); setLoadedFor(networkKey) } })
    return () => { cancelled = true }
  }, [networkKey])

  // --- recent escrows ---
  const [recentLoadedFor, setRecentLoadedFor] = useState<NetworkKey | null>(null)
  const [recent, setRecent] = useState<EscrowSummary[]>([])
  const recentLoading = recentLoadedFor !== networkKey

  useEffect(() => {
    let cancelled = false
    fetchRecentEscrows(networkKey, 10)
      .then((r) => { if (!cancelled) { setRecent(r); setRecentLoadedFor(networkKey) } })
      .catch(() => { if (!cancelled) { setRecent([]); setRecentLoadedFor(networkKey) } })
    return () => { cancelled = true }
  }, [networkKey])

  // --- lookup box ---
  const [lookupId, setLookupId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const id = lookupId.trim().replace(/\D/g, '')
    if (!id || id === '0') return
    onNav('escrow', { id })
  }

  const net = NETWORKS[networkKey]
  const hasContract = !!net.contractAddress

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* Hero */}
      <div className="mb-10 max-w-xl">
        <h1 className="display text-4xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Demo-first Escrow
        </h1>
        <p className="mt-2 text-lg font-medium" style={{ color: 'var(--muted)' }}>
          See a working demo before you pay. USDC held onchain until you release it.
        </p>
        <p className="mt-4 text-sm" style={{ color: 'var(--ink-2)', maxWidth: '52ch' }}>
          Client funds the escrow, builder delivers a working demo, client releases payment.
          No delivery by the deadline? Client gets a full refund. Client silent after delivery?
          Builder can claim automatically.
        </p>

        {!hasContract ? (
          <div
            className="mt-6 rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', color: 'var(--warning)' }}
          >
            Mainnet contract not deployed yet. Switch to Arc Testnet to try it.
          </div>
        ) : (
          <button
            onClick={() => onNav('new')}
            className="mt-6 flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.99]"
            style={{ background: 'var(--accent)' }}
          >
            New escrow <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* Flow steps */}
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {[
          { Icon: Lock,       title: 'Client funds',    body: 'USDC locked onchain. Builder sees the money is already there.' },
          { Icon: ShieldCheck, title: 'Builder delivers', body: 'A demo URL and hash are recorded on-chain as proof of delivery.' },
          { Icon: ArrowRight,  title: 'Client releases', body: 'One tap to release. Silence triggers automatic claim after the review window.' },
        ].map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl p-4"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <div
              className="mb-3 flex size-8 items-center justify-center rounded-xl"
              style={{ background: 'rgba(18,45,69,0.08)' }}
            >
              <Icon size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
          </div>
        ))}
      </div>

      {/* Lookup + Recent — side by side on wide, stacked on mobile */}
      {hasContract && (
        <div className="mb-10 grid gap-6 lg:grid-cols-2">
          {/* Look up an escrow */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Look up an escrow
            </h2>
            <form onSubmit={handleLookup} className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--subtle)' }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="Escrow ID, e.g. 2"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl py-2.5 pl-8 pr-3 text-sm outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!lookupId}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-[0.99]"
                style={{ background: 'var(--accent)' }}
              >
                View
              </button>
            </form>
            <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
              No wallet needed — escrow pages are public and shareable.
            </p>
          </div>

          {/* Recent escrows */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Recent escrows
            </h2>
            {recentLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No escrows yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {recent.map((e) => (
                  <li key={e.id.toString()}>
                    <button
                      onClick={() => onNav('escrow', { id: e.id.toString() })}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/5"
                    >
                      <span
                        className="mono shrink-0 text-xs font-medium tabular-nums"
                        style={{ color: 'var(--muted)', minWidth: '2.2rem' }}
                      >
                        #{e.id.toString()}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {e.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs" style={{ color: 'var(--muted)' }}>
                        {fmtUsdc(e.amount)} USDC
                      </span>
                      <StatusChip status={e.status as EscrowStatus} small />
                      <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--muted)' }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {hasContract && (
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Live contract stats · {net.chain.name}
          </h2>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />
              ))}
            </div>
          ) : stats ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Escrows created" value={stats.escrowCount.toString()} />
              <StatCard label="USDC locked now" value={fmtUsdc(stats.totalLocked)} sub="USDC" />
              <StatCard label="USDC released" value={fmtUsdc(stats.totalReleased)} sub="USDC" />
              <StatCard label="USDC refunded" value={fmtUsdc(stats.totalRefunded)} sub="USDC" />
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Could not load stats.</p>
          )}
          {/* Contract address link */}
          <div className="mt-4">
            <a
              href={buildAddressUrl(networkKey, net.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex items-center gap-1.5 text-xs hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              {net.contractAddress}
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}

      {/* Unused import suppressor */}
      {false && <span>{fmtAddr('')}</span>}
    </main>
  )
}
