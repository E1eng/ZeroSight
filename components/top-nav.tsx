"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState } from "react";

import { STORY_CAIP_ID, STORY_CHAIN_ID } from "@/lib/story";

export function TopNav() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const connectedWallet = useMemo(() => {
    if (!wallets.length) return null;
    return wallets.find((w: any) => w.chainId === STORY_CAIP_ID) ?? wallets[0];
  }, [wallets]);

  const primaryWallet = useMemo(() => {
    if (connectedWallet) return connectedWallet.address as `0x${string}`;
    if (!user) return null;
    if (user.wallet?.address) return user.wallet.address;
    const acct = user.linkedAccounts?.find((a: any) => a.type === "wallet");
    if (!acct || acct.type !== "wallet") return null;
    return (acct as any).address ?? null;
  }, [connectedWallet, user]);

  const walletDisplay = useMemo(() => {
    if (!primaryWallet) return null;
    return `${primaryWallet.slice(0, 6)}…${primaryWallet.slice(-4)}`;
  }, [primaryWallet]);

  // True when connected but the active wallet isn't on the Story chain.
  const wrongNetwork = useMemo(() => {
    if (!authenticated || !connectedWallet) return false;
    return connectedWallet.chainId !== STORY_CAIP_ID;
  }, [authenticated, connectedWallet]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const copyAddress = async () => {
    if (!primaryWallet) return;
    try {
      await navigator.clipboard.writeText(primaryWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const switchNetwork = async () => {
    if (!connectedWallet) return;
    try {
      await connectedWallet.switchChain(STORY_CHAIN_ID);
    } catch {
      /* user rejected — ignore */
    }
  };

  return (
    <nav className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#0B0B0B]/95 px-4 backdrop-blur-md sm:px-6 lg:px-12">
      <div className="flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/assets/ZeroSight.png"
            alt="ZeroSight"
            width={32}
            height={32}
            priority
            className="h-8 w-8 rounded-lg"
          />
          <span className="text-sm font-bold tracking-[0.2em] text-zinc-100">ZEROSIGHT</span>
        </Link>

        <div className="flex items-center gap-4 text-xs font-bold tracking-wider text-zinc-400 sm:gap-6 sm:text-sm">
          <Link
            href="/"
            className={`transition hover:text-white ${pathname === "/" ? "text-neon" : ""}`}
          >
            MARKETS
          </Link>
          <Link
            href="/portfolio"
            className={`transition hover:text-white ${
              pathname === "/portfolio" ? "text-neon" : ""
            }`}
          >
            PORTFOLIO
          </Link>
          <span className="hidden cursor-not-allowed text-zinc-600 lg:inline" title="Coming soon">
            LEADERBOARDS · soon
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Loading state while Privy initialises */}
        {!ready && (
          <div className="h-9 w-28 animate-pulse rounded-lg border border-white/10 bg-white/5" />
        )}

        {ready && !authenticated && (
          <button
            onClick={login}
            className="flex items-center gap-2 rounded-lg bg-neon px-4 py-2 text-xs font-bold tracking-wider text-black transition hover:bg-neon/90 sm:px-5 sm:text-sm"
          >
            <span className="text-sm leading-none">👛</span>
            Connect Wallet
          </button>
        )}

        {ready && authenticated && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/10 sm:text-sm"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  wrongNetwork ? "bg-amber-400" : "bg-emerald-400"
                } shadow-[0_0_8px_currentColor]`}
              />
              <span className="font-mono">{walletDisplay ?? "Account"}</span>
              <span className={`text-[10px] text-zinc-400 transition ${menuOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-xl">
                <div className="border-b border-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Connected wallet
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-200">{primaryWallet}</p>
                </div>

                {wrongNetwork && (
                  <button
                    onClick={() => {
                      switchNetwork();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold text-amber-300 transition hover:bg-amber-500/10"
                  >
                    ⚠️ Switch to Story Aeneid
                  </button>
                )}

                <button
                  onClick={copyAddress}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                >
                  {copied ? "✅ Copied!" : "📋 Copy address"}
                </button>

                {primaryWallet && (
                  <a
                    href={`https://aeneid.storyscan.xyz/address/${primaryWallet}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                  >
                    ↗ View on explorer
                  </a>
                )}

                <button
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-white/5 px-4 py-3 text-left text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                >
                  ⏏ Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
