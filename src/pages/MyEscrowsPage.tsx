import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { createPublicClient, http } from 'viem'
import { NETWORKS, ESCROW_ABI, type NetworkKey } from '../config/networks'
import { EscrowCard } from '../components/EscrowCard'


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
  networkKey: NetworkKey
  onNav: (page: string, params?: Record<string, string>) => void
}

export function MyEscrowsPage({ networkKey, onNav }: Props) {
  const { address } = useAccount()
  const net = NETWORKS[networkKey]
  const contractAddress = net.contractAddress as `0x${string}` | undefined

  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  interface ListState { loading: boolean; ids: bigint[]; escrows: Map<string, RawEscrow> }
  const [listState, setListState] = useState<ListState>({ loading: false, ids: [], escrows: new Map() })

  useEffect(() => {
    if (!address || !contractAddress) return
    let cancelled = false
    const rpcUrl = net.chain.rpcUrls.default.http[0]
    const client = createPublicClient({ chain: net.chain, transport: http(rpcUrl) })
    setListState({ loading: true, ids: [], escrows: new Map() })
    client
      .readContract({ address: contractAddress, abi: ESCROW_ABI, functionName: 'escrowsOf', args: [address] })
      .then(async (rawIds) => {
        if (cancelled) return
        const idArr = (rawIds as bigint[]).slice().reverse()
        const fetches = idArr.map((id) =>
          client.readContract({ address: contractAddress, abi: ESCROW_ABI, functionName: 'getEscrow', args: [id] }),
        )
        const results = await Promise.allSettled(fetches)
        if (cancelled) return
        const map = new Map<string, RawEscrow>()
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') map.set(idArr[i].toString(), res.value as RawEscrow)
        })
        setListState({ loading: false, ids: idArr, escrows: map })
      })
      .catch(() => { if (!cancelled) setListState({ loading: false, ids: [], escrows: new Map() }) })
    return () => { cancelled = true }
  // net.chain is stable per networkKey — networkKey captures the identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, contractAddress, networkKey])

  const { loading, ids, escrows } = listState

  const filtered = ids.filter((id) => {
    const e = escrows.get(id.toString())
    if (!e) return true
    const done = e.status === 3 || e.status === 4
    if (filter === 'active') return !done
    if (filter === 'done') return done
    return true
  })

  if (!address) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see your escrows.</p>
        <ConnectKitButton />
      </main>
    )
  }

  if (!contractAddress) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <div
          className="rounded-2xl px-4 py-3 text-sm"
          style={{ background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', color: 'var(--warning)' }}
        >
          Mainnet contract not deployed yet. Switch to Arc Testnet.
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          My Escrows
        </h1>
        <button
          onClick={() => onNav('new')}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {(['all', 'active', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold border capitalize transition-colors"
            style={{
              background: filter === f ? 'var(--accent)' : 'var(--surface-muted)',
              color: filter === f ? 'white' : 'var(--ink-2)',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {ids.length === 0 ? 'No escrows yet.' : 'No escrows match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((id) => {
            const escrow = escrows.get(id.toString())
            if (!escrow) return (
              <div key={id.toString()} className="h-24 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />
            )
            return (
              <EscrowCard
                key={id.toString()}
                id={id}
                escrow={escrow}
                connectedAddress={address}
                networkKey={networkKey}
                onClick={() => onNav('escrow', { id: id.toString() })}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
