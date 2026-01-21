<script setup>
import { computed } from 'vue'

const props = defineProps({
  board: {
    type: Array,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  lastMove: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['place'])

const BOARD_SIZE = 15
const CELL_SIZE = 40
const PADDING = 24
const STONE_RADIUS = 18
const boardPixelSize = computed(() => (BOARD_SIZE - 1) * CELL_SIZE + PADDING * 2)

function handleClick(x, y) {
  if (props.disabled) return
  if (props.board[y][x] !== 0) return
  emit('place', { x, y })
}

function isLastMove(x, y) {
  return props.lastMove && props.lastMove.x === x && props.lastMove.y === y
}

// 生成棋盘线条
const lines = computed(() => {
  const result = []
  for (let i = 0; i < BOARD_SIZE; i++) {
    // 横线
    result.push({
      x1: PADDING,
      y1: PADDING + i * CELL_SIZE,
      x2: PADDING + (BOARD_SIZE - 1) * CELL_SIZE,
      y2: PADDING + i * CELL_SIZE,
    })
    // 竖线
    result.push({
      x1: PADDING + i * CELL_SIZE,
      y1: PADDING,
      x2: PADDING + i * CELL_SIZE,
      y2: PADDING + (BOARD_SIZE - 1) * CELL_SIZE,
    })
  }
  return result
})

// 星位点
const starPoints = [
  { x: 3, y: 3 }, { x: 11, y: 3 },
  { x: 3, y: 11 }, { x: 11, y: 11 },
  { x: 7, y: 7 }, // 天元
  { x: 3, y: 7 }, { x: 11, y: 7 },
  { x: 7, y: 3 }, { x: 7, y: 11 },
]

// 生成所有可点击的格子
const cells = computed(() => {
  const result = []
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      result.push({ x, y })
    }
  }
  return result
})
</script>

<template>
  <div class="w-full rounded-lg shadow-xl overflow-hidden touch-manipulation select-none">
    <svg
      :viewBox="`0 0 ${boardPixelSize} ${boardPixelSize}`"
      class="block w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- 棋盘背景 -->
      <rect
        x="0"
        y="0"
        :width="boardPixelSize"
        :height="boardPixelSize"
        fill="#DEB887"
      />

      <!-- 棋盘线条 -->
      <line
        v-for="(line, index) in lines"
        :key="index"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke="#8B4513"
        stroke-width="1"
      />

      <!-- 星位点 -->
      <circle
        v-for="(point, index) in starPoints"
        :key="'star-' + index"
        :cx="PADDING + point.x * CELL_SIZE"
        :cy="PADDING + point.y * CELL_SIZE"
        r="4"
        fill="#8B4513"
      />

      <!-- 可点击区域 -->
      <rect
        v-for="cell in cells"
        :key="`click-${cell.x}-${cell.y}`"
        :x="PADDING + cell.x * CELL_SIZE - CELL_SIZE / 2"
        :y="PADDING + cell.y * CELL_SIZE - CELL_SIZE / 2"
        :width="CELL_SIZE"
        :height="CELL_SIZE"
        fill="transparent"
        class="cursor-pointer hover:fill-black/10"
        :class="{ 'cursor-not-allowed hover:fill-transparent': disabled || board[cell.y][cell.x] !== 0 }"
        @click="handleClick(cell.x, cell.y)"
      />

      <!-- 棋子 -->
      <template v-for="(row, y) in board" :key="'row-' + y">
        <g v-for="(cell, x) in row" :key="'stone-' + x">
          <template v-if="cell !== 0">
            <!-- 棋子阴影 -->
            <circle
              :cx="PADDING + x * CELL_SIZE + 2"
              :cy="PADDING + y * CELL_SIZE + 2"
              :r="STONE_RADIUS"
              fill="rgba(0,0,0,0.3)"
            />
            <!-- 棋子本体 -->
            <circle
              :cx="PADDING + x * CELL_SIZE"
              :cy="PADDING + y * CELL_SIZE"
              :r="STONE_RADIUS"
              :fill="cell === 1 ? '#222' : '#fff'"
              :stroke="cell === 1 ? '#000' : '#999'"
              stroke-width="1"
            />
            <!-- 棋子高光 -->
            <circle
              :cx="PADDING + x * CELL_SIZE - 5"
              :cy="PADDING + y * CELL_SIZE - 5"
              r="4"
              :fill="cell === 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'"
            />
            <!-- 最后一步标记 -->
            <circle
              v-if="isLastMove(x, y)"
              :cx="PADDING + x * CELL_SIZE"
              :cy="PADDING + y * CELL_SIZE"
              r="5"
              fill="#f00"
            />
          </template>
        </g>
      </template>
    </svg>
  </div>
</template>
