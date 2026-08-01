import type { Config } from 'tailwindcss'

export default {
  // O `dist` do pacote entra no scan: as classes das bolhas, do composer e das linhas da inbox só
  // existem lá, e sem isto o Tailwind não gera nenhuma delas. Os dois caminhos porque o `file:`
  // resolve na raiz do monorepo ou aqui, conforme quem instalou.
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@adatechnology/conversations-ui/dist/**/*.js',
    '../../node_modules/@adatechnology/conversations-ui/dist/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
