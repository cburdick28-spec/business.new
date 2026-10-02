import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "flash-up": { "0%": { backgroundColor: "rgba(16,185,129,.28)" }, "100%": { backgroundColor: "transparent" } },
        "flash-down": { "0%": { backgroundColor: "rgba(244,63,94,.28)" }, "100%": { backgroundColor: "transparent" } },
      },
      animation: {
        "toast-in": "toast-in .18s ease-out",
        "flash-up": "flash-up .7s ease-out",
        "flash-down": "flash-down .7s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
