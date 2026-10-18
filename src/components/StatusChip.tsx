import { type EscrowStatus, STATUS_LABEL, STATUS_COLOR } from '../lib/utils'

interface Props {
  status: EscrowStatus
  small?: boolean
}

export function StatusChip({ status, small }: Props) {
  const label = STATUS_LABEL[status]
  const color = STATUS_COLOR[status]
  const bg = color + '18'
  const size = small ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tabular-nums tracking-wide ${size}`}
      style={{ color, background: bg, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  )
}
