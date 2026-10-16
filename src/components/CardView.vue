<template>
  <div class="card" :class="{ 'is-down': !card.faceUp, 'is-red': red }">
    <template v-if="card.faceUp">
      <span class="corner corner-tl">
        <b class="rank">{{ label }}</b>
        <i class="suit">{{ symbol }}</i>
      </span>
      <span class="pip">{{ symbol }}</span>
      <span class="corner corner-br">
        <b class="rank">{{ label }}</b>
        <i class="suit">{{ symbol }}</i>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '@/types';
import { isRedSuit, rankLabel, SUIT_SYMBOLS } from '@/core/cards';

const props = defineProps<{
  card: Card;
}>();

const red = computed(() => isRedSuit(props.card.suit));
const label = computed(() => rankLabel(props.card.rank));
const symbol = computed(() => SUIT_SYMBOLS[props.card.suit]);
</script>

<style scoped lang="less">
.card {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 7;
  border-radius: calc(var(--card-w, 80px) * 0.09);
  background: var(--color-card-face);
  border: 1px solid var(--color-card-border);
  box-shadow:
    0 1px 2px var(--color-shadow-card),
    0 2px 6px var(--color-shadow-card);
  color: var(--color-suit-black);
  overflow: hidden;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &.is-red {
    color: var(--color-suit-red);
  }

  /* 背面：蓝色斜纹 */
  &.is-down {
    background-color: var(--color-card-back);
    background-image:
      repeating-linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.16) 0,
        rgba(255, 255, 255, 0.16) 2px,
        transparent 2px,
        transparent 7px
      ),
      repeating-linear-gradient(
        -45deg,
        rgba(255, 255, 255, 0.16) 0,
        rgba(255, 255, 255, 0.16) 2px,
        transparent 2px,
        transparent 7px
      ),
      linear-gradient(150deg, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.16));
    border-color: var(--color-card-back-border);
  }

  .corner {
    position: absolute;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: calc(var(--card-w, 80px) * 0.035);
    line-height: 1;
    font-style: normal;
    padding: calc(var(--card-w, 80px) * 0.06);

    .rank {
      font-size: calc(var(--card-w, 80px) * 0.3);
      font-weight: 700;
    }

    .suit {
      font-size: calc(var(--card-w, 80px) * 0.22);
      font-style: normal;
    }

    &.corner-tl {
      top: 0;
      left: 0;
    }

    &.corner-br {
      right: 0;
      bottom: 0;
      transform: rotate(180deg);
    }
  }

  .pip {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--card-w, 80px) * 0.56);
    opacity: 0.92;
  }
}
</style>
