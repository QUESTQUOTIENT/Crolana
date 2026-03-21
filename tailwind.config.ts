import type { Config } from 'tailwindcss';

const config: Config = {
  // Disable preflight — we provide our own minimal base in src/index.css
  // that uses standard `text-size-adjust` (not webkit-prefixed) to avoid
  // Firefox/mobile browser console warnings.
  corePlugins: {
    preflight: false,
  },
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
};

export default config;
