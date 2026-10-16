<template>
  <div class="stats-bar">
    <div class="stat-group">
      <div class="stat stat-score">
        <span class="label">{{ $t('stats.score') }}</span>
        <b class="value">{{ score }}</b>
      </div>
      <div class="stat stat-moves">
        <span class="label">{{ $t('stats.moves') }}</span>
        <b class="value">{{ moves }}</b>
      </div>
      <div class="stat stat-time">
        <span class="label">{{ $t('stats.time') }}</span>
        <b class="value">{{ timeText }}</b>
      </div>
      <div class="stat stat-completed">
        <span class="label">{{ $t('stats.completed') }}</span>
        <span class="slots">
          <i
            v-for="slot in WINS_NEEDED"
            :key="slot"
            class="slot"
            :class="{
              filled: completed[slot - 1] !== undefined,
              red: completed[slot - 1] ? isRedSuit(completed[slot - 1]!) : false
            }"
          >
            <template v-if="completed[slot - 1]">{{ SUIT_SYMBOLS[completed[slot - 1]!] }}</template>
          </i>
        </span>
      </div>
    </div>

    <div class="action-group">
      <a-button size="small" :disabled="!canUndo" @click="emit('undo')">
        <UndoOutlined />
        {{ $t('actions.undo') }}
      </a-button>
      <a-button size="small" @click="emit('hint')">
        <BulbOutlined />
        {{ $t('actions.hint') }}
      </a-button>
      <a-button size="small" @click="emit('new-game')">
        <ReloadOutlined />
        {{ $t('actions.new-game') }}
      </a-button>
      <a-button size="small" @click="emit('help')">
        <QuestionCircleOutlined />
        {{ $t('actions.help') }}
      </a-button>
    </div>

    <div class="stock-group" :class="{ 'stock-hint': stockHint }">
      <a-tooltip :title="$t('actions.deal')">
        <button
          type="button"
          class="stock"
          data-testid="stock"
          :disabled="deals <= 0"
          :aria-label="$t('actions.deal')"
          @click="emit('deal')"
        >
          <i
            v-for="slot in Math.max(deals, 1)"
            :key="slot"
            class="stock-card"
            :class="{ empty: deals === 0 }"
          ></i>
        </button>
      </a-tooltip>
      <span class="stock-count" data-testid="stock-count">×{{ deals }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  BulbOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  UndoOutlined
} from '@ant-design/icons-vue';
import type { Suit } from '@/types';
import { isRedSuit, SUIT_SYMBOLS } from '@/core/cards';
import { WINS_NEEDED } from '@/core/rules';
import { formatDuration } from '@/utils';

const props = defineProps<{
  score: number;
  moves: number;
  seconds: number;
  completed: Suit[];
  deals: number;
  canUndo: boolean;
  /** 提示建议发牌时牌堆脉冲高亮 */
  stockHint: boolean;
}>();

const emit = defineEmits<{
  (event: 'undo'): void;
  (event: 'hint'): void;
  (event: 'new-game'): void;
  (event: 'help'): void;
  (event: 'deal'): void;
}>();

const timeText = computed(() => formatDuration(props.seconds));
</script>

<style scoped lang="less">
.stats-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  width: 100%;
  max-width: 1220px;
  margin: 0 auto 14px;
  padding: 0 16px;
}

.stat-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 8px;

  .label {
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .value {
    font-size: 1.12rem;
    font-variant-numeric: tabular-nums;
    color: var(--color-heading);
  }
}

.stat-completed {
  align-items: center;

  .slots {
    display: inline-flex;
    gap: 4px;
  }

  .slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 26px;
    border-radius: 5px;
    border: 1px dashed var(--color-border-strong);
    font-size: 0.8rem;
    font-style: normal;
    color: var(--color-text-muted);

    &.filled {
      border-style: solid;
      background: var(--color-surface);
      border-color: var(--color-border);
      color: var(--color-suit-black);
    }

    &.red {
      color: var(--color-suit-red);
    }
  }
}

.action-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.stock-group {
  display: flex;
  align-items: center;
  gap: 8px;

  &.stock-hint .stock {
    animation: stock-pulse 1.2s ease-in-out infinite;
    box-shadow: 0 0 0 3px var(--color-drop-ok);
  }
}

.stock {
  position: relative;
  display: block;
  padding: 0;
  height: 40px;
  width: 62px;
  border: none;
  background: none;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .stock-card {
    position: absolute;
    top: 4px;
    width: 26px;
    height: 36px;
    border-radius: 4px;
    border: 1px solid var(--color-card-back-border);
    background-color: var(--color-card-back);
    background-image:
      repeating-linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.16) 0,
        rgba(255, 255, 255, 0.16) 2px,
        transparent 2px,
        transparent 6px
      ),
      repeating-linear-gradient(
        -45deg,
        rgba(255, 255, 255, 0.16) 0,
        rgba(255, 255, 255, 0.16) 2px,
        transparent 2px,
        transparent 6px
      );
    box-shadow: 0 2px 5px var(--color-shadow-card);

    &:nth-child(1) {
      left: 0;
    }

    &:nth-child(2) {
      left: 6px;
    }

    &:nth-child(3) {
      left: 12px;
    }

    &:nth-child(4) {
      left: 18px;
    }

    &:nth-child(5) {
      left: 24px;
    }

    &.empty {
      left: 0;
      background: none;
      border: 2px dashed var(--color-empty-slot);
      box-shadow: none;
      filter: saturate(0);
      opacity: 0.55;
    }
  }
}

.stock-count {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

@keyframes stock-pulse {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@media (max-width: 860px) {
  .action-group {
    margin-left: 0;
  }
}
</style>
