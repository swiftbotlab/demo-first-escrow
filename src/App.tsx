import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { WithdrawBanner } from './components/WithdrawBanner'
import { HomePage } from './pages/HomePage'
import { NewEscrowPage } from './pages/NewEscrowPage'
import { MyEscrowsPage } from './pages/MyEscrowsPage'
import { EscrowDetailPage } from './pages/EscrowDetailPage'
import type { NetworkKey } from './config/networks'

// ---------------------------------------------------------------------------
// Minimal hash-based router
// ---------------------------------------------------------------------------

function getRouteFromHash(): { page: string; params: Record<string, string> } {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash) return { page: 'home', params: {} }
  const [page, ...rest] = hash.split('/')
  const params: Record<string, string> = {}
  if (page === 'escrow' && rest[0]) params.id = rest[0]
  return { page, params }
}

function setHash(page: string, params?: Record<string, string>) {
  if (page === 'home') { window.location.hash = ''; return }
  if (page === 'escrow' && params?.id) { window.location.hash = `escrow/${params.id}`; return }
  window.location.hash = page
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [networkKey, setNetworkKey] = useState<NetworkKey>('testnet')
  const [route, setRoute] = useState(getRouteFromHash)

  // Sync to hash changes (back/forward)
  useEffect(() => {
    const handler = () => setRoute(getRouteFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  function navigate(page: string, params?: Record<string, string>) {
    setHash(page, params)
    setRoute({ page, params: params ?? {} })
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
            <a
              href={`${networkKey === 'testnet' ? 'https://testnet.arcscan.app' : 'https://explorer.arc.io'}/address/${import.meta.env.VITE_CONTRACT_ADDRESS ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Contract on explorer
            </a>
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
