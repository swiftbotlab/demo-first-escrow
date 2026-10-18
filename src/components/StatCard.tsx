interface Props {
  label: string
  value: string
  sub?: string
}
export function StatCard({ label, value, sub }: Props) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="display mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>}
    </div>
  )
}
