import { defineConfig } from 'vite';

// base './' : 어느 경로/정적 호스팅에 올려도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
});
