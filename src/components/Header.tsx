import { ConnectKitButton } from 'connectkit'
import { useSwitchChain, useAccount } from 'wagmi'
import { ChevronDown, Zap } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { NETWORKS, type NetworkKey } from '../config/networks'

interface Props {
  networkKey: NetworkKey
  onNetworkChange: (k: NetworkKey) => void
  onNav: (page: string) => void
  currentPage: string
}

export function Header({ networkKey, onNetworkChange, onNav, currentPage }: Props) {
  const { address } = useAccount()
  const { switchChain } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleNetworkSelect(k: NetworkKey) {
    setOpen(false)
    onNetworkChange(k)
    const target = NETWORKS[k].chain.id
    if (address) switchChain({ chainId: target })
  }

  const net = NETWORKS[networkKey]
  const isTestnet = networkKey === 'testnet'

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'rgba(255,255,255,0.80)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {/* Logo */}
        <button
          className="flex items-center gap-2 mr-2"
          onClick={() => onNav('home')}
          aria-label="Home"
        >
          <div
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent)' }}
          >
            <Zap size={14} className="text-white" />
          </div>
          <span className="display hidden text-sm font-semibold sm:block" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Demo-first Escrow
          </span>
        </button>

        {/* Nav links */}
        <nav className="flex items-center gap-1 mr-auto">
          {(['home', 'my-escrows', 'new'] as const).map((page) => {
            const labels: Record<string, string> = { home: 'Home', 'my-escrows': 'My Escrows', new: 'New Escrow' }
            const active = currentPage === page
            return (
              <button
                key={page}
                onClick={() => onNav(page)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  background: active ? 'rgba(18,45,69,0.07)' : 'transparent',
                }}
              >
                {labels[page]}
              </button>
            )
          })}
        </nav>

        {/* Network picker */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-strong)',
              color: isTestnet ? 'var(--warning)' : 'var(--success)',
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: isTestnet ? 'var(--warning)' : 'var(--success)' }}
            />
            {net.chain.name}
            <ChevronDown size={12} />
          </button>

          {open && (
            <div
              className="absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-xl border py-1 shadow-lg"
              style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
            >
              {(['testnet', 'mainnet'] as NetworkKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => handleNetworkSelect(k)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
                  style={{ color: 'var(--ink)' }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: k === 'testnet' ? 'var(--warning)' : 'var(--success)' }}
                  />
                  {NETWORKS[k].chain.name}
                  {k === networkKey && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>active</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wallet */}
        <ConnectKitButton />
      </div>
    </header>
  )
}
