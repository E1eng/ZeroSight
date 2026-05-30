"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { PriceChart } from "@/components/price-chart";
import { MarketStatusDisplay } from "@/components/market-status";
import { MARKET_METADATA, type MarketKey, MARKET_LIST } from "@/lib/markets";
import { createCdrClient, encryptPayload } from "@/lib/cdr";
import { placeBetOnChain, getMarketState } from "@/lib/market-contract";
import { STORY_CAIP_ID, STORY_CHAIN_ID } from "@/lib/story";
import { useBets } from "@/hooks/use-bets";
import { MyBets } from "@/components/my-bets";

const directions = [
  { label: "Up", value: 1 },
  { label: "Down", value: 0 }
] as const;

export default function MarketPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const market = (MARKET_LIST.includes(params.id as MarketKey) ? params.id : "ip") as MarketKey;
  
  const [showDetails, setShowDetails] = useState(true);
  
  const [direction, setDirection] = useState<(typeof directions)[number]["value"]>(
    directions[0].value
  );
  const [amount, setAmount] = useState(0.1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<number>(0);
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

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
        const state = await getMarketState();
        setMarketStatus(state.status as number);
      } catch (e) {}
    }
    checkStatus();
    interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeMetadata = useMemo(() => MARKET_METADATA[market], [market]);
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
  const { localBets, addBet } = useBets(primaryWallet ?? undefined);
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
      setStatusMessage(
        "No connected wallet detected. Link a wallet through the Privy modal first."
      );
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

      setStatusMessage(
        `Encrypted vault #${result.uuid}. Allocation tx: ${result.txHash}. Broadcasting bet…`
      );

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

      setStatusMessage(`Encrypted vault #${result.uuid}. Bet tx: ${betTx}`);
    } catch (error) {
      console.error("Failed to encrypt bet", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to encrypt bet. Please check console for details.";
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
    addBet
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8 lg:px-12">
      <div className="mb-8">
        <Link href="/" className="text-sm font-semibold text-zinc-400 transition hover:text-neon">
          ← Back to Markets
        </Link>
      </div>

      <div className="mb-10 flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1A1A] text-3xl font-bold text-white shadow-inner">
              {activeMetadata.label === "IP" ? "IP" : activeMetadata.label === "BTC" ? "₿" : "Ξ"}
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold text-white">
                {activeMetadata.label} direction for the next 24h?
              </h1>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="rounded bg-neon px-2 py-1 text-black">ACTIVE</span>
                <span className="text-zinc-400">CRYPTO</span>
                <span className="flex items-center gap-1 text-blue-400">
                  <span>⚙</span> Auto-Resolution
                </span>
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
            <div className="mt-4 flex flex-col gap-4 rounded-xl bg-[#141414] p-6 text-sm text-zinc-400">
              <p>24-hour binary market.</p>
              
              <p>
                Resolves UP if the {activeMetadata.label} price increases above current price at resolution time, 
                or DOWN if at or below.
              </p>
              
              <ul className="list-inside list-disc space-y-1">
                <li>UP wins if price &gt; current</li>
                <li>DOWN wins if price ≤ current</li>
              </ul>
              
              <p>
                Resolution source: Redstone Oracles on Story Aeneid Testnet ({activeMetadata.feedAddress}).<br />
                Price data cryptographically signed by the Redstone Decentralized Oracle Network.
              </p>
              
              <div className="mt-2 flex items-center gap-16">
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-500">MARKET ID</p>
                  <p className="font-mono text-zinc-300">0x00000000000000000000</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-500">CREATED</p>
                  <p className="text-zinc-300">Sat, May 30, 09:50 PM</p>
                </div>
              </div>
              
              <div className="mt-2">
                <span className="rounded bg-white/10 px-2 py-1 text-xs font-bold text-zinc-300">
                  {activeMetadata.label}
                </span>
              </div>
              
              <div className="mt-2 flex items-center gap-2 text-blue-400">
                <span>⏱</span> Time-weighted betting enabled
              </div>
            </div>
          )}
        </div>
      </div>
      
      <main className="grid flex-1 gap-12 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-white/5 bg-[#141414] p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-zinc-200">
                  {activeMetadata.label}/USD <span className="text-neon">● LIVE</span>
                </span>
              </div>
              <MarketStatusDisplay />
            </div>
            <div>
              <PriceChart market={market} />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-[#141414] p-6">
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
                  disabled={!authenticated || isSubmitting || marketStatus !== 0}
                />
                <span className="text-sm uppercase tracking-[0.2em] text-zinc-500">STORY</span>
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
                    disabled={!authenticated || isSubmitting || marketStatus !== 0}
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

          <button
            type="button"
            onClick={handleBet}
            disabled={!ready || isSubmitting || marketStatus !== 0}
            className="mt-auto rounded-2xl bg-neon px-6 py-4 text-lg font-bold text-black transition hover:bg-neon/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {marketStatus !== 0 ? "Market Closed" : "Encrypt & Place Bet 🔒"}
          </button>

          {statusMessage && (
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 text-xs text-zinc-200">
              <p>{statusMessage}</p>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 text-xs text-zinc-500">
            <p>
              Your bet payload remains hidden until resolution. Winners will supply decrypted
              payloads to claim their share of the pool. Support for sports and politics markets
              will roll out via future upgrades.
            </p>
          </div>
        </aside>
      </main>
      <div className="mt-12 w-full">
        <MyBets bets={localBets} />
      </div>
    </div>
  );
}
