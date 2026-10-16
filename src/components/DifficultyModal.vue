<template>
  <a-modal
    :open="open"
    :title="null"
    :footer="null"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    centered
    width="460px"
    wrap-class-name="custom-dialogue"
    @update:open="emit('update:open', $event)"
  >
    <div class="difficulty-modal">
      <h2 class="modal-title">{{ $t('welcome.title') }}</h2>
      <p class="modal-desc">{{ $t('welcome.desc') }}</p>

      <div class="options">
        <button
          v-for="item in OPTIONS"
          :key="item.value"
          type="button"
          class="option"
          :class="`option-${item.value}`"
          @click="emit('select', item.value)"
        >
          <span class="suits">{{ item.suits }}</span>
          <span class="name">{{ $t(`difficulty.${item.value}`) }}</span>
          <span class="tip">{{ $t(`difficulty.${item.value}-tip`) }}</span>
        </button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import type { Difficulty } from '@/types';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'select', difficulty: Difficulty): void;
}>();

const OPTIONS: Array<{ value: Difficulty; suits: string }> = [
  { value: 'easy', suits: '♠' },
  { value: 'medium', suits: '♠♥' },
  { value: 'hard', suits: '♠♥♦♣' }
];
</script>

<style scoped lang="less">
.difficulty-modal {
  padding: 8px 4px 4px;
}

.modal-title {
  margin: 0 0 6px;
  font-size: 1.35rem;
  font-weight: 700;
  text-align: center;
  color: var(--color-heading);
}

.modal-desc {
  margin: 0 0 18px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.options {
  display: flex;
  gap: 10px;
}

.option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-3px);
    border-color: var(--color-accent);
    box-shadow: 0 8px 20px var(--color-shadow-card);
  }

  .suits {
    font-size: 1.3rem;
    letter-spacing: 2px;
    color: var(--color-heading);
  }

  .name {
    font-size: 1rem;
    font-weight: 600;
  }

  .tip {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    text-align: center;
  }

  &:hover .suits {
    color: var(--color-accent);
  }
}
</style>
