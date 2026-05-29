"use client";

import { useCallback, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import { MarketToggle } from "@/components/market-toggle";
import { PriceChart } from "@/components/price-chart";
import { MARKET_METADATA, type MarketKey } from "@/lib/markets";
import { createCdrClient, encryptPayload } from "@/lib/cdr";
import { placeBetOnChain } from "@/lib/market-contract";
import { STORY_CAIP_ID, STORY_CHAIN_ID } from "@/lib/story";

const directions = [
  { label: "Up", value: 1 },
  { label: "Down", value: 0 }
] as const;

export default function DashboardPage() {
  const [market, setMarket] = useState<MarketKey>("ip");
  const [direction, setDirection] = useState<(typeof directions)[number]["value"]>(directions[0].value);
  const [amount, setAmount] = useState(0.1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const activeMetadata = useMemo(() => MARKET_METADATA[market], [market]);
  const connectedWallet = useMemo(() => {
    if (!wallets.length) return null;
    return wallets.find((wallet) => wallet.chainId === STORY_CAIP_ID) ?? wallets[0];
  }, [wallets]);
  const primaryWallet = useMemo(() => {
    if (connectedWallet) return connectedWallet.address as `0x${string}`;
    if (!user) return null;
    if (user.wallet?.address) return user.wallet.address;
    const walletAccount = user.linkedAccounts?.find((account) => account.type === "wallet");
    if (!walletAccount || walletAccount.type !== "wallet") return null;
    return walletAccount.address ?? null;
  }, [connectedWallet, user]);
  const walletDisplay = useMemo(() => {
    if (!primaryWallet) return null;
    return `${primaryWallet.slice(0, 6)}…${primaryWallet.slice(-4)}`;
  }, [primaryWallet]);

  const handleBet = useCallback(async () => {
    if (!authenticated) {
      await login();
      return;
    }

    if (!walletsReady) {
      setStatusMessage("Wallet session is still loading. Please try again in a moment.");
      return;
    }

    const wallet = connectedWallet;
    if (!wallet) {
      setStatusMessage("No connected wallet detected. Link a wallet through the Privy modal first.");
      return;
    }

    if (amount <= 0) {
      setStatusMessage("Enter a positive stake amount before placing a bet.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Encrypting bet payload and uploading to Story CDR…");

    try {
      if (wallet.chainId !== STORY_CAIP_ID) {
        await wallet.switchChain(STORY_CHAIN_ID);
      }

      const walletAdapter = {
        address: wallet.address as `0x${string}`,
        getEthereumProvider: wallet.getEthereumProvider
      };

      const client = await createCdrClient(walletAdapter);

      const payloadBytes = new TextEncoder().encode(
        JSON.stringify({
          market,
          direction,
          amount,
          feed: activeMetadata.feedAddress,
          placedAt: Date.now()
        })
      );

      const result = await encryptPayload({
        client,
        walletAddress: walletAdapter.address,
        payload: payloadBytes
      });

      setStatusMessage(`Encrypted vault #${result.uuid}. Allocation tx: ${result.txHash}. Broadcasting bet…`);

      const betTx = await placeBetOnChain({
        wallet: walletAdapter,
        vaultId: result.uuid.toString(),
        category: activeMetadata.category,
        amount
      });

      setStatusMessage(`Encrypted vault #${result.uuid}. Bet tx: ${betTx}`);
    } catch (error) {
      console.error("Failed to encrypt bet", error);
      const message =
        error instanceof Error ? error.message : "Failed to encrypt bet. Please check console for details.";
      setStatusMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authenticated,
    login,
    walletsReady,
    connectedWallet,
    market,
    direction,
    amount,
    activeMetadata.feedAddress,
    activeMetadata.category
  ]);

  return (
    <main className="grid flex-1 gap-12 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <MarketToggle active={market} onChange={setMarket} />
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-zinc-400 backdrop-blur lg:block">
              Story CDR Shielded
            </div>
            {ready && (
              <div className="flex items-center gap-2">
                {walletDisplay && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                    {walletDisplay}
                  </span>
                )}
                <button
                  type="button"
                  onClick={authenticated ? logout : login}
                  className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-300 transition hover:border-electric hover:text-electric disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {authenticated ? "Sign Out" : "Sign In"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span>{activeMetadata.label} market</span>
            <span className="font-mono text-zinc-300">Feed: {activeMetadata.feedAddress}</span>
          </div>
          <div className="mt-6">
            <PriceChart market={market} />
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Encrypted Order Ticket</h2>
          <p className="text-sm text-zinc-400">
            Enter your stake and directional bias. We’ll encrypt your payload locally before broadcasting to ZeroSight.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block text-xs uppercase tracking-[0.3em] text-zinc-500">Bet Amount</label>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 focus-within:border-electric focus-within:shadow-glow">
            <div className="flex items-center justify-between">
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setAmount(Number.isFinite(nextValue) ? nextValue : 0);
                }}
                className="w-full bg-transparent text-2xl font-semibold text-zinc-100 focus:outline-none disabled:opacity-50"
                disabled={!authenticated || isSubmitting}
              />
              <span className="text-sm uppercase tracking-[0.2em] text-zinc-500">STORY</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-zinc-500">Direction</span>
          <div className="grid grid-cols-2 gap-3">
            {directions.map((item) => {
              const isActive = direction === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDirection(item.value)}
                  disabled={!authenticated || isSubmitting}
                  className={`rounded-2xl border px-4 py-5 text-lg font-semibold transition ${
                    isActive
                      ? item.value === 1
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-white/10 bg-black/40 text-zinc-300 hover:border-white/20"
                  } ${authenticated ? "" : "opacity-60"}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleBet}
          disabled={!ready || isSubmitting}
          className="mt-auto rounded-2xl border border-electric/40 bg-electric px-6 py-4 text-lg font-semibold text-night-900 shadow-glow transition hover:border-electric hover:bg-electric/90 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/10 disabled:text-zinc-500"
        >
          Encrypt &amp; Place Bet 🔒
        </button>

        {statusMessage && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-200">
            <p>{statusMessage}</p>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-500">
          <p>
            Your bet payload remains hidden until resolution. Winners will supply decrypted payloads to claim their share of
            the pool. Support for sports and politics markets will roll out via future upgrades.
          </p>
        </div>
      </aside>
    </main>
  );
}
