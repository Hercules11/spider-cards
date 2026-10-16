<template>
  <a-modal
    :open="open"
    :title="null"
    :footer="null"
    centered
    width="440px"
    wrap-class-name="custom-dialogue"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="state" class="win-modal">
      <div class="trophy">🎉</div>
      <h2 class="win-title">{{ $t('win.title') }}</h2>
      <p class="win-sub">{{ $t(`difficulty.${state.difficulty}`) }}</p>

      <div class="result-grid">
        <div class="cell">
          <span class="label">{{ $t('win.score') }}</span>
          <b class="value">{{ state.score }}</b>
        </div>
        <div class="cell">
          <span class="label">{{ $t('win.time') }}</span>
          <b class="value">{{ formatDuration(elapsedSeconds) }}</b>
        </div>
        <div class="cell">
          <span class="label">{{ $t('win.moves') }}</span>
          <b class="value">{{ state.moves }}</b>
        </div>
      </div>

      <div v-if="stats" class="best-grid">
        <span class="best-item">
          {{ $t('win.best-score') }}: <b>{{ stats.bestScore ?? '-' }}</b>
        </span>
        <span class="best-item">
          {{ $t('win.best-time') }}:
          <b>{{ stats.bestTimeSeconds !== null ? formatDuration(stats.bestTimeSeconds) : '-' }}</b>
        </span>
        <span class="best-item">
          {{ $t('win.best-moves') }}: <b>{{ stats.bestMoves ?? '-' }}</b>
        </span>
        <span class="best-item">
          {{ $t('win.games-won') }}: <b>{{ stats.gamesWon }}</b>
        </span>
      </div>

      <div class="modal-actions">
        <a-button type="primary" @click="emit('restart')">{{ $t('win.again') }}</a-button>
        <a-button @click="emit('change-difficulty')">{{ $t('win.change') }}</a-button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import type { DifficultyStats, GameState } from '@/types';
import { formatDuration } from '@/utils';

defineProps<{
  open: boolean;
  state: GameState | null;
  elapsedSeconds: number;
  stats: DifficultyStats | null;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'restart'): void;
  (event: 'change-difficulty'): void;
}>();
</script>

<style scoped lang="less">
.win-modal {
  text-align: center;
  padding-top: 4px;
}

.trophy {
  font-size: 2.6rem;
  animation: pop 0.6s ease;
}

.win-title {
  margin: 4px 0 2px;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--color-heading);
}

.win-sub {
  margin-bottom: 16px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;

  .cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 6px;
    border-radius: 10px;
    background: var(--color-surface-soft);

    .label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .value {
      font-size: 1.15rem;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
    }
  }
}

.best-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 16px;
  margin-bottom: 18px;
  font-size: 0.82rem;
  color: var(--color-text-secondary);

  b {
    color: var(--color-heading);
    font-variant-numeric: tabular-nums;
  }
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

@keyframes pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
