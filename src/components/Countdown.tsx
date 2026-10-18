import { useState, useEffect } from 'react'
import { fmtDuration, nowSec } from '../lib/utils'

interface Props {
  targetSec: bigint
  label?: string
  expiredLabel?: string
  className?: string
}

export function Countdown({ targetSec, label, expiredLabel = 'Expired', className }: Props) {
  const [remaining, setRemaining] = useState<bigint>(targetSec - nowSec())

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(targetSec - nowSec())
    }, 1000)
    return () => clearInterval(id)
  }, [targetSec])

  if (remaining <= 0n) {
    return (
      <span className={className} style={{ color: 'var(--danger)' }}>
        {label ? `${label}: ` : ''}{expiredLabel}
      </span>
    )
  }

  return (
    <span className={className} style={{ color: 'var(--ink-2)' }}>
      {label ? `${label}: ` : ''}<span className="tabular-nums font-semibold">{fmtDuration(remaining)}</span>
    </span>
  )
}
