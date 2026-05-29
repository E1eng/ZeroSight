import type { Metadata } from "next";
import { Inter, Space_Grotesk as SpaceGrotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = SpaceGrotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "ZeroSight Protocol",
  description: "Blind parimutuel prediction markets secured by Story Protocol CDR"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans bg-night-900 text-zinc-100">
        <Providers>
          <div className="relative min-h-screen">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,107,255,0.15),_transparent_60%)]" />
            <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 lg:px-12">
              <header className="flex flex-col gap-2 pb-10 text-center">
                <span className="text-sm uppercase tracking-[0.3em] text-zinc-500">ZeroSight Protocol</span>
                <h1 className="text-3xl font-semibold text-zinc-100 sm:text-4xl">
                  Blind Parimutuel Markets backed by Story CDR
                </h1>
                <p className="mx-auto max-w-2xl text-sm text-zinc-400">
                  Encrypt your directional calls on-chain. Stake confidently while keeping your strategy hidden until market
                  resolution.
                </p>
              </header>
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
