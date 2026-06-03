import Link from "next/link";
import Image from "next/image";

const YEAR = new Date().getFullYear();

const LINKS: { heading: string; items: { label: string; href: string; external?: boolean }[] }[] = [
  {
    heading: "Product",
    items: [
      { label: "Markets", href: "/" },
      { label: "Portfolio", href: "/portfolio" }
    ]
  },
  {
    heading: "Build",
    items: [
      { label: "GitHub", href: "https://github.com/E1eng/ZeroSight", external: true },
      { label: "Story Protocol", href: "https://www.story.foundation", external: true },
      { label: "Explorer", href: "https://aeneid.storyscan.xyz", external: true }
    ]
  }
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0B0B0B]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/assets/ZeroSight.png"
                alt="ZeroSight"
                width={28}
                height={28}
                className="h-7 w-7 rounded-lg"
              />
              <span className="text-sm font-bold tracking-[0.2em] text-zinc-100">ZEROSIGHT</span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Blind parimutuel prediction markets. Bets stay encrypted with Story CDR until
              resolution — no copy-trading, no front-running.
            </p>
            <a
              href="https://x.com/ZeroSight_"
              target="_blank"
              rel="noreferrer"
              className="group mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-neon/40 hover:text-neon"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @ZeroSight_
            </a>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {LINKS.map((col) => (
              <div key={col.heading} className="flex flex-col gap-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  {col.heading}
                </span>
                {col.items.map((item) =>
                  item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-zinc-400 transition hover:text-neon"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href as Parameters<typeof Link>[0]["href"]}
                      className="text-sm text-zinc-400 transition hover:text-neon"
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col gap-2 border-t border-white/5 pt-5 text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {YEAR} ZeroSight</span>
          <span>Running on Story Aeneid testnet · not financial advice</span>
        </div>
      </div>
    </footer>
  );
}
