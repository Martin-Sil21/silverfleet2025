/** @type {import('tailwindcss').Config} */
export default {
  // Be explicit about which folders to scan to avoid accidentally matching node_modules
  content: [
    './index.html',
    // source files
    './src/**/*.{js,ts,jsx,tsx,html}',
    // top-level app files
    './*.{js,ts,jsx,tsx}',
    // common app directories
    './components/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './context/**/*.{js,ts,jsx,tsx}',
    './locales/**/*.{js,ts,jsx,tsx,json}',
  ],
  theme: {
    extend: {
      keyframes: {
        slideUp: {
          '0%': { 
            opacity: '0',
            transform: 'translateY(10px)'
          },
          '100%': { 
            opacity: '1',
            transform: 'translateY(0)'
          }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        typing: {
          '0%': { width: '0%' },
          '100%': { width: '100%' }
        }
      },
      animation: {
        slideUp: 'slideUp 0.3s ease-out forwards',
        fadeIn: 'fadeIn 0.3s ease-out',
        typing: 'typing 1s ease-out'
      }
    },
  },
  plugins: [],
}