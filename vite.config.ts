import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages ではリポジトリ名配下に配置されるため相対パスでビルドする
export default defineConfig({
  base: './',
  plugins: [react()],
})
