/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        outfit: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        slate: {
          50: "#f8fafc",
          100: "#f1f5f9",
          150: "#edf0f4",
          200: "#e2e8f0",
          250: "#d8dfe8",
          300: "#cbd5e1",
          350: "#a8b4c3",
          400: "#94a3b8",
          450: "#7d8fa3",
          500: "#64748b",
          550: "#536071",
          600: "#475569",
          650: "#3b4a5a",
          700: "#334155",
          750: "#293547",
          800: "#1e293b",
          850: "#172032",
          900: "#0f172a",
          950: "#080f1e",
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "section-reveal": "sectionReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        sectionReveal: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
