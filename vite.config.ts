import rsc from '@vitejs/plugin-rsc';
import react from '@vitejs/plugin-react';
import deno from '@deno/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

process.on('uncaughtException', (error) => {
  // handle error
  console.error({ error });
});

export default defineConfig({
  plugins: [
    deno(),
    rsc({
      // by default, the plugin sets up middleware
      // using `default` export of `rsc` environment `index` entry.
      // this behavior can be customized by `serverHandler` option.
      // serverHandler: false,
    }),

    // use any of react plugins https://github.com/vitejs/vite-plugin-react
    // to enable client component HMR
    react(),

    tailwindcss(),
    // use https://github.com/antfu-collective/vite-plugin-inspect
    // to understand internal transforms required for RSC.
    // import("vite-plugin-inspect").then(m => m.default()),
  ],

  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },

  preview: {
    host: true,
    port: 8080,
    strictPort: true,
  },

  // specify entry point for each environment.
  // (currently the plugin assumes `rollupOptions.input.index` for some features.)
  environments: {
    // `rsc` environment loads modules with `react-server` condition.
    // this environment is responsible for:
    // - RSC stream serialization (React VDOM -> RSC stream)
    // - server functions handling
    rsc: {
      build: {
        rollupOptions: {
          input: {
            index: './src/framework/entry.rsc.tsx',
          },
          output: { entryFileNames: `[name].js` },
        },
      },
    },

    // `ssr` environment loads modules without `react-server` condition.
    // this environment is responsible for:
    // - RSC stream deserialization (RSC stream -> React VDOM)
    // - traditional SSR (React VDOM -> HTML string/stream)
    ssr: {
      build: {
        rollupOptions: {
          input: {
            index: './src/framework/entry.ssr.tsx',
          },
          output: { entryFileNames: `[name].js` },
        },
      },
    },

    // client environment is used for hydration and client-side rendering
    // this environment is responsible for:
    // - RSC stream deserialization (RSC stream -> React VDOM)
    // - traditional CSR (React VDOM -> Browser DOM tree mount/hydration)
    // - refetch and re-render RSC
    // - calling server functions
    client: {
      build: {
        // assetsDir: 'static',
        rollupOptions: {
          input: {
            index: './src/framework/entry.browser.tsx',
          },
          output: { entryFileNames: `[name].js` },
        },
      },
    },
  },
});
