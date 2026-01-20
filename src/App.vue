<script setup>
import { ref, computed } from 'vue'
import GameBoard from './components/GameBoard.vue'
import { useGame } from './composables/useGame'
import { usePeer } from './composables/usePeer'

const {
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
} = useGame()

const {
  myPeerId,
  isConnected,
  error: peerError,
  isHost,
  createRoom,
  joinRoom,
  sendMessage,
  disconnect,
} = usePeer()

// UI状态
const roomIdInput = ref('')
const isCreating = ref(false)
const isJoining = ref(false)
const showCopied = ref(false)

// 最后一步落子
const lastMove = computed(() => {
  if (moveHistory.value.length === 0) return null
  return moveHistory.value[moveHistory.value.length - 1]
})

// 处理收到的消息
function handleMessage(data) {
  if (data.type === 'move') {
    placeStone(data.x, data.y)
  } else if (data.type === 'restart') {
    resetGame()
  } else if (data.type === 'ready') {
    // 对方准备好了，游戏开始
    startGame(isHost.value ? 1 : 2) // 房主执黑先手
  }
}

// 创建房间
async function handleCreateRoom() {
  isCreating.value = true
  try {
    await createRoom(handleMessage)
  } catch (e) {
    console.error(e)
  }
  isCreating.value = false
}

// 加入房间
async function handleJoinRoom() {
  if (!roomIdInput.value.trim()) return
  isJoining.value = true
  try {
    await joinRoom(roomIdInput.value.trim(), handleMessage)
    // 加入成功后，通知房主
    sendMessage({ type: 'ready' })
    startGame(2) // 加入者执白
  } catch (e) {
    console.error(e)
  }
  isJoining.value = false
}

// 落子
function handlePlace({ x, y }) {
  if (!isMyTurn.value) return
  if (placeStone(x, y)) {
    sendMessage({ type: 'move', x, y })
  }
}

// 重新开始
function handleRestart() {
  resetGame()
  sendMessage({ type: 'restart' })
}

// 复制房间号
function copyRoomId() {
  navigator.clipboard.writeText(myPeerId.value)
  showCopied.value = true
  setTimeout(() => {
    showCopied.value = false
  }, 2000)
}

// 退出房间
function handleExit() {
  disconnect()
  resetGame()
}

// 我的棋子颜色文字
const myColorText = computed(() => {
  if (!myColor.value) return ''
  return myColor.value === 1 ? '黑棋' : '白棋'
})
</script>

<template>
  <div class="app">
    <h1>P2P 五子棋</h1>

    <!-- 未连接状态：显示创建/加入房间 -->
    <div v-if="!isConnected && !myPeerId" class="connection-panel">
      <div class="panel-section">
        <h3>创建房间</h3>
        <button
          @click="handleCreateRoom"
          :disabled="isCreating"
          class="btn btn-primary"
        >
          {{ isCreating ? '创建中...' : '创建新房间' }}
        </button>
      </div>

      <div class="divider">或</div>

      <div class="panel-section">
        <h3>加入房间</h3>
        <input
          v-model="roomIdInput"
          placeholder="输入房间号"
          class="input"
          @keyup.enter="handleJoinRoom"
        />
        <button
          @click="handleJoinRoom"
          :disabled="isJoining || !roomIdInput.trim()"
          class="btn btn-secondary"
        >
          {{ isJoining ? '加入中...' : '加入房间' }}
        </button>
      </div>

      <p v-if="peerError" class="error">{{ peerError }}</p>
    </div>

    <!-- 等待对手加入 -->
    <div v-else-if="myPeerId && !isConnected" class="waiting-panel">
      <h3>等待对手加入...</h3>
      <div class="room-id-display">
        <span>房间号:</span>
        <code>{{ myPeerId }}</code>
        <button @click="copyRoomId" class="btn btn-small">
          {{ showCopied ? '已复制!' : '复制' }}
        </button>
      </div>
      <p class="hint">将房间号发送给朋友，让他加入游戏</p>
      <button @click="handleExit" class="btn btn-text">取消</button>
    </div>

    <!-- 游戏中 -->
    <div v-else class="game-panel">
      <div class="game-info">
        <div class="status" :class="{ 'my-turn': isMyTurn, 'winner': winner }">
          {{ gameStatus }}
        </div>
        <div class="player-info">
          你是: <span :class="myColor === 1 ? 'black' : 'white'">{{ myColorText }}</span>
        </div>
      </div>

      <GameBoard
        :board="board"
        :disabled="!isMyTurn"
        :last-move="lastMove"
        @place="handlePlace"
      />

      <div class="game-actions">
        <button
          v-if="winner"
          @click="handleRestart"
          class="btn btn-primary"
        >
          再来一局
        </button>
        <button @click="handleExit" class="btn btn-text">
          退出房间
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

h1 {
  color: white;
  margin-bottom: 30px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.connection-panel,
.waiting-panel,
.game-panel {
  background: white;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.connection-panel {
  width: 320px;
}

.panel-section {
  margin: 20px 0;
}

.panel-section h3 {
  margin-bottom: 15px;
  color: #333;
}

.divider {
  color: #999;
  margin: 20px 0;
  position: relative;
}

.divider::before,
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: #ddd;
}

.divider::before {
  left: 0;
}

.divider::after {
  right: 0;
}

.input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  margin-bottom: 12px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: #667eea;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-small {
  padding: 6px 12px;
  font-size: 14px;
}

.btn-text {
  background: transparent;
  color: #999;
}

.btn-text:hover {
  color: #666;
}

.error {
  color: #e74c3c;
  margin-top: 15px;
}

.waiting-panel {
  width: 400px;
}

.room-id-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.room-id-display code {
  font-size: 18px;
  font-weight: bold;
  color: #667eea;
}

.hint {
  color: #999;
  font-size: 14px;
}

.game-panel {
  padding: 20px;
}

.game-info {
  margin-bottom: 20px;
}

.status {
  font-size: 20px;
  font-weight: bold;
  padding: 10px 20px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.status.my-turn {
  background: #e8f5e9;
  color: #2e7d32;
}

.status.winner {
  background: #fff3e0;
  color: #e65100;
}

.player-info {
  color: #666;
}

.player-info .black {
  color: #222;
  font-weight: bold;
}

.player-info .white {
  color: #999;
  font-weight: bold;
  text-shadow: 0 0 2px #000;
}

.game-actions {
  margin-top: 20px;
  display: flex;
  gap: 15px;
  justify-content: center;
}
</style>
