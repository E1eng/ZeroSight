import { formatEther } from "viem";
import type { LocalBet } from "@/hooks/use-bets";

export function MyBets({ bets }: { bets: LocalBet[] }) {
  if (bets.length === 0) {
    return (
      <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
        <h2 className="mb-4 text-xl font-semibold text-zinc-100">My Encrypted Bets</h2>
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
          <p className="text-sm text-zinc-500">You have no active bets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
      <h2 className="mb-4 text-xl font-semibold text-zinc-100">My Encrypted Bets</h2>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-4 py-3 font-medium">Your Choice</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Vault ID (Encrypted)</th>
              <th className="px-4 py-3 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-black/20">
            {bets.map((bet, i) => (
              <tr key={i} className="transition-colors hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-zinc-200">{bet.market.toUpperCase()}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      bet.direction === 1
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {bet.direction === 1 ? "UP" : "DOWN"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-zinc-300">{bet.amount} STORY</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-zinc-500">
                      {bet.vaultId.substring(0, 12)}...
                    </span>
                    <a
                      href={`https://aeneid.storyscan.xyz/tx/${bet.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-electric hover:underline text-xs"
                    >
                      ↗ Tx
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-zinc-500">
                  {new Date(bet.placedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
