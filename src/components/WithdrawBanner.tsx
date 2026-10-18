import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { ArrowDownToLine, Loader2 } from 'lucide-react'
import { NETWORKS, ESCROW_ABI, type NetworkKey } from '../config/networks'
import { fmtUsdc } from '../lib/utils'
import { toast } from 'sonner'

interface Props {
  networkKey: NetworkKey
}

export function WithdrawBanner({ networkKey }: Props) {
  const { address } = useAccount()
  const net = NETWORKS[networkKey]
  const contractAddress = net.contractAddress as `0x${string}` | undefined

  const { data: pending } = useReadContract({
    address: contractAddress || undefined,
    abi: ESCROW_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: net.chain.id,
    query: { enabled: !!address && !!contractAddress, refetchInterval: 10_000 },
  })

  const {
    writeContract,
    data: hash,
    isPending,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  if (isSuccess) {
    toast.success('Withdrawal confirmed!')
    reset()
  }

  const amount = (pending as bigint | undefined) ?? 0n
  if (amount === 0n || !contractAddress) return null

  function handleWithdraw() {
    if (!contractAddress) return
    writeContract({
      address: contractAddress,
      abi: ESCROW_ABI,
      functionName: 'withdraw',
      chainId: net.chain.id,
    })
  }

  return (
    <div
      className="mx-auto mt-3 max-w-5xl px-4"
    >
      <div
        className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
        style={{
          background: 'rgba(26,128,71,0.08)',
          border: '1px solid rgba(26,128,71,0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          <ArrowDownToLine size={16} style={{ color: 'var(--success)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {fmtUsdc(amount)} USDC ready to withdraw
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Funds credited to your address
          </span>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={isPending || isConfirming}
          className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--success)' }}
        >
          {isPending || isConfirming ? (
            <><Loader2 size={13} className="animate-spin" /> {isPending ? 'Confirm…' : 'Confirming…'}</>
          ) : (
            'Withdraw'
          )}
        </button>
      </div>
    </div>
  )
}
