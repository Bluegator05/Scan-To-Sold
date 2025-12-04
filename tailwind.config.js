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
        },
    },
    plugins: [],
}
