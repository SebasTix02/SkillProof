import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)/ },
            { name: 'vendor-supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'i18n-es', test: /src[\\/]i18n[\\/]esText\.ts/ },
          ],
        },
      },
    },
  },
  // Tests read the interface in English, whatever the machine's language (src/test-setup.ts).
  test: { setupFiles: ['./src/test-setup.ts'] },
} as Parameters<typeof defineConfig>[0]);
