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

        // Real buffer npm package (trailing slash required)
        buffer: 'buffer/',

        // ── Node.js built-in shims ──────────────────────────────────────
        // `stream` MUST use a real stub with Readable/Writable/Transform.
        // The empty-stub caused: "can't access property 'prototype',
        // Ee.Readable is undefined" because ws/concat-stream/keccak all do
        //   const { Readable } = require('stream');
        //   Child.prototype = Object.create(Readable.prototype);
        stream:   path.resolve(__dirname, 'src/lib/stream-stub.ts'),

        // These are genuinely unused in browser paths — empty stubs are safe.
        http:     path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        https:    path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        url:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        zlib:     path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        punycode: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        // ws uses Node net/tls/http internals — alias to empty so it falls
        // back to the browser's native WebSocket (set by @solana/web3.js)
        net:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        tls:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        dns:      path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        os:       path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        path:     path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        fs:       path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        crypto:   path.resolve(__dirname, 'src/lib/empty-stub.ts'),
      },
    },

    optimizeDeps: {
      include: [
        'buffer',
        'process',
        '@solana/web3.js',
        '@solana/spl-token',
        'bs58',
        'tweetnacl',
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
      // es2020 + safari14 ensures mobile Safari 14+ is supported without issues.
      // Chrome 80 covers Android WebView since ~2020.
      target: ['es2020', 'chrome80', 'safari14', 'firefox79'],

      outDir: 'dist',
      sourcemap: false,

      // Warn when any single chunk exceeds 1 MB (helps catch regressions)
      chunkSizeWarningLimit: 1000,

      commonjsOptions: {
        transformMixedEsModules: true,
      },

      rollupOptions: {
        // Suppress noisy "use client" directive warnings from React 19 packages
        onwarn(warning, defaultHandler) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          if (warning.code === 'CIRCULAR_DEPENDENCY') return;
          defaultHandler(warning);
        },

        output: {
          // Fine-grained manual chunks to keep each chunk under ~500 KB:
          //   react-vendor  — React + router (rarely changes, long-lived cache)
          //   solana        — @solana/web3.js + SPL + crypto utilities
          //   metaplex      — Metaplex UMI + MPL programs (largest; own chunk)
          //   ethers        — ethers.js EVM library
          //   ui-vendor     — recharts, lucide, motion, zustand
          //   vendor        — everything else from node_modules
          //   Page chunks are auto-split by Rollup via React.lazy()
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;

            // React core + router — tiny, critical-path, cache forever
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/')
            ) return 'react-vendor';

            // Metaplex — includes SES lockdown (largest single group)
            if (
              id.includes('@metaplex-foundation') ||
              id.includes('mpl-candy-machine') ||
              id.includes('@noble/') ||
              id.includes('@coral-xyz') ||
              id.includes('borsh')
            ) return 'metaplex';

            // Solana web3 + SPL + crypto deps
            if (
              id.includes('@solana/') ||
              id.includes('bs58') ||
              id.includes('tweetnacl') ||
              id.includes('buffer') ||
              id.includes('bn.js') ||
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

            // Everything else in node_modules
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
