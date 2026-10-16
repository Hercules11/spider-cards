<template>
  <a-modal
    :open="open"
    :title="$t('rules.title')"
    :footer="null"
    centered
    width="480px"
    wrap-class-name="custom-dialogue"
    @update:open="emit('update:open', $event)"
  >
    <ul class="rule-list">
      <li v-for="key in RULES" :key="key">{{ $t(`rules.${key}`) }}</li>
    </ul>
    <div class="shortcut">{{ $t('rules.shortcut') }}</div>
    <div class="modal-actions">
      <a-button type="primary" @click="emit('update:open', false)">
        {{ $t('rules.close') }}
      </a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const RULES = ['build', 'run', 'flip', 'deal', 'complete', 'score', 'win'];
</script>

<style scoped lang="less">
.rule-list {
  margin: 4px 0 12px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--color-text);

  li::marker {
    color: var(--color-accent);
  }
}

.shortcut {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-surface-soft);
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}

.modal-actions {
  margin-top: 16px;
  text-align: right;
}
</style>
