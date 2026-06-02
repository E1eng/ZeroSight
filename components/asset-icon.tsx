import Image from "next/image";

/**
 * Brand asset icon. Renders the official-style SVG from /public/assets.
 * All marks are full-color brand badges (IP uses the rounded badge mark).
 */
const ICON_SRC: Record<string, string> = {
  IP: "/assets/ip-badge.svg",
  BTC: "/assets/btc.svg",
  ETH: "/assets/eth.svg"
};

export function AssetIcon({
  symbol,
  size = 40,
  className = ""
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const clean = symbol.replace(" (Daily)", "").toUpperCase();
  const src = ICON_SRC[clean];

  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white ${className}`}
        style={{ width: size, height: size }}
      >
        {clean.slice(0, 1)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={clean}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
    />
  );
}
