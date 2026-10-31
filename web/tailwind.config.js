import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', ...defaultTheme.fontFamily.sans],
      },
      keyframes: {
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Salida de la tarjeta clasificada en Revisar hacia la direccion del boton (##105).
        'card-out-left': {
          '0%': { opacity: '1', transform: 'translateX(0) rotate(0)' },
          '100%': { opacity: '0', transform: 'translateX(-110%) rotate(-6deg)' },
        },
        'card-out-right': {
          '0%': { opacity: '1', transform: 'translateX(0) rotate(0)' },
          '100%': { opacity: '0', transform: 'translateX(110%) rotate(6deg)' },
        },
        'card-out-up': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-60%) scale(0.95)' },
        },
        // Entrada de la nueva primera tarjeta, mas notoria que card-in, con un resaltado que se
        // desvanece para que se note que es otra transaccion (##105).
        'card-in-next': {
          '0%': { opacity: '0', transform: 'translateY(40px) scale(0.94)', boxShadow: '0 0 0 4px var(--tw-ring-color)' },
          '60%': { opacity: '1', transform: 'translateY(0) scale(1.01)', boxShadow: '0 0 0 4px var(--tw-ring-color)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', boxShadow: '0 0 0 0 transparent' },
        },
        // La etiqueta "Siguiente" se ve unos segundos y se desvanece (queda invisible, sin saltar el layout).
        'badge-fade': {
          '0%, 75%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'card-in': 'card-in 0.25s ease-out',
        'toast-in': 'toast-in 0.2s ease-out',
        'card-out-left': 'card-out-left 0.3s ease-in forwards',
        'card-out-right': 'card-out-right 0.3s ease-in forwards',
        'card-out-up': 'card-out-up 0.3s ease-in forwards',
        'card-in-next': 'card-in-next 1.2s ease-out',
        'badge-fade': 'badge-fade 3s ease-out forwards',
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
          // Oscurecido de 0.60 a 0.56 (Fase 6, auditoria de accesibilidad): a 0.60 el contraste
          // como texto sobre blanco/cream era ~3.8-4.0:1, por debajo del 4.5:1 AA para texto normal.
          faint: 'oklch(0.56 0.01 60)',
        },
        line: 'oklch(0.90 0.008 75)', // bordes
        brand: {
          DEFAULT: 'oklch(0.40 0.17 350)', // acento rosa/magenta primario
          hover: 'oklch(0.33 0.17 350)',
          light: 'oklch(0.95 0.03 350)',
        },
        success: {
          // Oscurecido de 0.60 a 0.55 (Fase 6): a 0.60 el contraste de texto sobre blanco era
          // ~3.7:1, por debajo del 4.5:1 AA (se usa en texto pequeño, no clasifica como "grande").
          DEFAULT: 'oklch(0.55 0.14 145)',
          light: 'oklch(0.95 0.05 145)',
        },
        danger: {
          // Oscurecido de 0.55 a 0.54 (Fase 6): el contraste sobre danger-light rondaba 4.39:1.
          DEFAULT: 'oklch(0.54 0.19 25)',
          light: 'oklch(0.95 0.05 25)',
        },
        warning: {
          // Oscurecido de 0.72 a 0.57 (Fase 6): a 0.72 el contraste de texto sobre blanco/cream
          // era ~2.5:1 (falla incluso el umbral de texto grande); 0.57 da ~4.5:1 AA.
          DEFAULT: 'oklch(0.57 0.15 80)',
          light: 'oklch(0.95 0.06 80)',
        },
      },
    },
  },
  plugins: [],
};
