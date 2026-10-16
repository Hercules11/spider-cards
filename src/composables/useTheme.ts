import { computed, ref, watch } from 'vue';
import antTheme from 'ant-design-vue/es/theme';
import { generate } from '@ant-design/colors';
import { getCSSVar } from '@/utils';
import { readString, STORAGE_KEYS, writeString } from '@/utils/storage';

type ThemeMode = 'light' | 'dark';

/**
 * 语义色种子在 base.css 中的变量名（明暗各一套，亮色为降饱和的柔和值）
 */
const SEED_VARS = {
  primary: '--color-seed-primary',
  success: '--color-seed-success',
  error: '--color-seed-error',
  warning: '--color-seed-warning',
  info: '--color-seed-info'
} as const;

/** 种子读取失败时的回退值（仅测试环境无样式表时会走到），与 base.css 保持一致 */
const SEED_FALLBACKS = {
  light: {
    primary: '#2f7a4f',
    success: '#63b041',
    error: '#df6b70',
    warning: '#e0a52e',
    info: '#4d9fdc'
  },
  dark: {
    primary: '#3da06a',
    success: '#52c41a',
    error: '#df6b70',
    warning: '#faad14',
    info: '#1890ff'
  }
};

/**
 * 基于 Ant Design 色彩算法生成语义色板，供 antd token 使用。
 * 种子从 base.css 的 --color-seed-* 读取（base.css 是颜色的唯一事实源）
 */
function generateSemanticColors(isDark: boolean) {
  const theme = isDark ? 'dark' : 'default';
  const fallback = isDark ? SEED_FALLBACKS.dark : SEED_FALLBACKS.light;
  const seed = (name: keyof typeof SEED_VARS) => getCSSVar(SEED_VARS[name]) || fallback[name];

  const primary = generate(seed('primary'), { theme });
  const success = generate(seed('success'), { theme });
  const error = generate(seed('error'), { theme });
  const warning = generate(seed('warning'), { theme });
  const info = generate(seed('info'), { theme });

  const colorAt = (palette: string[], index: number, fallbackColor: string) =>
    palette[index] ?? fallbackColor;

  return {
    // antd token 用：主色用索引 5（标准主色强度），Hover 态用索引 4（稍浅一级）
    tokens: {
      colorPrimary: colorAt(primary, 5, seed('primary')),
      colorSuccess: colorAt(success, 5, seed('success')),
      colorError: colorAt(error, 5, seed('error')),
      colorWarning: colorAt(warning, 5, seed('warning')),
      colorInfo: colorAt(info, 5, seed('info')),

      colorSuccessHover: colorAt(success, 4, seed('success')),
      colorErrorHover: colorAt(error, 4, seed('error')),
      colorWarningHover: colorAt(warning, 4, seed('warning')),
      colorInfoHover: colorAt(info, 4, seed('info'))
    },
    // 仅供下方 watch 回写 CSS 变量（CSS 只消费这两个语义色），与 antd token 严格分离
    cssVars: {
      '--color-success': colorAt(success, 5, seed('success')),
      '--color-error': colorAt(error, 5, seed('error'))
    }
  };
}

/** antd token <- base.css 的对应关系（jsdom 测试环境读不到样式表时跳过，走算法默认） */
const CSS_TOKEN_MAP: Array<[token: string, varName: string]> = [
  ['colorBgContainer', '--color-surface'],
  ['colorBgElevated', '--color-surface-soft'],
  ['colorBorder', '--color-border'],
  ['colorBorderSecondary', '--color-border-strong'],
  ['colorText', '--color-text'],
  ['colorTextSecondary', '--color-text-secondary'],
  ['colorTextTertiary', '--color-text-muted']
];

/**
 * 主题状态：跟随系统偏好初始化、手动切换、持久化到 localStorage，
 * 并同步到 <html data-theme>（CSS 变量切换）与 antd 主题算法
 */
export function useTheme() {
  const getInitialTheme = (): ThemeMode => {
    const storedTheme = readString(STORAGE_KEYS.theme);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const themeMode = ref<ThemeMode>(getInitialTheme());
  const isDarkTheme = computed(() => themeMode.value === 'dark');

  const themeColors = computed(() => generateSemanticColors(isDarkTheme.value));

  const appTheme = computed(() => {
    const token: Record<string, unknown> = {
      colorTextLightSolid: '#ffffff',
      borderRadius: 8,
      ...themeColors.value.tokens
    };
    for (const [tokenName, varName] of CSS_TOKEN_MAP) {
      const value = getCSSVar(varName);
      if (value) {
        token[tokenName] = value;
      }
    }
    return {
      algorithm: isDarkTheme.value ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token
    };
  });

  const toggleTheme = () => {
    themeMode.value = isDarkTheme.value ? 'light' : 'dark';
  };

  watch(
    themeMode,
    () => {
      document.documentElement.dataset.theme = themeMode.value;
      writeString(STORAGE_KEYS.theme, themeMode.value);
    },
    { immediate: true }
  );

  // 同步算法生成的语义色到 CSS 变量（仅 CSS 有消费者的两个）
  watch(
    themeColors,
    (colors) => {
      const root = document.documentElement;
      for (const [varName, value] of Object.entries(colors.cssVars)) {
        root.style.setProperty(varName, value);
      }
    },
    { immediate: true }
  );

  return { themeMode, isDarkTheme, appTheme, themeColors, toggleTheme };
}
