import { expect, test } from '@playwright/test';

/**
 * 关键用户路径冒烟测试（生产构建 + vite preview）
 * 项目 base 为 /spider-cards/，已在 playwright.config.ts 的 baseURL 中带上
 */

test('首次进入：选择难度后牌桌就位', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '选择难度开始游戏' })).toBeVisible();

  await page.locator('.option-easy').click();

  // 10 列 × (4 列 6 张 + 6 列 5 张) = 54 张，每列一张正面
  await expect(page.locator('.column')).toHaveCount(10);
  await expect(page.locator('.play-card')).toHaveCount(54);
  await expect(page.locator('.play-card .card.is-down')).toHaveCount(44);
  await expect(page.locator('.play-card .card:not(.is-down)')).toHaveCount(10);
  await expect(page.locator('.stat-score .value')).toHaveText('500');
  await expect(page.getByTestId('stock-count')).toHaveText('×5');
});

test('发牌与撤销', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option-medium').click();

  await page.getByTestId('stock').click();
  await expect(page.locator('.play-card')).toHaveCount(64);
  await expect(page.getByTestId('stock-count')).toHaveText('×4');
  await expect(page.locator('.stat-moves .value')).toHaveText('1');

  await page.getByRole('button', { name: /撤销/ }).click();
  await expect(page.locator('.play-card')).toHaveCount(54);
  await expect(page.getByTestId('stock-count')).toHaveText('×5');
  await expect(page.locator('.stat-moves .value')).toHaveText('0');
});

test('提示与规则弹窗', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option-hard').click();

  // 提示要么高亮一组牌，要么提示去发牌（消息条）
  await page.getByRole('button', { name: /提示/ }).click();
  await expect(page.locator('.is-hinted').or(page.locator('.ant-message'))).toBeVisible();

  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toContainText('玩法规则');
  await page.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('主题与语言持久化，刷新后恢复牌局', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option-easy').click();
  await expect(page.locator('.column')).toHaveCount(10);

  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('switch').click();
  await expect(page.getByRole('heading', { name: 'Spider Solitaire' })).toBeVisible();

  await page.reload();
  // 刷新后：主题、语言、牌局都保留，不再出现欢迎弹窗
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Spider Solitaire' })).toBeVisible();
  await expect(page.locator('.column')).toHaveCount(10);
  await expect(page.getByRole('heading', { name: 'Pick a difficulty to start' })).toBeHidden();
});
