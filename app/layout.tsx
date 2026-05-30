import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "ZeroSight Protocol",
  description: "Blind parimutuel prediction markets secured by Story Protocol CDR"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-dark text-zinc-100" style={{ fontFamily: "'Inter', sans-serif" }}>
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
