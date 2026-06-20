import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: "#6366f1",
          purple: "#8b5cf6",
          cyan: "#22d3ee",
        },
      },
    },
  },
  plugins: [],
};

export default config;
