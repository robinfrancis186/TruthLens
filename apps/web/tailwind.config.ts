import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151515",
        paper: "#fbfbf8",
        cyanline: "#0e7490",
        leaf: "#15803d",
        rosemark: "#be123c",
        sunmark: "#b45309"
      },
      boxShadow: {
        line: "0 1px 0 rgba(21, 21, 21, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

