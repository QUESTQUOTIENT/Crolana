import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, createLogger } from 'vite';

// ─── Clean logger ─────────────────────────────────────────────
const logger = createLogger();
const _warn = logger.warn.bind(logger);
logger.warn = (msg, opts) => {
  if (msg.includes('Sourcemap')) return;
  if (msg.includes('No sources')) return;
  if (msg.includes('points to missing')) return;
  _warn(msg, opts);
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
      alias: {
        '@': path.resolve(__dirname, '.'),

        // ✅ FIX BUFFER (NO slash)
        buffer: require.resolve('buffer/'),

        // ✅ FIX BN
        'bn.js': require.resolve('bn.js'),

        // ✅ Stub node modules
        stream: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        http: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        https: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        url: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        zlib: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
        punycode: path.resolve(__dirname, 'src/lib/empty-stub.ts'),
      },
    },

    optimizeDeps: {
      include: [
        'buffer',
        'bn.js',
        'bs58',
        'tweetnacl',

        '@solana/web3.js',
        '@solana/spl-token',

        'react',
        'react-dom',
      ],

      exclude: [
        '@metaplex-foundation/umi',
        '@metaplex-foundation/mpl-core',
        '@metaplex-foundation/mpl-candy-machine',
      ],
    },

    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 4000,

      commonjsOptions: {
        transformMixedEsModules: true,
      },

      rollupOptions: {
        output: {
          manualChunks: {
            solana: [
              '@solana/web3.js',
              '@solana/spl-token',
              'bn.js',
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