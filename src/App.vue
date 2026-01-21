<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import GameBoard from './components/GameBoard.vue'
import { useGame } from './composables/useGame'
import { usePeer } from './composables/usePeer'
import githubIcon from './assets/github.svg'

const {
  board,
  currentPlayer,
  winner,
  moveHistory,
  placeStone,
  resetGame,
  syncBoard,
} = useGame()

const {
  myPeerId,
  isConnected,
  error: peerError,
  isHost,
  myRole,
  myName,
  players,
  spectators,
  createRoom,
  joinRoom,
  sendMessage,
  changeName,
  giveUpSeat,
  disconnect,
  getSavedRoomInfo,
  clearRoomInfo,
} = usePeer()

// UI状态
const roomIdInput = ref('')
const isCreating = ref(false)
const isJoining = ref(false)
const showCopied = ref(false)
const isEditingName = ref(false)
const nameInput = ref('')

// 游戏是否开始（双方玩家都在）
const gameStarted = computed(() => {
  return players.black && players.white
})

// 是否轮到我下棋
const isMyTurn = computed(() => {
  if (!gameStarted.value || winner.value) return false
  if (myRole.value === 'spectator') return false
  return (currentPlayer.value === 1 && myRole.value === 'black') ||
         (currentPlayer.value === 2 && myRole.value === 'white')
})

// 游戏状态文字
const gameStatus = computed(() => {
  if (winner.value) {
    const winnerRole = winner.value === 1 ? 'black' : 'white'
    const winnerName = players[winnerRole]?.name || (winnerRole === 'black' ? '黑方' : '白方')
    if (myRole.value === winnerRole) {
      return '你赢了!'
    } else if (myRole.value === 'spectator') {
      return `${winnerName} 获胜!`
    } else {
      return '你输了!'
    }
  }
  if (!gameStarted.value) {
    return '等待对手加入...'
  }
  if (myRole.value === 'spectator') {
    const currentName = currentPlayer.value === 1 ? players.black?.name : players.white?.name
    return `${currentName || '黑方'} 思考中...`
  }
  return isMyTurn.value ? '轮到你下棋' : '等待对手下棋...'
})

// 最后一步落子
const lastMove = computed(() => {
  if (moveHistory.value.length === 0) return null
  return moveHistory.value[moveHistory.value.length - 1]
})

// 我的棋子颜色文字
const myColorText = computed(() => {
  if (myRole.value === 'black') return '黑棋'
  if (myRole.value === 'white') return '白棋'
  return '观战'
})

// 从 URL 获取房间号
function getRoomIdFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('room') || ''
}

// 更新 URL 中的房间号
function updateUrlWithRoom(roomId) {
  const url = new URL(window.location.href)
  if (roomId) {
    url.searchParams.set('room', roomId)
  } else {
    url.searchParams.delete('room')
  }
  window.history.replaceState({}, '', url.toString())
}

// 获取分享链接
function getShareUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('room', myPeerId.value)
  return url.toString()
}

// 复制到剪贴板
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {}
  }
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  try {
    document.execCommand('copy')
    return true
  } catch (e) {
    return false
  } finally {
    document.body.removeChild(textArea)
  }
}

// 页面加载时检查 URL 参数，支持身份恢复
onMounted(async () => {
  const urlRoomId = getRoomIdFromUrl()
  const savedRoom = getSavedRoomInfo()

  if (urlRoomId && savedRoom && savedRoom.roomId === urlRoomId) {
    // URL 和保存的房间匹配，尝试恢复
    if (savedRoom.isHost) {
      // 我是房主，用同一个 roomId 重建房间
      await handleCreateRoom(urlRoomId)
    } else {
      // 我是加入者，尝试重连
      roomIdInput.value = urlRoomId
      await handleJoinRoom()
    }
  } else if (urlRoomId) {
    // URL 有房间号但没有匹配的保存信息，正常加入
    roomIdInput.value = urlRoomId
    await handleJoinRoom()
  }
})

// 创建房间后更新 URL
watch(myPeerId, (newId) => {
  if (newId && isHost.value) {
    updateUrlWithRoom(newId)
  }
})

// 处理收到的消息
function handleMessage(data) {
  if (data.type === 'move') {
    placeStone(data.x, data.y)
  } else if (data.type === 'restart') {
    resetGame()
  } else if (data.type === 'sync') {
    // 同步棋盘状态给新加入的观众
    syncBoard(data.board, data.currentPlayer, data.moveHistory)
  } else if (data.type === 'member_joined' && isHost.value) {
    // 新成员加入时，同步当前棋局状态
    if (moveHistory.value.length > 0) {
      sendMessage({
        type: 'sync',
        board: board.value,
        currentPlayer: currentPlayer.value,
        moveHistory: moveHistory.value,
      })
    }
  }
}

// 创建房间
async function handleCreateRoom(existingRoomId = null) {
  // 如果传入的是事件对象（从按钮点击），忽略它
  const roomId = typeof existingRoomId === 'string' ? existingRoomId : null
  isCreating.value = true
  try {
    await createRoom(handleMessage, roomId)
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

// 复制分享链接
async function copyShareLink() {
  const success = await copyToClipboard(getShareUrl())
  if (success) {
    showCopied.value = true
    setTimeout(() => {
      showCopied.value = false
    }, 2000)
  }
}

// 退出房间
function handleExit() {
  disconnect()
  resetGame()
  clearRoomInfo()
  updateUrlWithRoom('')
}

// 开始编辑名字
function startEditName() {
  nameInput.value = myName.value
  isEditingName.value = true
}

// 保存名字
function saveName() {
  if (nameInput.value.trim()) {
    changeName(nameInput.value.trim())
  }
  isEditingName.value = false
}

// 取消编辑
function cancelEditName() {
  isEditingName.value = false
}

// 是否是玩家（可以让位）
const isPlayer = computed(() => {
  return myRole.value === 'black' || myRole.value === 'white'
})

// 让位给观众
async function handleGiveUpSeat(spectatorId, spectatorName) {
  if (!isPlayer.value) return
  try {
    await ElMessageBox.confirm(
      `确定要让位给 ${spectatorName} 吗？`,
      '让位确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    giveUpSeat(spectatorId)
    ElMessage.success('已让位')
  } catch {
    // 用户取消
  }
}
</script>

<template>
  <div class="min-h-screen min-h-dvh flex flex-col items-center p-3 md:p-5 pt-[env(safe-area-inset-top,20px)] pb-[env(safe-area-inset-bottom,20px)] bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100">
    <!-- 手机端标题 -->
    <div class="lg:hidden flex items-center gap-3 mb-4">
      <h1 class="text-indigo-600 text-2xl font-bold">P2P 五子棋</h1>
      <a href="https://github.com/wangle201210/gobang" target="_blank" class="opacity-60 hover:opacity-100 transition-opacity">
        <img :src="githubIcon" alt="GitHub" class="w-6 h-6" />
      </a>
    </div>

    <!-- 未连接状态：显示创建/加入房间 -->
    <div v-if="!isConnected && !myPeerId" class="bg-white rounded-2xl p-6 shadow-2xl text-center w-full max-w-md">
      <div class="my-4">
        <h3 class="mb-3 text-gray-800 font-medium">创建房间</h3>
        <button
          @click="handleCreateRoom"
          :disabled="isCreating"
          class="w-full py-3 px-6 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
        >
          {{ isCreating ? '创建中...' : '创建新房间' }}
        </button>
      </div>

      <div class="text-gray-400 my-4 relative before:content-[''] before:absolute before:top-1/2 before:left-0 before:w-[40%] before:h-px before:bg-gray-200 after:content-[''] after:absolute after:top-1/2 after:right-0 after:w-[40%] after:h-px after:bg-gray-200">或</div>

      <div class="my-4">
        <h3 class="mb-3 text-gray-800 font-medium">加入房间</h3>
        <input
          v-model="roomIdInput"
          placeholder="输入房间号"
          class="w-full p-3 border-2 border-gray-200 rounded-lg text-base mb-3 focus:outline-none focus:border-indigo-500 transition-colors"
          @keyup.enter="handleJoinRoom"
        />
        <button
          @click="handleJoinRoom"
          :disabled="isJoining || !roomIdInput.trim()"
          class="w-full py-3 px-6 rounded-lg bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ isJoining ? '加入中...' : '加入房间' }}
        </button>
      </div>

      <p v-if="peerError" class="text-red-500 mt-4 text-sm">{{ peerError }}</p>
    </div>

    <!-- 等待对手加入（房主视角，还没有白方时） -->
    <div v-else-if="isHost && !players.white" class="bg-white rounded-2xl p-6 shadow-2xl text-center w-full max-w-md">
      <h3 class="text-lg font-medium text-gray-800 mb-4">等待对手加入...</h3>
      <div class="flex flex-col items-center gap-2 p-3 bg-gray-100 rounded-lg my-4">
        <span class="text-sm text-gray-600">分享链接:</span>
        <code class="text-xs text-indigo-600 break-all leading-relaxed">{{ getShareUrl() }}</code>
      </div>
      <button @click="copyShareLink" class="py-3 px-6 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg active:scale-[0.98] transition-all my-2">
        {{ showCopied ? '已复制!' : '复制链接' }}
      </button>
      <p class="text-gray-500 text-sm mt-3 leading-relaxed">将链接发送给朋友，打开即可加入游戏</p>
      <button @click="handleExit" class="mt-4 py-2 px-4 bg-transparent text-gray-400 hover:text-gray-600 transition-colors">取消</button>
    </div>

    <!-- 游戏中 -->
    <div v-else class="flex flex-col lg:flex-row gap-4 items-center lg:items-start w-full max-w-5xl justify-center">
      <!-- 手机端成员列表在上方 -->
      <div class="lg:hidden bg-white rounded-2xl p-4 shadow-2xl w-full max-w-lg">
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-xs text-gray-500">对战:</span>
          <span v-if="players.black" class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
            <span class="w-2.5 h-2.5 rounded-full bg-gray-800"></span>
            {{ players.black.name }}
          </span>
          <span v-if="players.white" class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
            <span class="w-2.5 h-2.5 rounded-full bg-white border border-gray-400"></span>
            {{ players.white.name }}
          </span>
          <span v-if="!players.white" class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-400">
            等待加入...
          </span>
        </div>
        <div v-if="spectators.length > 0" class="flex flex-wrap gap-2 items-center mt-2 pt-2 border-t border-gray-100">
          <span class="text-xs text-gray-500">观战:</span>
          <span
            v-for="spec in spectators"
            :key="spec.id"
            class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
            :class="{ 'cursor-pointer hover:bg-indigo-100 hover:text-indigo-700': isPlayer }"
            :title="isPlayer ? '点击让位给TA' : ''"
            @click="isPlayer && handleGiveUpSeat(spec.id, spec.name)"
          >
            <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
            {{ spec.name }}
          </span>
        </div>
      </div>

      <!-- 手机端状态和信息 -->
      <div class="lg:hidden bg-white rounded-2xl p-4 shadow-2xl w-full max-w-lg">
        <div
          class="text-base font-bold py-2 px-4 rounded-lg mb-2 text-center"
          :class="{
            'bg-green-100 text-green-700': isMyTurn,
            'bg-orange-100 text-orange-700': winner,
            'bg-blue-100 text-blue-700': myRole === 'spectator' && !winner,
            'bg-gray-100 text-gray-600': !isMyTurn && !winner && myRole !== 'spectator'
          }"
        >
          {{ gameStatus }}
        </div>
        <div class="flex items-center justify-center gap-2 text-sm text-gray-600">
          <span
            class="px-2 py-0.5 rounded text-xs font-bold"
            :class="{
              'bg-gray-800 text-white': myRole === 'black',
              'bg-gray-100 text-gray-800 border border-gray-300': myRole === 'white',
              'bg-blue-100 text-blue-700': myRole === 'spectator'
            }"
          >
            {{ myColorText }}
          </span>
          <template v-if="!isEditingName">
            <span class="font-medium">{{ myName }}</span>
            <button @click="startEditName" class="p-1 opacity-70 hover:opacity-100 transition-opacity" title="修改名字">✏️</button>
          </template>
          <template v-else>
            <input
              v-model="nameInput"
              class="px-2 py-1 border border-gray-300 rounded text-sm w-24"
              @keyup.enter="saveName"
              @keyup.esc="cancelEditName"
            />
            <button @click="saveName" class="p-1 opacity-70 hover:opacity-100">✓</button>
            <button @click="cancelEditName" class="p-1 opacity-70 hover:opacity-100">✕</button>
          </template>
        </div>
      </div>

      <!-- 棋盘区域 - 电脑端只显示棋盘 -->
      <div class="bg-white rounded-2xl p-3 md:p-4 shadow-2xl w-full max-w-[380px] md:max-w-[560px] lg:max-w-[670px] xl:max-w-[750px]">
        <GameBoard
          :board="board"
          :disabled="!isMyTurn"
          :last-move="lastMove"
          @place="handlePlace"
        />

        <!-- 手机端操作按钮 -->
        <div class="lg:hidden mt-4 flex gap-3 justify-center flex-wrap">
          <button
            v-if="winner && myRole !== 'spectator'"
            @click="handleRestart"
            class="py-3 px-6 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg active:scale-[0.98] transition-all"
          >
            再来一局
          </button>
          <button @click="copyShareLink" class="py-2 px-4 rounded-lg bg-gray-100 text-gray-800 text-sm hover:bg-gray-200 active:bg-gray-300 transition-colors">
            {{ showCopied ? '已复制!' : '邀请好友' }}
          </button>
          <button @click="handleExit" class="py-2 px-4 bg-transparent text-gray-400 hover:text-gray-600 transition-colors text-sm">
            退出房间
          </button>
        </div>
      </div>

      <!-- 电脑端右侧面板 -->
      <div class="hidden lg:flex flex-col gap-4 min-w-[200px] max-w-[240px]">
        <!-- 标题 -->
        <div class="flex items-center justify-center gap-3">
          <h1 class="text-indigo-600 text-2xl font-bold">P2P 五子棋</h1>
          <a href="https://github.com/wangle201210/gobang" target="_blank" class="opacity-60 hover:opacity-100 transition-opacity">
            <img :src="githubIcon" alt="GitHub" class="w-6 h-6" />
          </a>
        </div>

        <!-- 游戏状态 -->
        <div class="bg-white rounded-2xl p-4 shadow-2xl">
          <div
            class="text-lg font-bold py-2 px-4 rounded-lg mb-3 text-center"
            :class="{
              'bg-green-100 text-green-700': isMyTurn,
              'bg-orange-100 text-orange-700': winner,
              'bg-blue-100 text-blue-700': myRole === 'spectator' && !winner,
              'bg-gray-100 text-gray-600': !isMyTurn && !winner && myRole !== 'spectator'
            }"
          >
            {{ gameStatus }}
          </div>

          <!-- 我的信息 -->
          <div class="flex items-center justify-center gap-2 text-sm text-gray-600">
            <span
              class="px-2 py-0.5 rounded text-xs font-bold"
              :class="{
                'bg-gray-800 text-white': myRole === 'black',
                'bg-gray-100 text-gray-800 border border-gray-300': myRole === 'white',
                'bg-blue-100 text-blue-700': myRole === 'spectator'
              }"
            >
              {{ myColorText }}
            </span>
            <template v-if="!isEditingName">
              <span class="font-medium">{{ myName }}</span>
              <button @click="startEditName" class="p-1 opacity-70 hover:opacity-100 transition-opacity" title="修改名字">✏️</button>
            </template>
            <template v-else>
              <input
                v-model="nameInput"
                class="px-2 py-1 border border-gray-300 rounded text-sm w-24"
                @keyup.enter="saveName"
                @keyup.esc="cancelEditName"
              />
              <button @click="saveName" class="p-1 opacity-70 hover:opacity-100">✓</button>
              <button @click="cancelEditName" class="p-1 opacity-70 hover:opacity-100">✕</button>
            </template>
          </div>
        </div>

        <!-- 成员列表 -->
        <div class="bg-white rounded-2xl p-4 shadow-2xl">
          <h3 class="text-sm font-medium text-gray-800 border-b border-gray-200 pb-2 mb-3">房间成员</h3>

          <div class="mb-4">
            <h4 class="text-xs text-gray-500 mb-2">对战玩家</h4>
            <div v-if="players.black" class="flex items-center gap-2 py-1.5 text-sm">
              <span class="w-2.5 h-2.5 rounded-full bg-gray-800 shrink-0"></span>
              <span class="flex-1 truncate">{{ players.black.name }}</span>
              <span class="text-xs text-gray-400">黑方</span>
            </div>
            <div v-if="players.white" class="flex items-center gap-2 py-1.5 text-sm">
              <span class="w-2.5 h-2.5 rounded-full bg-white border border-gray-400 shrink-0"></span>
              <span class="flex-1 truncate">{{ players.white.name }}</span>
              <span class="text-xs text-gray-400">白方</span>
            </div>
            <div v-if="!players.white" class="flex items-center gap-2 py-1.5 text-sm opacity-50">
              <span class="w-2.5 h-2.5 rounded-full border border-dashed border-gray-400 shrink-0"></span>
              <span class="flex-1">等待加入...</span>
            </div>
          </div>

          <div v-if="spectators.length > 0">
            <h4 class="text-xs text-gray-500 mb-2">观战 ({{ spectators.length }})</h4>
            <div
              v-for="spec in spectators"
              :key="spec.id"
              class="flex items-center gap-2 py-1.5 text-sm rounded px-1 -mx-1"
              :class="{ 'cursor-pointer hover:bg-indigo-50': isPlayer }"
              :title="isPlayer ? '点击让位给TA' : ''"
              @click="isPlayer && handleGiveUpSeat(spec.id, spec.name)"
            >
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span class="flex-1 truncate">{{ spec.name }}</span>
              <span v-if="isPlayer" class="text-xs text-gray-400">让位</span>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="bg-white rounded-2xl p-4 shadow-2xl flex flex-col gap-2">
          <button
            v-if="winner && myRole !== 'spectator'"
            @click="handleRestart"
            class="w-full py-2 px-4 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg active:scale-[0.98] transition-all"
          >
            再来一局
          </button>
          <button @click="copyShareLink" class="w-full py-2 px-4 rounded-lg bg-gray-100 text-gray-800 text-sm hover:bg-gray-200 active:bg-gray-300 transition-colors">
            {{ showCopied ? '已复制!' : '邀请好友' }}
          </button>
          <button @click="handleExit" class="w-full py-2 px-4 bg-transparent text-gray-400 hover:text-gray-600 transition-colors text-sm">
            退出房间
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
