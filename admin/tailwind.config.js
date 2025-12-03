/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#d95d83',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f2aac3',
          foreground: '#333333',
        },
      },
    },
  },
  plugins: [],
}

