import { ref, computed } from 'vue'

const BOARD_SIZE = 15
const WIN_COUNT = 5

export function useGame() {
  // 棋盘状态: 0=空, 1=黑棋, 2=白棋
  const board = ref(createEmptyBoard())
  const currentPlayer = ref(1) // 1=黑棋先手
  const winner = ref(null)
  const myColor = ref(null) // 我的颜色: 1=黑, 2=白
  const gameStarted = ref(false)
  const moveHistory = ref([])

  function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0))
  }

  const isMyTurn = computed(() => {
    return gameStarted.value && currentPlayer.value === myColor.value && !winner.value
  })

  const gameStatus = computed(() => {
    if (winner.value) {
      return winner.value === myColor.value ? '你赢了!' : '你输了!'
    }
    if (!gameStarted.value) {
      return '等待对手加入...'
    }
    return isMyTurn.value ? '轮到你下棋' : '等待对手下棋...'
  })

  function placeStone(x, y, player = currentPlayer.value) {
    if (board.value[y][x] !== 0) return false
    if (winner.value) return false

    board.value[y][x] = player
    moveHistory.value.push({ x, y, player })

    if (checkWin(x, y, player)) {
      winner.value = player
    } else {
      currentPlayer.value = currentPlayer.value === 1 ? 2 : 1
    }
    return true
  }

  function checkWin(x, y, player) {
    const directions = [
      [1, 0],   // 横向
      [0, 1],   // 纵向
      [1, 1],   // 斜向 \
      [1, -1],  // 斜向 /
    ]

    for (const [dx, dy] of directions) {
      let count = 1

      // 正方向
      for (let i = 1; i < WIN_COUNT; i++) {
        const nx = x + dx * i
        const ny = y + dy * i
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break
        if (board.value[ny][nx] !== player) break
        count++
      }

      // 反方向
      for (let i = 1; i < WIN_COUNT; i++) {
        const nx = x - dx * i
        const ny = y - dy * i
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break
        if (board.value[ny][nx] !== player) break
        count++
      }

      if (count >= WIN_COUNT) return true
    }
    return false
  }

  function resetGame() {
    board.value = createEmptyBoard()
    currentPlayer.value = 1
    winner.value = null
    moveHistory.value = []
  }

  function startGame(color) {
    myColor.value = color
    gameStarted.value = true
  }

  return {
    board,
    currentPlayer,
    winner,
    myColor,
    gameStarted,
    moveHistory,
    isMyTurn,
    gameStatus,
    placeStone,
    resetGame,
    startGame,
    BOARD_SIZE,
  }
}
