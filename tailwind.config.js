// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs", // <-- IMPORTANTE: Adiciona esta linha
    "./public/**/*.js",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}