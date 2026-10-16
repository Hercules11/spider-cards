import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// 独立于 vite.config.ts：测试配置（环境、覆盖率阈值）不污染构建配置
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    // globals: true 让 @testing-library 在每个用例后自动 cleanup DOM
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        // 应用入口：由构建流程保证，仅含插件注册
        'src/main.ts',
        // 纯类型声明
        'src/types.ts',
        'src/index.d.ts',
        'src/env.d.ts',
        // 交互拖拽层：依赖真实指针事件与布局，由 e2e 冒烟覆盖
        'src/components/GameBoard.vue',
        'src/test/**',
        'src/**/__tests__/**'
      ],
      thresholds: {
        // 阈值只做防劣化底线（vitest 2 不支持 per-glob 阈值，不对单文件设指标）
        statements: 60,
        lines: 60
      }
    }
  }
});
