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

test('单击自动移动；画布铺满到底部，GitHub 链接固定右下角', async ({ page }) => {
  // 注入固定牌局：2♠ 应能自动落到 3♠ 上
  await page.addInitScript(() => {
    localStorage.setItem(
      'spider-cards-saved-game',
      JSON.stringify({
        state: {
          difficulty: 'easy',
          columns: [
            [{ id: 'a', suit: 'spades', rank: 2, faceUp: true }],
            [{ id: 'b', suit: 'spades', rank: 3, faceUp: true }],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            []
          ],
          stock: [],
          completed: [],
          score: 500,
          moves: 0,
          status: 'playing'
        },
        elapsedSeconds: 0
      })
    );
  });
  await page.goto('/');

  // 单击（不拖动）第 1 列的牌 → 自动移入第 2 列
  await page.locator('.column').nth(0).locator('.play-card').click();
  await expect(page.locator('.column').nth(1).locator('.play-card')).toHaveCount(2);
  await expect(page.locator('.stat-moves .value')).toHaveText('1');

  // 画布下沿贴近页面底部（不留大片空白）
  const viewport = page.viewportSize()!;
  const boardBox = (await page.locator('.board').boundingBox())!;
  expect(viewport.height - (boardBox.y + boardBox.height)).toBeLessThan(40);

  // GitHub 链接以 fixed 固定在右下角
  const footer = page.locator('.app-footer');
  const position = await footer.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('fixed');
  const box = (await footer.boundingBox())!;
  expect(viewport.width - (box.x + box.width)).toBeLessThan(40);
  expect(viewport.height - (box.y + box.height)).toBeLessThan(40);
});

test('全牌面亮出后，自动完成一键收尾', async ({ page }) => {
  // 注入接近通关的全明牌局：7 组已收 + 断成两段的黑桃同花顺
  await page.addInitScript(() => {
    let seq = 0;
    const card = (suit: string, rank: number) => ({
      id: `auto-${suit}-${rank}-${seq++}`,
      suit,
      rank,
      faceUp: true
    });
    const descend = (suit: string, from: number, to: number) =>
      Array.from({ length: from - to + 1 }, (_, i) => card(suit, from - i));
    localStorage.setItem(
      'spider-cards-saved-game',
      JSON.stringify({
        state: {
          difficulty: 'easy',
          columns: [
            descend('spades', 9, 1), // 9♠…A♠
            descend('spades', 13, 10), // K♠…10♠
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            []
          ],
          stock: [],
          completed: ['spades', 'hearts', 'diamonds', 'clubs', 'spades', 'hearts', 'diamonds'],
          score: 320,
          moves: 40,
          status: 'playing'
        },
        elapsedSeconds: 120
      })
    );
  });
  await page.goto('/');

  // 全明牌 → 屏幕中央出现「自动完成」
  const autoButton = page.getByRole('button', { name: /自动完成/ });
  await expect(autoButton).toBeVisible();

  await autoButton.click();
  // 自动播放收尾动画后通关：8 槽填满、计分结算
  await expect(page.locator('.win-title')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.slot.filled')).toHaveCount(8);
  await expect(page.locator('.stat-moves .value')).toHaveText('41');
  await expect(page.locator('.stat-score .value')).toHaveText('419');
});

test('桌布外背景为随主题换色的平铺图案', async ({ page }) => {
  await page.goto('/');
  await page.locator('.option-easy').click();

  // 图案层存在，且位于牌桌之前（渲染在全部内容之下，不遮挡桌布）
  const pattern = page.locator('.page-pattern');
  await expect(pattern).toBeAttached();
  const patternBeforeBoard = await pattern.evaluate((el) => {
    const board = document.querySelector('.board')!;
    return (el.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(patternBeforeBoard).toBe(true);

  // 亮色与暗色使用不同的图案墨色与透明度
  const lightFill = await pattern.evaluate((el) => getComputedStyle(el).fill);
  const lightOpacity = await pattern.evaluate((el) => getComputedStyle(el).opacity);

  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => pattern.evaluate((el) => getComputedStyle(el).fill)).not.toBe(lightFill);
  // 透明度带 0.5s 过渡，轮询等待过渡完成后的最终值
  await expect
    .poll(() => pattern.evaluate((el) => getComputedStyle(el).opacity))
    .not.toBe(lightOpacity);
});
