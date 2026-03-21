import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, createLogger } from 'vite';

// ─── Clean logger ─────────────────────────────────────────────
const logger = createLogger();
const warn = logger.warn;

logger.warn = (msg, opts) => {
  if (
    msg.includes('Sourcemap') ||
    msg.includes('No sources') ||
    msg.includes('SOURCEMAP_ERROR') ||
    msg.includes('points to missing source files')
  ) return;
  warn(msg, opts);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    customLogger: logger,

    plugins: [
      react(),
      tailwindcss(),
    ],

    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    resolve: {
      conditions: ['browser', 'import', 'module', 'default'],

      alias: {
        '@': path.resolve(__dirname, '.'),

        // ✅ FIXED buffer (IMPORTANT: trailing slash)
        buffer: 'buffer/',

        // ✅ Stub node-only modules
        stream: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        http: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        https: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        url: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        zlib: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        punycode: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
      },
    },

    optimizeDeps: {
      exclude: [
        '@metaplex-foundation/umi',
        '@metaplex-foundation/umi-bundle-defaults',
        '@metaplex-foundation/mpl-token-metadata',
        '@metaplex-foundation/mpl-candy-machine',
        '@metaplex-foundation/mpl-core',
      ],

      include: [
        'react',
        'react-dom',
        'ethers',
        'react-router-dom',
        'zustand',

        // ✅ CRITICAL
        'buffer',
        '@solana/web3.js',
        '@solana/spl-token',
        'bs58',
        'tweetnacl',
      ],
    },

    build: {
      target: 'es2020',
      outDir: 'dist',
      sourcemap: false,

      commonjsOptions: {
        transformMixedEsModules: true,
      },

      rollupOptions: {
        output: {
          manualChunks: {
            solana: [
              '@solana/web3.js',
              '@solana/spl-token',
              'buffer',
              'bs58',
              'tweetnacl',
            ],
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