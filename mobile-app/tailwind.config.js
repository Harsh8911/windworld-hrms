/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        wind: {
          50: "#f3f9f0",
          100: "#e4f3df",
          200: "#c8e7be",
          500: "#68bd45",
          600: "#3f9f3b",
          700: "#007943",
          800: "#006238",
          900: "#17472d",
        },
      },
    },
  },
  plugins: [],
};
