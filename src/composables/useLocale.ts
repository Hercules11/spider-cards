import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { readString, STORAGE_KEYS, writeString } from '@/utils/storage';

/**
 * 语言切换：开关文字显示"点击后进入的状态"（当前中文 -> 按钮显示 En），
 * 切换 i18n locale 并持久化，刷新后保持一致
 */
export function useLocale() {
  const { locale } = useI18n();

  const stored = readString(STORAGE_KEYS.locale);
  const showTrans = ref(stored !== 'en');
  locale.value = showTrans.value ? 'zh' : 'en';

  watch(showTrans, (value) => {
    const next = value ? 'zh' : 'en';
    locale.value = next;
    writeString(STORAGE_KEYS.locale, next);
  });

  return { showTrans };
}
