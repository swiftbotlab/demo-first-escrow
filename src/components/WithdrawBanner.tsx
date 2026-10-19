import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { createPublicClient, http } from 'viem'
import { ArrowDownToLine, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { NETWORKS, ESCROW_ABI, buildTxUrl, type NetworkKey } from '../config/networks'
import { fmtUsdc } from '../lib/utils'

const MIN_FEE = 20_000_000_000n // 20 gwei floor

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
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Show confirmation banner for a few seconds then reset — no setState-in-render
  const amount = (pending as bigint | undefined) ?? 0n
  if (!isSuccess && amount === 0n && !isConfirming) return null
  if (!contractAddress) return null

  async function handleWithdraw() {
    if (!contractAddress) return
    let maxFeePerGas: bigint
    try {
      const publicClient = createPublicClient({ chain: net.chain, transport: http(net.chain.rpcUrls.default.http[0]) })
      const est = await publicClient.estimateFeesPerGas()
      const estimated = est.maxFeePerGas ?? 0n
      maxFeePerGas = estimated > MIN_FEE ? estimated : MIN_FEE
    } catch {
      maxFeePerGas = MIN_FEE
    }
    writeContract({
      address: contractAddress,
      abi: ESCROW_ABI,
      functionName: 'withdraw',
      chainId: net.chain.id,
      maxFeePerGas,
    })
  }

  return (
    <div className="mx-auto mt-3 max-w-5xl px-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
        style={{
          background: isSuccess ? 'rgba(26,128,71,0.06)' : 'rgba(26,128,71,0.08)',
          border: '1px solid rgba(26,128,71,0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          {isSuccess
            ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            : <ArrowDownToLine size={16} style={{ color: 'var(--success)' }} />
          }
          <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {isSuccess ? 'Withdrawal confirmed' : `${fmtUsdc(amount)} USDC ready to withdraw`}
          </span>
          {!isSuccess && (
            <span className="text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>
              Funds credited to your address
            </span>
          )}
          {isSuccess && hash && (
            <a
              href={buildTxUrl(networkKey, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              Explorer <ExternalLink size={10} />
            </a>
          )}
        </div>
        {!isSuccess && (
          <button
            onClick={() => { void handleWithdraw() }}
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
        )}
      </div>
    </div>
  )
}
