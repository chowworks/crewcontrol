/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1C2E',
        ground: '#F3F6F5',
        muted: '#4A5568',
        body: '#2D3748',
        rule: '#E2E8EA',
        // Royal purple: buttons, links and accents.
        royal: { DEFAULT: '#5A2D91', dark: '#3F1E66', pale: '#F1ECF8' },
        marigold: '#F2B33D',
        // A person's initial circle on announcement replies: one per person, picked from their name. Warm, readable
        // with ink text, and never teal, green or light blue (the owner's colours to avoid).
        avatar: {
          coral: '#F49A84',
          pink: '#F2A7C9',
          lavender: '#C9B6EC',
          peach: '#F7C59F',
          rose: '#E79AA8',
          sand: '#E5D3A8',
        },
        placeholder: '#3A3F4A',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,28,46,0.08)',
      },
    },
  },
  plugins: [],
}
