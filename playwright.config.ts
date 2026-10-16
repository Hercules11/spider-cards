import { defineConfig, devices } from '@playwright/test';

// E2E 冒烟测试：对 vite preview 起的生产构建跑关键用户路径
// 项目 base 为 /spider-cards/（GitHub Pages 子路径部署），所有 URL 需带上该前缀
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/spider-cards/',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'pnpm build-only && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/spider-cards/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
