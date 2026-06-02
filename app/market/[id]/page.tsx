"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";

import { PriceChart } from "@/components/price-chart";
import { MarketStatusDisplay } from "@/components/market-status";
import { MARKET_METADATA, type MarketKey, MARKET_LIST, getTargetPrice, formatTargetPrice } from "@/lib/markets";
import { createCdrClient, encryptPayload } from "@/lib/cdr";
import { placeBetOnChain, getMarketState } from "@/lib/market-contract";
import { STORY_CAIP_ID, STORY_CHAIN_ID } from "@/lib/story";
import { useBets } from "@/hooks/use-bets";
import { useToast } from "@/components/toast";
import { AssetIcon } from "@/components/asset-icon";

const directions = [
  { label: "Up", value: 1 },
  { label: "Down", value: 0 }
] as const;

export default function MarketPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const market = (MARKET_LIST.includes(params.id as MarketKey) ? params.id : "ip") as MarketKey;
  
  const activeMetadata = useMemo(() => MARKET_METADATA[market], [market]);
  const cleanLabel = useMemo(() => activeMetadata.label.replace(" (Daily)", ""), [activeMetadata.label]);

  // Fetch historical price trend line (staleTime 60s is fine for chart)
  const { data: priceData } = useQuery<{ cached: boolean; data: { prices: [number, number][] } }>({
    queryKey: ["prices", market],
    queryFn: async () => {
      const res = await fetch(`/api/prices?market=${market}`);
      if (!res.ok) {
        throw new Error("Failed to load prices");
      }
      return res.json();
    },
    staleTime: 60_000
  });

  // Fetch real-time Redstone Oracle price feed (polls every 5s)
  const { data: oraclePriceData } = useQuery<{ price: number; timestamp: number }>({
    queryKey: ["oracle-price", cleanLabel],
    queryFn: async () => {
      const res = await fetch(`/api/oracle-price?symbol=${cleanLabel}`);
      if (!res.ok) {
        throw new Error("Failed to load oracle price");
      }
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 4000
  });

  const latestPrice = oraclePriceData?.price ?? null;

  const latestPriceFormatted = useMemo(() => {
    if (latestPrice === null) return "Loading…";
    if (activeMetadata.assetIndex === 0 || activeMetadata.assetIndex === 3) {
      return `$${latestPrice.toFixed(4)}`;
    }
    return `$${latestPrice.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }, [latestPrice, activeMetadata.assetIndex]);

  const [showDetails, setShowDetails] = useState(false);
  
  const [direction, setDirection] = useState<(typeof directions)[number]["value"]>(
    directions[0].value
  );
  const [amount, setAmount] = useState(0.1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [marketState, setMarketState] = useState<{ status: number; openedAt: number; openingPrice: number; deadline: number; totalPool: bigint }>({
    status: 0,
    openedAt: 0,
    openingPrice: 0,
    deadline: 0,
    totalPool: BigInt(0)
  });

  const [currentTime, setCurrentTime] = useState<number>(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isClosed = marketState.status !== 0 || (marketState.deadline > 0 && currentTime >= marketState.deadline);

  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const toast = useToast();

  // Read direction query param if coming from card click
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dir = urlParams.get("direction");
    if (dir === "up") setDirection(1);
    if (dir === "down") setDirection(0);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function checkStatus() {
      try {
        const state = await getMarketState(activeMetadata.assetIndex);
        setMarketState({ 
          status: state.status as number, 
          openedAt: state.openedAt,
          openingPrice: state.openingPrice || 0,
          deadline: state.deadline || 0,
          totalPool: state.totalPool ?? BigInt(0)
        });
      } catch (e) {}
    }
    checkStatus();
    interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [activeMetadata.assetIndex]);

  const connectedWallet = useMemo(() => {
    if (!wallets.length) return null;
    return wallets.find((wallet: any) => wallet.chainId === STORY_CAIP_ID) ?? wallets[0];
  }, [wallets]);
  const primaryWallet = useMemo(() => {
    if (connectedWallet) return connectedWallet.address as `0x${string}`;
    if (!user) return null;
    if (user.wallet?.address) return user.wallet.address;
    const walletAccount = user.linkedAccounts?.find((account: any) => account.type === "wallet");
    if (!walletAccount || walletAccount.type !== "wallet") return null;
    return walletAccount.address ?? null;
  }, [connectedWallet, user]);
  const { addBet } = useBets(primaryWallet ?? undefined);
  const walletDisplay = useMemo(() => {
    if (!primaryWallet) return null;
    return `${primaryWallet.slice(0, 6)}…${primaryWallet.slice(-4)}`;
  }, [primaryWallet]);

  // True when a wallet is connected but not on the Story Aeneid chain.
  const wrongNetwork = useMemo(() => {
    if (!authenticated || !connectedWallet) return false;
    return connectedWallet.chainId !== STORY_CAIP_ID;
  }, [authenticated, connectedWallet]);

  const handleSwitchNetwork = useCallback(async () => {
    if (!connectedWallet) return;
    try {
      await connectedWallet.switchChain(STORY_CHAIN_ID);
    } catch (err) {
      toast.error("Could not switch network. Please switch to Story Aeneid in your wallet.");
    }
  }, [connectedWallet, toast]);

  const handleBet = useCallback(async () => {
    if (isClosed) {
      setStatusMessage("Market is closed for betting.");
      return;
    }
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
      setStatusMessage(
        "No connected wallet detected. Link a wallet through the Privy modal first."
      );
      return;
    }

    if (amount < 0.01) {
      setStatusMessage("Minimum bet is 0.01 IP.");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Encrypting bet payload and uploading to Story CDR…");
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
          bettor: walletAdapter.address.toLowerCase(),
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

      toast.update(
        toastId,
        "loading",
        `Vault #${result.uuid} secured. Confirm the bet in your wallet…`
      );
      setStatusMessage(`Secured bet in encrypted vault #${result.uuid}. Broadcasting bet…`);

      const betTx = await placeBetOnChain({
        wallet: walletAdapter,
        vaultId: result.uuid.toString(),
        assetIndex: activeMetadata.assetIndex,
        amount
      });

      addBet({
        vaultId: result.uuid.toString(),
        market,
        direction,
        amount,
        placedAt: Date.now(),
        txHash: betTx
      });

      toast.update(
        toastId,
        "success",
        `Bet placed 🔒 — encrypted vault #${result.uuid}. Tx ${betTx.slice(0, 10)}…`
      );
      setStatusMessage(`Encrypted vault #${result.uuid}. Bet tx: ${betTx}`);
    } catch (error) {
      console.error("Failed to encrypt bet", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to encrypt bet. Please check console for details.";
      toast.update(toastId, "error", message);
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
    activeMetadata.assetIndex,
    addBet,
    toast
  ]);

  const targetPrice = marketState.openingPrice ? getTargetPrice(activeMetadata.assetIndex, marketState.openingPrice) : 0;
  const targetPriceFormatted = targetPrice > 0 ? formatTargetPrice(activeMetadata.assetIndex, targetPrice) : "";

  // Blind parimutuel: per-side shares are encrypted, so we can only bound the
  // payout. Min ≈ your stake back (everyone on your side); max ≈ the whole pool
  // (you're the lone winner). We surface the max as an upper bound + the pool
  // size after your stake so the bet feels less blind.
  const payoutPreview = useMemo(() => {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const poolNow = Number(formatEther(marketState.totalPool));
    const poolAfter = poolNow + amount;
    return {
      poolAfter,
      maxPayout: poolAfter,
      maxMultiple: amount > 0 ? poolAfter / amount : 0
    };
  }, [amount, marketState.totalPool]);

  const title = targetPriceFormatted
    ? `Will ${cleanLabel} close above ${targetPriceFormatted}?`
    : `${cleanLabel} direction ${activeMetadata.durationLabel === "Hourly" ? "for this hour?" : "for today?"}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8 lg:px-12">
      <div className="mb-8">
        <Link href="/" className="text-sm font-semibold text-zinc-400 transition hover:text-neon">
          ← Back to Markets
        </Link>
      </div>

      {wrongNetwork && (
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <p>
              You&apos;re connected to the wrong network. Switch to{" "}
              <strong>Story Aeneid</strong> to place a bet.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSwitchNetwork}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-amber-400"
          >
            Switch to Story Aeneid
          </button>
        </div>
      )}

      <div className="mb-10 flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1A1A] shadow-inner">
              <AssetIcon symbol={cleanLabel} size={40} />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold text-white">
                {title}
              </h1>
              <div className="flex items-center gap-3 text-xs font-bold">
                {(() => {
                  const s = marketState.status;
                  if (s === 0) {
                    return <span className="rounded bg-neon px-2 py-1 text-black">ACTIVE</span>;
                  }
                  if (s === 1) {
                    return <span className="rounded bg-amber-500 px-2 py-1 text-black">LOCKED</span>;
                  }
                  if (s === 2) {
                    return <span className="rounded bg-zinc-700 px-2 py-1 text-zinc-200">RESOLVED</span>;
                  }
                  return <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-400">…</span>;
                })()}
                <span className="text-zinc-500">{activeMetadata.durationLabel} Prediction Cycle</span>
              </div>
            </div>
          </div>
          <button className="text-sm font-semibold text-zinc-400 hover:text-white">
            🔗 Share
          </button>
        </div>

        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white"
          >
            <span className="text-xs">{showDetails ? "▲" : "▼"}</span> {showDetails ? "Hide" : "Show"} Details
          </button>
          
          {showDetails && (
            <div className="mt-4 rounded-2xl border border-white/5 bg-[#141414] p-6">
              {(() => {
                const pctByIndex: Record<number, string> = {
                  0: "0.75%",
                  1: "0.25%",
                  2: "0.40%",
                  3: "4.00%",
                  4: "1.50%",
                  5: "2.50%"
                };
                const targetPct = pctByIndex[activeMetadata.assetIndex] ?? "—";
                const createdLabel =
                  marketState.openedAt > 0
                    ? new Date(marketState.openedAt * 1000).toLocaleString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Pending open";
                const cards = [
                  {
                    icon: "🎯",
                    label: "Resolution Rule",
                    value: `UP if +${targetPct}`,
                    hint: `${cleanLabel} must rise at least ${targetPct} vs the opening price, else DOWN.`
                  },
                  {
                    icon: "🏁",
                    label: "Opening Price",
                    value:
                      marketState.openingPrice > 0
                        ? formatTargetPrice(activeMetadata.assetIndex, marketState.openingPrice / 1e8)
                        : "Pending",
                    hint: "Snapshot taken when the round opened."
                  },
                  {
                    icon: "📈",
                    label: "Target Price (UP)",
                    value: targetPriceFormatted || "Pending",
                    hint: "Win threshold for UP at resolution."
                  },
                  {
                    icon: "🛰",
                    label: "Resolution Source",
                    value: "Redstone Oracle",
                    hint: "Signed price feed on Story Aeneid testnet."
                  },
                  {
                    icon: "⏱",
                    label: "Cycle",
                    value: activeMetadata.durationLabel,
                    hint:
                      activeMetadata.durationLabel === "Hourly"
                        ? "Closes at minute 50, resolves at minute 60."
                        : "Closes at 23:50 UTC, resolves at 00:00."
                  },
                  {
                    icon: "📅",
                    label: "Created",
                    value: createdLabel,
                    hint: "When this round opened for betting."
                  }
                ];
                return (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cards.map((card) => (
                        <div
                          key={card.label}
                          className="rounded-xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-white/10"
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            <span className="text-sm">{card.icon}</span>
                            {card.label}
                          </div>
                          <p className="font-mono text-sm font-semibold text-zinc-100">{card.value}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{card.hint}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 break-all font-mono text-[11px] text-zinc-600">
                      Feed: {activeMetadata.feedAddress}
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      
      <main className="grid flex-1 gap-12 lg:grid-cols-[1.2fr_1fr] min-w-0">
        <section className="space-y-6 min-w-0">
          <div className="rounded-3xl border border-white/5 bg-[#141414] p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-zinc-200">
                  {cleanLabel}/USDT <span className="text-neon animate-pulse">● LIVE</span>
                </span>
                <span className="text-3xl font-mono font-bold text-white tracking-tight mt-1">
                  {latestPriceFormatted}
                </span>
              </div>
              <MarketStatusDisplay assetIndex={activeMetadata.assetIndex} />
            </div>

            {marketState.openingPrice > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-xs font-semibold">
                <div>
                  <span className="block text-zinc-500 uppercase tracking-wider mb-1">Opening Price</span>
                  <span className="font-mono text-sm text-zinc-300">
                    {formatTargetPrice(activeMetadata.assetIndex, marketState.openingPrice / 1e8)}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 uppercase tracking-wider mb-1">Target Price (UP)</span>
                  <span className="font-mono text-sm text-neon">
                    &ge; {targetPriceFormatted}
                  </span>
                </div>
              </div>
            )}

            <div>
              <PriceChart market={market} openedAt={marketState.openedAt} targetPrice={targetPrice} />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-[#141414] p-6 min-w-0">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Encrypted Order Ticket</h2>
            <p className="text-sm text-zinc-400">
              Enter your stake and directional bias. We’ll encrypt your payload locally before
              broadcasting to ZeroSight.
            </p>
          </div>

          <div className="space-y-4">
            <label className="block text-xs uppercase tracking-[0.3em] text-zinc-500">
              Bet Amount
            </label>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 focus-within:border-neon">
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={amount}
                  onChange={(event: any) => {
                    const nextValue = Number(event.target.value);
                    setAmount(Number.isFinite(nextValue) ? nextValue : 0);
                  }}
                  className="w-full bg-transparent text-2xl font-semibold text-zinc-100 focus:outline-none disabled:opacity-50"
                  disabled={!authenticated || isSubmitting || isClosed}
                />
                <span className="text-sm uppercase tracking-[0.2em] text-zinc-500">IP</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <span className="block text-xs uppercase tracking-[0.3em] text-zinc-500">
              Direction
            </span>
            <div className="grid grid-cols-2 gap-3">
              {directions.map((item) => {
                const isActive = direction === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDirection(item.value)}
                    disabled={!authenticated || isSubmitting || isClosed}
                    className={`rounded-2xl border px-4 py-5 text-lg font-semibold transition ${
                      isActive
                        ? item.value === 1
                          ? "border-neon bg-neon/10 text-neon"
                          : "border-rose-500 bg-rose-500/10 text-rose-500"
                        : "border-white/10 bg-[#0B0B0B] text-zinc-300 hover:border-white/20"
                    } ${authenticated ? "" : "opacity-60"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {payoutPreview && !isClosed && (
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-[0.2em] text-zinc-500">Est. max payout</span>
                <span className="font-mono text-sm font-semibold text-neon">
                  {payoutPreview.maxPayout.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })}{" "}
                  IP
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Parimutuel upper bound based on the {payoutPreview.poolAfter.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4
                })}{" "}
                IP pool after your stake. Actual payout depends on how the pool splits at
                resolution.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleBet}
            disabled={!ready || isSubmitting || isClosed}
            className="mt-auto rounded-2xl bg-neon px-6 py-4 text-lg font-bold text-black transition hover:bg-neon/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {isClosed ? "Market Closed" : "Encrypt & Place Bet 🔒"}
          </button>

          {statusMessage && (
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 text-xs text-zinc-200 break-all">
              <p>{statusMessage}</p>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 text-xs text-zinc-500 break-words">
            <p>
              Your bet payload remains hidden until resolution. Winners will supply decrypted
              payloads to claim their share of the pool. Support for sports and politics markets
              will roll out via future upgrades.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
