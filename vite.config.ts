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

        // ✅ FIX — DO NOT use absolute path
        // ✅ MUST use trailing slash
        buffer: 'buffer/',

        // stubs (your file is correct)
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
        'process',
        '@solana/web3.js',
        '@solana/spl-token',
        'bs58',
        'tweetnacl',
      ],

      exclude: [
        '@metaplex-foundation/umi',
        '@metaplex-foundation/mpl-core',
        '@metaplex-foundation/mpl-token-metadata',
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