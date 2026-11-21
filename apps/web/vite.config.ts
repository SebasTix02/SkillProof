import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // Tests read the interface in English, whatever the machine's language (src/test-setup.ts).
  test: { setupFiles: ['./src/test-setup.ts'] },
} as Parameters<typeof defineConfig>[0]);
