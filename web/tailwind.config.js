import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Paleta tomada de design_specs/Finanzas en Pareja.dc.html (valores OKLCH del mock).
        cream: {
          DEFAULT: 'oklch(0.985 0.004 75)', // fondo base de la app
          surface: 'oklch(0.94 0.006 75)', // fondos secundarios (toggles, chips)
        },
        ink: {
          DEFAULT: 'oklch(0.22 0.01 60)', // texto principal
          soft: 'oklch(0.35 0.01 60)',
          muted: 'oklch(0.52 0.01 60)', // texto secundario
          faint: 'oklch(0.60 0.01 60)',
        },
        line: 'oklch(0.90 0.008 75)', // bordes
        brand: {
          DEFAULT: 'oklch(0.40 0.17 350)', // acento rosa/magenta primario
          hover: 'oklch(0.33 0.17 350)',
          light: 'oklch(0.95 0.03 350)',
        },
        success: {
          DEFAULT: 'oklch(0.60 0.14 145)',
          light: 'oklch(0.95 0.05 145)',
        },
        danger: {
          DEFAULT: 'oklch(0.55 0.19 25)',
          light: 'oklch(0.95 0.05 25)',
        },
        warning: {
          DEFAULT: 'oklch(0.72 0.15 80)',
          light: 'oklch(0.95 0.06 80)',
        },
      },
    },
  },
  plugins: [],
};
