import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  disabled?: boolean
  isPending?: boolean
  isConfirming?: boolean
  disabledReason?: string
  variant?: 'primary' | 'danger' | 'ghost'
  className?: string
  children: ReactNode
}

export function TxButton({
  onClick,
  disabled,
  isPending,
  isConfirming,
  disabledReason,
  variant = 'primary',
  className = '',
  children,
}: Props) {
  const bg =
    variant === 'primary'
      ? 'var(--accent)'
      : variant === 'danger'
        ? 'var(--danger)'
        : 'transparent'
  const color = variant === 'ghost' ? 'var(--ink-2)' : 'white'
  const border = variant === 'ghost' ? '1px solid var(--border-strong)' : 'none'
  const busy = isPending || isConfirming
  const off = disabled || busy

  return (
    <div className="relative w-full">
      <button
        onClick={onClick}
        disabled={off}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
        style={{ background: bg, color, border }}
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : children}
      </button>
      {disabled && !busy && disabledReason && (
        <p className="mt-1 text-center text-xs" style={{ color: 'var(--muted)' }}>
          {disabledReason}
        </p>
      )}
    </div>
  )
}
