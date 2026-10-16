/**
 * 通用小工具（与游戏逻辑无关的纯函数）
 */

/**
 * 读取 :root 上的 CSS 变量值（已去首尾空白）。
 * base.css 是颜色的唯一事实源，JS 侧（antd token）需要颜色时从这里读取；
 * 变量不存在或测试环境没有样式表时返回空串，调用方应保留回退值
 */
export function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 秒数格式化为 m:ss（超过 1 小时为 h:mm:ss） */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
