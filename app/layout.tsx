import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/top-nav";
import { Footer } from "@/components/footer";

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
  metadataBase: new URL("https://zerosight.xyz"),
  title: {
    default: "ZeroSight Protocol",
    template: "%s · ZeroSight"
  },
  description: "Blind parimutuel prediction markets secured by Story Protocol CDR",
  applicationName: "ZeroSight",
  keywords: [
    "prediction market",
    "Story Protocol",
    "CDR",
    "confidential",
    "parimutuel",
    "encrypted bets"
  ],
  openGraph: {
    type: "website",
    url: "https://zerosight.xyz",
    siteName: "ZeroSight",
    title: "ZeroSight Protocol",
    description:
      "Blind parimutuel prediction markets. Bets are encrypted with Story CDR — no copy-trading, no front-running, until the market resolves.",
    images: [{ url: "/assets/ZeroSight.png", width: 500, height: 500, alt: "ZeroSight" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "ZeroSight Protocol",
    description:
      "Blind parimutuel prediction markets secured by Story Protocol CDR. Encrypted bets, trustless reveal.",
    images: ["/assets/ZeroSight.png"]
  },
  icons: {
    icon: "/assets/ZeroSight.png",
    apple: "/assets/ZeroSight.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans bg-dark text-zinc-100">
        <Providers>
          <div className="flex min-h-screen flex-col bg-dark">
            <TopNav />
            {children}
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
