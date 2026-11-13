import { defineConfig } from 'vite';
// 상대 경로 빌드: 아티팩트·정적 호스팅 어디서나 열리도록
export default defineConfig({
  base: './',
  // 저장소 루트의 packages/shared(실시간 프로토콜)를 같이 쓴다
  server: { fs: { allow: ['..', '../../packages'] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
});
