import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// HTTPS=1 npm run dev  → sirve por https en la red local para probar la cámara desde el móvil.
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3001}` },
  },
});
