/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'neon-green': '#39ff14',
                'neon-red': '#ff073a',
            },
            boxShadow: {
                'neon-green': '0 0 30px rgba(57, 255, 20, 0.2)',
                'emerald-glow': '0 0 30px rgba(16, 185, 129, 0.2)',
                'neon-text': '0 0 10px rgba(255, 255, 255, 0.3)',
                'neon-green-sm': '0 0 8px rgba(57, 255, 20, 0.6)',
                'emerald-glow-sm': '0 0 8px rgba(16, 185, 129, 0.6)',
            },
        },
    },
    plugins: [],
}
