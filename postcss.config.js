// postcss.config.js
// Remove vendor-prefixed text-size-adjust properties that cause Firefox/mobile
// console warnings. The standard `text-size-adjust` is sufficient for all
// modern browsers (Chrome 54+, Firefox 116+, Safari 17+).
export default {
  plugins: {
    // No additional plugins — @tailwindcss/vite handles Tailwind internally.
    // This file exists to give PostCSS a home for future plugin additions.
  },
};
