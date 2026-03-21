import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],

    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    resolve: {
      conditions: ['browser', 'module', 'import'],

      alias: {
        '@': path.resolve(__dirname, '.'),

        // ── Real buffer npm package (trailing slash required) ──────────────
        buffer: 'buffer/',

        // ── stream: MUST be a real stub with Readable/Writable/Transform ──
        // An empty stub causes: "can't access property 'prototype', Ee.Readable
        // is undefined" because ws/concat-stream/keccak do:
        //   const { Readable } = require('stream');
        //   Child.prototype = Object.create(Readable.prototype);
        stream: path.resolve(__dirname, 'src/lib/stream-stub.ts'),

        // ── These are genuinely unused in browser paths ─────────────────────
        http:     path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        https:    path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        url:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        zlib:     path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        punycode: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        net:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        tls:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        dns:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        os:       path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        fs:       path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        crypto:   path.resolve(__dirname, 'src/lib/empty-stub.ts'),
      },
    },

    optimizeDeps: {
      // Pre-bundling ensures Vite's dev server (and esbuild) converts these
      // CJS packages to ESM before any code runs — fixes import { BN } from 'bn.js'
      include: [
        'bn.js',
        'buffer',
        'process',
        'bs58',
        'tweetnacl',
        '@solana/web3.js',
        '@solana/spl-token',
        'react',
        'react-dom',
        'react-router-dom',
        'zustand',
      ],
      exclude: [
        '@metaplex-foundation/umi',
        '@metaplex-foundation/mpl-core',
        '@metaplex-foundation/mpl-token-metadata',
        '@metaplex-foundation/mpl-candy-machine',
        '@metaplex-foundation/umi-bundle-defaults',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },

    build: {
      // Target covers: iOS Safari 14+, Chrome 80 (Android WebView), Firefox 79
      target: ['es2020', 'chrome80', 'safari14', 'firefox79'],

      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,

      commonjsOptions: {
        transformMixedEsModules: true,

        // ── CRITICAL: explicit named exports for CJS-only packages ──────────
        // bn.js ships as `module.exports = BN` (single CJS export).
        // @metaplex/beet, borsh, and keccak256 import it as:
        //   import { BN } from 'bn.js'   ← named ESM import
        // Without this hint, Rollup's CJS→ESM transform can't see 'BN' as a
        // named export → bundles it as `undefined` → crash at runtime.
        namedExports: {
          'bn.js': ['BN'],
          // readable-stream is also CJS-only with named exports
          'readable-stream': ['Readable', 'Writable', 'Duplex', 'Transform', 'PassThrough', 'Stream'],
        },
      },

      rollupOptions: {
        onwarn(warning, defaultHandler) {
          // Suppress noisy but harmless warnings from React 19 + Metaplex
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          if (warning.code === 'CIRCULAR_DEPENDENCY') return;
          if (warning.code === 'THIS_IS_UNDEFINED') return;
          defaultHandler(warning);
        },

        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;

            // React core + router — tiny, critical-path, cache forever
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/')
            ) return 'react-vendor';

            // Metaplex — includes SES lockdown
            if (
              id.includes('@metaplex-foundation') ||
              id.includes('mpl-candy-machine') ||
              id.includes('@noble/') ||
              id.includes('@coral-xyz') ||
              id.includes('borsh')
            ) return 'metaplex';

            // Solana + bn.js MUST be in the same chunk.
            // bn.js is used by @solana/web3.js, @metaplex/beet, and borsh.
            // Keeping them together ensures bn.js is initialized before any
            // consumer code runs, preventing "n.BN is undefined" at runtime.
            if (
              id.includes('@solana/') ||
              id.includes('/bn.js/') ||
              id.includes('/bn.js\\') ||
              id.includes('bn.js/lib') ||
              id === 'bn.js' ||
              id.includes('bs58') ||
              id.includes('tweetnacl') ||
              id.includes('buffer') ||
              id.includes('superstruct')
            ) return 'solana';

            // EVM / Ethers
            if (
              id.includes('ethers') ||
              id.includes('@ethersproject') ||
              id.includes('solc') ||
              id.includes('keccak256') ||
              id.includes('merkletreejs') ||
              id.includes('@openzeppelin')
            ) return 'ethers';

            // UI component libs
            if (
              id.includes('recharts') ||
              id.includes('lucide-react') ||
              id.includes('motion') ||
              id.includes('framer-motion') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) return 'ui-vendor';

            return 'vendor';
          },
        },
      },
    },

    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
