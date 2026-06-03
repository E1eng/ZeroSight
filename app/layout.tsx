import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/top-nav";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-space-grotesk",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ZeroSight Protocol",
  description: "Blind parimutuel prediction markets secured by Story Protocol CDR"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans bg-dark text-zinc-100">
        <Providers>
          <div className="flex min-h-screen flex-col bg-dark">
            <TopNav />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
