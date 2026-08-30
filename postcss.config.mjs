// Tailwind v4's PostCSS plugin bundles Lightning CSS, which handles vendor
// prefixing itself -- a separate autoprefixer pass is no longer needed.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
