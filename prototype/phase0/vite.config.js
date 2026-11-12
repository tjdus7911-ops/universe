import { defineConfig } from 'vite';
// 상대 경로 빌드: 아티팩트·정적 호스팅 어디서나 열리도록
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
});
