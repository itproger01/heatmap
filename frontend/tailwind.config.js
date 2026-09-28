export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#000000',
        panel: '#0B0E11',
        panel2: '#111419',
        line: '#1B2027',
        neon: '#00ff88',
        crimson: '#ff3366',
        cyan: '#00e5ff',
        amber: '#ffb020',
        mute: '#6b7385',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
        tech: ['Orbitron', 'Audiowide', 'Michroma', 'sans-serif'],
        display: ['Audiowide', 'Orbitron', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,255,136,0.12)',
        inner: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      },
    },
  },
  plugins: [],
};
