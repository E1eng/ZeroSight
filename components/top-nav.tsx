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
  const [navOpen, setNavOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const navBtnRef = useRef<HTMLButtonElement>(null);

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

  // Close the wallet dropdown on outside click / Escape.
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

  // Close the mobile nav drawer on outside click / Escape. The hamburger
  // button is excluded so its own onClick toggle isn't immediately undone.
  useEffect(() => {
    if (!navOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (navBtnRef.current && navBtnRef.current.contains(target)) return;
      if (navRef.current && !navRef.current.contains(target)) setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

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

  const linkClass = (href: string) =>
    `transition hover:text-white ${pathname === href ? "text-neon" : "text-zinc-400"}`;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0B0B]/95 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6 lg:px-12">
        <div className="flex min-w-0 items-center gap-2 sm:gap-8">
          {/* Hamburger — mobile only */}
          <button
            ref={navBtnRef}
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 md:hidden"
          >
            <span className="text-base leading-none">{navOpen ? "✕" : "☰"}</span>
          </button>

          <Link href="/" className="flex shrink-0 items-center gap-2">
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

          {/* Desktop nav links */}
          <div className="hidden items-center gap-6 text-sm font-bold tracking-wider md:flex">
            <Link href="/" className={linkClass("/")}>
              MARKETS
            </Link>
            <Link href="/portfolio" className={linkClass("/portfolio")}>
              PORTFOLIO
            </Link>
            <span className="cursor-not-allowed text-zinc-600" title="Coming soon">
              LEADERBOARDS · soon
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Loading state while Privy initialises */}
          {!ready && (
            <div className="h-9 w-24 animate-pulse rounded-lg border border-white/10 bg-white/5 sm:w-28" />
          )}

          {ready && !authenticated && (
            <button
              onClick={login}
              className="flex items-center gap-2 rounded-lg bg-neon px-3 py-2 text-xs font-bold tracking-wider text-black transition hover:bg-neon/90 sm:px-5 sm:text-sm"
            >
              <span className="text-sm leading-none">👛</span>
              <span>Connect<span className="hidden sm:inline">&nbsp;Wallet</span></span>
            </button>
          )}

          {ready && authenticated && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/10 sm:px-3 sm:text-sm"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    wrongNetwork ? "bg-amber-400" : "bg-emerald-400"
                  } shadow-[0_0_8px_currentColor]`}
                />
                <span className="max-w-[88px] truncate font-mono sm:max-w-none">
                  {walletDisplay ?? "Account"}
                </span>
                <span
                  className={`text-[10px] text-zinc-400 transition ${menuOpen ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-xl">
                  <div className="border-b border-white/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Connected wallet
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-zinc-200">
                      {primaryWallet}
                    </p>
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
      </div>

      {/* Mobile nav drawer */}
      {navOpen && (
        <div ref={navRef} className="border-t border-white/10 bg-[#0B0B0B] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1 text-sm font-bold tracking-wider">
            <Link
              href="/"
              className={`rounded-lg px-3 py-3 transition hover:bg-white/5 ${
                pathname === "/" ? "bg-white/5 text-neon" : "text-zinc-300"
              }`}
            >
              MARKETS
            </Link>
            <Link
              href="/portfolio"
              className={`rounded-lg px-3 py-3 transition hover:bg-white/5 ${
                pathname === "/portfolio" ? "bg-white/5 text-neon" : "text-zinc-300"
              }`}
            >
              PORTFOLIO
            </Link>
            <span className="cursor-not-allowed rounded-lg px-3 py-3 text-zinc-600">
              LEADERBOARDS · soon
            </span>
          </div>
        </div>
      )}
    </nav>
  );
}
