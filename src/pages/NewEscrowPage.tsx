import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { decodeEventLog } from 'viem'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { NETWORKS, ESCROW_ABI, type NetworkKey } from '../config/networks'
import { parseUsdc } from '../lib/utils'
import { toast } from 'sonner'

interface Props {
  networkKey: NetworkKey
  onNav: (page: string, params?: Record<string, string>) => void
}

const MIN_FEE = 20_000_000_000n // 20 gwei

const DEADLINE_PRESETS = [
  { label: '10 min (test)', secs: 60 * 10 },
  { label: '1 day', secs: 86400 },
  { label: '3 days', secs: 86400 * 3 },
  { label: '7 days', secs: 86400 * 7 },
]

const REVIEW_PRESETS = [
  { label: '2 min (test)', secs: 120 },
  { label: '1 day', secs: 86400 },
  { label: '3 days', secs: 86400 * 3 },
]

export function NewEscrowPage({ networkKey, onNav }: Props) {
  const net = NETWORKS[networkKey]
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [builder, setBuilder] = useState('')
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [deadlineSecs, setDeadlineSecs] = useState(DEADLINE_PRESETS[1].secs)
  const [customDeadline, setCustomDeadline] = useState('')
  const [reviewSecs, setReviewSecs] = useState(REVIEW_PRESETS[1].secs)
  const [useCustomDeadline, setUseCustomDeadline] = useState(false)

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const contractAddress = net.contractAddress as `0x${string}` | undefined

  // Validation
  const parsedAmount = parseUsdc(amount)
  const validBuilder = /^0x[0-9a-fA-F]{40}$/.test(builder)
  const wrongChain = !!address && chainId !== net.chain.id
  const titleLen = new TextEncoder().encode(title).length

  const errors: string[] = []
  if (builder && !validBuilder) errors.push('Invalid builder address')
  if (builder && address && builder.toLowerCase() === address.toLowerCase()) errors.push('Builder cannot be yourself')
  if (amount && parsedAmount === 0n) errors.push('Enter a valid amount')
  if (title && titleLen > 120) errors.push(`Title too long (${titleLen}/120 bytes)`)
  if (title && titleLen === 0) errors.push('Title required')

  const ready =
    !!contractAddress &&
    !!address &&
    !wrongChain &&
    validBuilder &&
    parsedAmount > 0n &&
    title.trim().length > 0 &&
    titleLen <= 120 &&
    errors.length === 0

  function getDeliverBy(): bigint {
    if (useCustomDeadline && customDeadline) {
      return BigInt(Math.floor(new Date(customDeadline).getTime() / 1000))
    }
    return BigInt(Math.floor(Date.now() / 1000) + deadlineSecs)
  }

  function handleSubmit() {
    if (!contractAddress || !ready) return
    const deliverBy = getDeliverBy()
    writeContract({
      address: contractAddress,
      abi: ESCROW_ABI,
      functionName: 'createEscrow',
      args: [builder as `0x${string}`, deliverBy, BigInt(reviewSecs), title.trim()],
      value: parsedAmount,
      chainId: net.chain.id,
      maxFeePerGas: MIN_FEE,
    })
  }

  // On success, navigate to the new escrow
  if (isSuccess && receipt) {
    // Extract id from EscrowCreated log (first log from our contract)
    let newId: string | undefined
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === contractAddress?.toLowerCase()) {
        try {
          const decoded = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics })
          if (decoded && (decoded as { eventName?: string }).eventName === 'EscrowCreated') {
            const args = (decoded as { args?: { id?: bigint } }).args
            if (args?.id != null) { newId = args.id.toString(); break }
          }
        } catch {}
      }
    }
    toast.success('Escrow created!')
    reset()
    onNav('escrow', { id: newId ?? '0' })
    return null
  }

  const displayError = writeError
    ? writeError.message.includes('user rejected')
      ? null
      : writeError.message.split('\n')[0].slice(0, 120)
    : null

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <button
        onClick={() => onNav('home')}
        className="mb-6 flex items-center gap-1.5 text-sm font-medium"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 className="display mb-6 text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        New Escrow
      </h1>

      {!net.contractAddress && (
        <div
          className="mb-6 rounded-2xl px-4 py-3 text-sm"
          style={{ background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', color: 'var(--warning)' }}
        >
          Mainnet contract not deployed yet. Switch to Arc Testnet.
        </div>
      )}

      <div className="space-y-4">
        {/* Builder address */}
        <Field label="Builder address" hint="Who receives payment on completion">
          <input
            type="text"
            value={builder}
            onChange={(e) => setBuilder(e.target.value.trim())}
            placeholder="0x..."
            className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-300"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </Field>

        {/* Amount */}
        <Field label="Amount" hint="Native USDC (18 decimals on Arc)">
          <div className="relative">
            <input
              inputMode="decimal"
              type="text"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full rounded-xl py-2.5 pl-3 pr-16 text-xl font-bold tabular-nums outline-none focus:ring-2 ring-blue-300"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
              USDC
            </span>
          </div>
        </Field>

        {/* Title */}
        <Field label="Job title" hint={`${titleLen}/120 bytes`}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Landing page redesign"
            maxLength={180}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-300"
            style={{ background: 'var(--surface-muted)', border: `1px solid ${titleLen > 120 ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--ink)' }}
          />
        </Field>

        {/* Delivery deadline */}
        <Field label="Delivery deadline">
          <div className="flex flex-wrap gap-2 mb-2">
            {DEADLINE_PRESETS.map((p) => (
              <button
                key={p.secs}
                type="button"
                onClick={() => { setDeadlineSecs(p.secs); setUseCustomDeadline(false) }}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors"
                style={{
                  background: !useCustomDeadline && deadlineSecs === p.secs ? 'var(--accent)' : 'var(--surface-muted)',
                  color: !useCustomDeadline && deadlineSecs === p.secs ? 'white' : 'var(--ink-2)',
                  borderColor: !useCustomDeadline && deadlineSecs === p.secs ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustomDeadline(true)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors"
              style={{
                background: useCustomDeadline ? 'var(--accent)' : 'var(--surface-muted)',
                color: useCustomDeadline ? 'white' : 'var(--ink-2)',
                borderColor: useCustomDeadline ? 'var(--accent)' : 'var(--border)',
              }}
            >
              Custom
            </button>
          </div>
          {useCustomDeadline && (
            <input
              type="datetime-local"
              value={customDeadline}
              onChange={(e) => setCustomDeadline(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-300"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          )}
        </Field>

        {/* Review period */}
        <Field label="Review window" hint="Time for client to review after delivery">
          <div className="flex flex-wrap gap-2">
            {REVIEW_PRESETS.map((p) => (
              <button
                key={p.secs}
                type="button"
                onClick={() => setReviewSecs(p.secs)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors"
                style={{
                  background: reviewSecs === p.secs ? 'var(--accent)' : 'var(--surface-muted)',
                  color: reviewSecs === p.secs ? 'white' : 'var(--ink-2)',
                  borderColor: reviewSecs === p.secs ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Error list */}
        {errors.length > 0 && (
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e} className="text-xs font-medium" style={{ color: 'var(--danger)' }}>• {e}</li>
            ))}
          </ul>
        )}
        {displayError && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{displayError}</p>
        )}

        {/* Submit */}
        {!address ? (
          <div className="flex justify-center pt-2">
            <ConnectKitButton label="Connect wallet to continue" />
          </div>
        ) : wrongChain ? (
          <button
            onClick={() => switchChain({ chainId: net.chain.id })}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white"
            style={{ background: 'var(--warning)' }}
          >
            Switch to {net.chain.name}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!ready || isPending || isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? <><Loader2 size={14} className="animate-spin" /> Confirm in wallet…</> :
             isConfirming ? <><Loader2 size={14} className="animate-spin" /> Confirming…</> :
             'Fund escrow'}
          </button>
        )}
      </div>
    </main>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
