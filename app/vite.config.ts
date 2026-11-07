import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 把站点挂在 /<repo>/ 子路径下，用相对路径避免绝对路径 404。
  // 用 './' 而不是 '/new-card-rpg-project/'：仓库改名后不需要回来改这里。
  base: './',
  server: { port: 5173, strictPort: false },
});
