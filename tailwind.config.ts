import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./pages/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          900: "#050507",
          800: "#0a0a10"
        },
        electric: "#4f6bff"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["Space Grotesk", "ui-monospace", "SFMono-Regular"]
      },
      borderRadius: {
        "4xl": "2rem"
      },
      boxShadow: {
        glow: "0 0 20px rgba(79, 107, 255, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
