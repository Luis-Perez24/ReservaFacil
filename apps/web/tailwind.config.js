/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // We will use 'dark' class on HTML or body to toggle
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)'
        },
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        mist: 'var(--mist)',
        line: 'var(--line)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
      },
      keyframes: {
        // El barrido ocurre en el primer tercio del ciclo y se queda fuera de
        // pantalla el resto ("100%" repite la posición de "35%") — así el
        // "ligero retraso entre cada pasada" sale de un solo keyframe, sin
        // JS ni una segunda animación para la pausa.
        'shimmer-sweep': {
          '0%': { transform: 'translateX(-150%)' },
          '35%': { transform: 'translateX(250%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'shimmer-sweep': 'shimmer-sweep 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
