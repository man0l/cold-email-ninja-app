/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // shadcn-style design tokens
        background: "#0f172a",
        foreground: "#f8fafc",
        card: "#1e293b",
        "card-foreground": "#f8fafc",
        primary: "#3b82f6",
        "primary-foreground": "#ffffff",
        secondary: "#334155",
        "secondary-foreground": "#f8fafc",
        muted: "#1e293b",
        "muted-foreground": "#94a3b8",
        accent: "#334155",
        "accent-foreground": "#f8fafc",
        destructive: "#ef4444",
        "destructive-foreground": "#ffffff",
        border: "#334155",
        input: "#334155",
        ring: "#3b82f6",
      },
    },
  },
  plugins: [],
};
