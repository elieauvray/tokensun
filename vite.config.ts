import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/primevue/')) return 'vendor-primevue';
          if (id.includes('/chart.js/')) return 'vendor-chart';
          if (id.includes('/vue/') || id.includes('/vue-router/')) return 'vendor-vue';
          return 'vendor-misc';
        }
      }
    }
  },
  server: {
    port: 8080
  }
});
