import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { WithdrawBanner } from './components/WithdrawBanner'
import { HomePage } from './pages/HomePage'
import { NewEscrowPage } from './pages/NewEscrowPage'
import { MyEscrowsPage } from './pages/MyEscrowsPage'
import { EscrowDetailPage } from './pages/EscrowDetailPage'
import { NETWORKS, DEFAULT_NETWORK, isNetworkKey, type NetworkKey } from './config/networks'

// ---------------------------------------------------------------------------
// Minimal hash-based router. Every route names its network, so a copied link always opens the same escrow
// on the same chain (escrow ids restart at 1 on each network):
//   #mainnet/escrow/3   #testnet/escrow/3   #mainnet/new   #testnet/my-escrows   #testnet (home)
// A link without a network (#escrow/3) opens on the default network and is rewritten to the explicit form.
// ---------------------------------------------------------------------------

interface Route {
  page: string
  params: Record<string, string>
  network: NetworkKey | null
}

function parseHash(raw: string): Route {
  const parts = raw.replace(/^#\/?/, '').split('/').filter(Boolean)
  let network: NetworkKey | null = null
  if (parts[0] && isNetworkKey(parts[0])) network = parts.shift() as NetworkKey
  const [page = 'home', ...rest] = parts
  const params: Record<string, string> = {}
  if (page === 'escrow' && rest[0]) params.id = rest[0].replace(/\D/g, '')
  return { page, params, network }
}

function buildHash(network: NetworkKey, page: string, params?: Record<string, string>): string {
  if (page === 'home') return network === DEFAULT_NETWORK ? '' : network
  if (page === 'escrow' && params?.id) return `${network}/escrow/${params.id}`
  return `${network}/${page}`
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [networkKey, setNetworkKey] = useState<NetworkKey>(() => parseHash(window.location.hash).network ?? DEFAULT_NETWORK)

  // Sync to hash changes (back/forward, pasted links). A link's network wins over the picker.
  useEffect(() => {
    const handler = () => {
      const next = parseHash(window.location.hash)
      setRoute(next)
      if (next.network) setNetworkKey(next.network)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  // Keep the address bar explicit about the network (also after a picker change) without adding history entries.
  useEffect(() => {
    const want = buildHash(networkKey, route.page, route.params)
    const have = window.location.hash.replace(/^#\/?/, '')
    if (have !== want) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${want ? `#${want}` : ''}`)
    }
  }, [networkKey, route])

  function navigate(page: string, params?: Record<string, string>) {
    window.location.hash = buildHash(networkKey, page, params)
    setRoute({ page, params: params ?? {}, network: networkKey })
  }

  const { page, params } = route

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-gradient)' }}>
      <Header
        networkKey={networkKey}
        onNetworkChange={setNetworkKey}
        onNav={navigate}
        currentPage={page}
      />

      <WithdrawBanner networkKey={networkKey} />

      {page === 'home' && (
        <HomePage networkKey={networkKey} onNav={navigate} />
      )}
      {page === 'new' && (
        <NewEscrowPage networkKey={networkKey} onNav={navigate} />
      )}
      {page === 'my-escrows' && (
        <MyEscrowsPage networkKey={networkKey} onNav={navigate} />
      )}
      {page === 'escrow' && (
        <EscrowDetailPage escrowId={params.id ?? '1'} networkKey={networkKey} onNav={navigate} />
      )}

      {/* Footer */}
      <footer className="mx-auto max-w-5xl px-4 py-8 mt-8 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs" style={{ color: 'var(--muted)' }}>
          <div className="flex items-center gap-4">
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>Demo-first Escrow</span>
            <span>by Swift Bot Labs</span>
          </div>
          <div className="flex items-center gap-4">
            {NETWORKS[networkKey].contractAddress ? (
              <a
                href={`${NETWORKS[networkKey].explorerUrl}/address/${NETWORKS[networkKey].contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Contract on explorer
              </a>
            ) : (
              <span style={{ color: 'var(--subtle)' }}>Mainnet contract not deployed yet</span>
            )}
            <a
              href="https://github.com/swiftbotlab/demo-first-escrow"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Source on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
