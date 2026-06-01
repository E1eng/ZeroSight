"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo } from "react";

import { STORY_CAIP_ID } from "@/lib/story";

export function TopNav() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

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

  return (
    <nav className="flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#0B0B0B] px-6 lg:px-12">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon">
            <span className="font-bold text-black text-base leading-none">Z</span>
          </div>
          <span className="hidden text-sm font-bold tracking-[0.2em] text-zinc-100 sm:block">
            ZEROSIGHT
          </span>
        </Link>

        <div className="hidden items-center gap-6 text-sm font-bold tracking-wider text-zinc-400 lg:flex">
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
          <span
            className="cursor-not-allowed text-zinc-600"
            title="Coming soon"
          >
            LEADERBOARDS · soon
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {ready && (
          <>
            {authenticated && walletDisplay && (
              <span className="hidden rounded-full border border-neon/30 bg-neon/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-neon sm:block">
                {walletDisplay}
              </span>
            )}
            <button
              onClick={authenticated ? logout : login}
              className="rounded-lg bg-neon px-5 py-2 text-sm font-bold tracking-wider text-black transition hover:bg-neon/90"
            >
              {authenticated ? "SIGN OUT" : "LOGIN"}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
