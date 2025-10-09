export default /** @type {import('tailwindcss').Config} */ ({
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
})
