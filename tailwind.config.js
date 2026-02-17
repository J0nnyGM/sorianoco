/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        soriano: {
          black: '#000000',      // Negro puro logo
          dark: '#121212',       // Fondo UI (Material Dark)
          gray: '#2A2A2A',       // Paneles secundarios
          red: '#CE2029',        // Rojo del logo (Acciones)
          red_hover: '#A0151D',  // Rojo oscuro para hover
          white: '#FFFFFF',      // Texto
          gold: '#D4AF37'        // Detalles de lujo extra
        }
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'], // Para títulos (Similar a la S del logo)
        sans: ['Inter', 'sans-serif'],        // Para textos funcionales/tablas
      }
    },
  },
  plugins: [],
}