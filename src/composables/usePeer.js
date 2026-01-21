import { ref, reactive, onUnmounted } from 'vue'
import Peer from 'peerjs'

// 持久化用户 ID
function getOrCreateUserId() {
  let id = localStorage.getItem('gobang-user-id')
  if (!id) {
    id = 'user-' + Math.random().toString(36).substring(2, 12)
    localStorage.setItem('gobang-user-id', id)
  }
  return id
}

// 房间信息存储
function saveRoomInfo(roomId, isHostFlag, role, name) {
  localStorage.setItem('gobang-room', JSON.stringify({
    roomId, isHost: isHostFlag, role, name, timestamp: Date.now()
  }))
}

function getSavedRoomInfo() {
  const data = localStorage.getItem('gobang-room')
  if (!data) return null
  try {
    const info = JSON.parse(data)
    // 超过1小时的数据视为过期
    if (Date.now() - info.timestamp > 3600000) {
      localStorage.removeItem('gobang-room')
      return null
    }
    return info
  } catch {
    return null
  }
}

function clearRoomInfo() {
  localStorage.removeItem('gobang-room')
}

export function usePeer() {
  const peer = ref(null)
  const myPeerId = ref('')
  const isConnected = ref(false)
  const error = ref('')
  const isHost = ref(false)
  const myRole = ref('') // 'black', 'white', 'spectator'
  const myName = ref('')

  // 所有连接（房主用）
  const connections = reactive(new Map())
  // userId -> { name, role } 用于身份恢复（房主用）
  const membersByUserId = reactive(new Map())
  // 玩家和观众列表
  const players = reactive({
    black: null, // { id, name, oderId }
    white: null,
  })
  const spectators = ref([]) // [{ id, name, userId }]

  // 单个连接（非房主用）
  const hostConnection = ref(null)

  function generateRoomId() {
    return 'gobang-' + Math.random().toString(36).substring(2, 8)
  }

  // 生成随机名字（用于其他玩家）
  function generateRandomName() {
    return '玩家' + Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  // 获取当前用户的名字（优先使用保存的名字）
  function getMyName() {
    const savedRoom = getSavedRoomInfo()
    if (savedRoom && savedRoom.name) {
      return savedRoom.name
    }
    return generateRandomName()
  }

  function createRoom(onMessage, existingRoomId = null) {
    return new Promise((resolve, reject) => {
      const roomId = existingRoomId || generateRoomId()
      peer.value = new Peer(roomId)
      isHost.value = true
      myName.value = getMyName()
      myRole.value = 'black'
      const hostUserId = getOrCreateUserId()
      players.black = { id: 'host', name: myName.value, oderId: hostUserId }

      peer.value.on('open', (id) => {
        myPeerId.value = id
        isConnected.value = true
        // 保存房间信息
        saveRoomInfo(id, true, 'black', myName.value)
        resolve(id)
      })

      peer.value.on('connection', (conn) => {
        handleNewConnection(conn, onMessage)
      })

      peer.value.on('error', (err) => {
        error.value = err.message
        reject(err)
      })
    })
  }

  function handleNewConnection(conn, onMessage) {
    conn.on('open', () => {
      const peerId = conn.peer
      connections.set(peerId, conn)
      // 不立即分配角色，等待 identify 消息
    })

    conn.on('data', (data) => {
      if (data.type === 'identify') {
        handleIdentify(conn, data, onMessage)
      } else {
        handleHostReceiveMessage(conn, data, onMessage)
      }
    })

    conn.on('close', () => {
      handleDisconnect(conn.peer, onMessage)
    })
  }

  // 处理身份识别消息
  function handleIdentify(conn, data, onMessage) {
    const peerId = conn.peer
    const { oderId, savedName, savedRole, savedRoomId } = data
    let role, name

    // 检查是否可以恢复之前的角色
    if (savedRoomId === myPeerId.value && savedRole) {
      // 客户端声称是这个房间的成员
      if (savedRole === 'white' && !players.white) {
        // 白方位置空着，可以恢复
        role = 'white'
      } else if (savedRole === 'spectator') {
        // 观众可以直接恢复
        role = 'spectator'
      } else {
        // 角色已被占用，重新分配
        role = !players.white ? 'white' : 'spectator'
      }
      name = savedName || generateRandomName()
    } else {
      // 新玩家，正常分配
      role = !players.white ? 'white' : 'spectator'
      name = savedName || generateRandomName()
    }

    // 更新成员信息
    membersByUserId.set(oderId, { name, role, peerId })

    // 更新玩家/观众列表
    if (role === 'white') {
      players.white = { id: peerId, name, oderId }
    } else {
      spectators.value = [...spectators.value, { id: peerId, name, oderId }]
    }

    // 发送初始化信息给新连接
    conn.send({
      type: 'init',
      role,
      name,
      players: {
        black: players.black,
        white: players.white,
      },
      spectators: spectators.value,
    })

    // 广播新成员加入
    broadcast({
      type: 'member_update',
      players: {
        black: players.black,
        white: players.white,
      },
      spectators: spectators.value,
    }, peerId)

    // 通知上层有新连接
    if (onMessage) {
      onMessage({
        type: 'member_joined',
        role,
        peerId,
        name,
      })
    }
  }

  function handleHostReceiveMessage(conn, data, onMessage) {
    const peerId = conn.peer

    if (data.type === 'name_change') {
      // 更新名字
      updateMemberName(peerId, data.name)
      // 广播给所有人
      broadcast({
        type: 'member_update',
        players: {
          black: players.black,
          white: players.white,
        },
        spectators: spectators.value,
      })
    } else if (data.type === 'swap_seat_request') {
      // 非房主请求让位
      doSwapSeat(peerId, data.spectatorId)
    } else if (data.type === 'move') {
      // 转发棋步给所有人
      broadcast(data, peerId)
      if (onMessage) onMessage(data)
    } else if (data.type === 'restart') {
      broadcast(data, peerId)
      if (onMessage) onMessage(data)
    } else {
      if (onMessage) onMessage(data)
    }
  }

  function updateMemberName(peerId, newName) {
    if (players.black && players.black.id === peerId) {
      players.black.name = newName
    } else if (players.white && players.white.id === peerId) {
      players.white.name = newName
    } else {
      const idx = spectators.value.findIndex(s => s.id === peerId)
      if (idx !== -1) {
        spectators.value[idx].name = newName
        spectators.value = [...spectators.value]
      }
    }
  }

  function handleDisconnect(peerId, onMessage) {
    connections.delete(peerId)

    // 从列表中移除
    if (players.white && players.white.id === peerId) {
      players.white = null
    } else {
      spectators.value = spectators.value.filter(s => s.id !== peerId)
    }

    // 广播成员更新
    broadcast({
      type: 'member_update',
      players: {
        black: players.black,
        white: players.white,
      },
      spectators: spectators.value,
    })

    if (onMessage) {
      onMessage({
        type: 'member_left',
        peerId,
      })
    }
  }

  function broadcast(data, excludePeerId = null) {
    connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId) {
        conn.send(data)
      }
    })
  }

  function joinRoom(roomId, onMessage) {
    return new Promise((resolve, reject) => {
      peer.value = new Peer()
      isHost.value = false

      peer.value.on('open', (id) => {
        myPeerId.value = id
        const conn = peer.value.connect(roomId, { reliable: true })
        hostConnection.value = conn

        conn.on('open', () => {
          isConnected.value = true
          error.value = ''
          // 发送身份识别消息
          const oderId = getOrCreateUserId()
          const savedRoom = getSavedRoomInfo()
          conn.send({
            type: 'identify',
            oderId,
            savedName: savedRoom?.name || null,
            savedRole: savedRoom?.role || null,
            savedRoomId: savedRoom?.roomId || null,
          })
        })

        conn.on('data', (data) => {
          handleClientReceiveMessage(data, onMessage, resolve, roomId)
        })

        conn.on('close', () => {
          isConnected.value = false
          error.value = '房主已断开连接'
        })

        conn.on('error', (err) => {
          error.value = err.message
        })
      })

      peer.value.on('error', (err) => {
        error.value = err.message
        reject(err)
      })
    })
  }

  function handleClientReceiveMessage(data, onMessage, resolveJoin, roomId) {
    if (data.type === 'init') {
      myRole.value = data.role
      myName.value = data.name
      players.black = data.players.black
      players.white = data.players.white
      spectators.value = data.spectators
      // 保存房间信息
      if (roomId) {
        saveRoomInfo(roomId, false, data.role, data.name)
      }
      if (resolveJoin) resolveJoin()
      if (onMessage) onMessage({ type: 'initialized', role: data.role })
    } else if (data.type === 'member_update') {
      players.black = data.players.black
      players.white = data.players.white
      spectators.value = data.spectators
      if (onMessage) onMessage(data)
    } else if (data.type === 'role_swap') {
      players.black = data.players.black
      players.white = data.players.white
      spectators.value = data.spectators
      // 更新自己的角色
      if (data.swappedPlayerId === myPeerId.value) {
        // 我被换下来了，变成观众
        myRole.value = 'spectator'
        // 更新保存的房间信息
        const savedRoom = getSavedRoomInfo()
        if (savedRoom) {
          saveRoomInfo(savedRoom.roomId, savedRoom.isHost, 'spectator', myName.value)
        }
      } else if (data.newPlayerId === myPeerId.value) {
        // 我被换上去了，变成玩家
        myRole.value = data.role
        // 更新保存的房间信息
        const savedRoom = getSavedRoomInfo()
        if (savedRoom) {
          saveRoomInfo(savedRoom.roomId, savedRoom.isHost, data.role, myName.value)
        }
      }
      if (onMessage) onMessage(data)
    } else {
      if (onMessage) onMessage(data)
    }
  }

  function sendMessage(data) {
    if (isHost.value) {
      // 房主广播给所有人
      broadcast(data)
    } else if (hostConnection.value) {
      // 非房主发给房主
      hostConnection.value.send(data)
    }
  }

  function changeName(newName) {
    myName.value = newName
    // 更新保存的房间信息
    const savedRoom = getSavedRoomInfo()
    if (savedRoom) {
      saveRoomInfo(savedRoom.roomId, savedRoom.isHost, savedRoom.role, newName)
    }
    if (isHost.value) {
      // 房主直接更新
      if (players.black && players.black.id === 'host') {
        players.black.name = newName
      }
      broadcast({
        type: 'member_update',
        players: {
          black: players.black,
          white: players.white,
        },
        spectators: spectators.value,
      })
    } else {
      // 非房主通知房主
      sendMessage({ type: 'name_change', name: newName })
    }
  }

  // 让位给观众
  function giveUpSeat(spectatorId) {
    if (isHost.value) {
      // 房主让位
      doSwapSeat('host', spectatorId)
    } else {
      // 非房主请求让位
      sendMessage({ type: 'swap_seat_request', spectatorId })
    }
  }

  // 执行让位（仅房主调用）
  function doSwapSeat(playerId, spectatorId) {
    // 找到观众
    const specIndex = spectators.value.findIndex(s => s.id === spectatorId)
    if (specIndex === -1) return

    const spectator = spectators.value[specIndex]

    // 确定是黑方还是白方让位
    let role = null
    let oldPlayer = null

    if (players.black && players.black.id === playerId) {
      role = 'black'
      oldPlayer = players.black
    } else if (players.white && players.white.id === playerId) {
      role = 'white'
      oldPlayer = players.white
    }

    if (!role || !oldPlayer) return

    // 交换位置
    if (role === 'black') {
      players.black = { id: spectatorId, name: spectator.name }
    } else {
      players.white = { id: spectatorId, name: spectator.name }
    }

    // 原玩家变成观众
    spectators.value = spectators.value.filter(s => s.id !== spectatorId)
    spectators.value = [...spectators.value, { id: playerId, name: oldPlayer.name }]

    // 更新房主自己的角色（如果是房主让位）
    if (playerId === 'host') {
      myRole.value = 'spectator'
      // 更新保存的房间信息
      const savedRoom = getSavedRoomInfo()
      if (savedRoom) {
        saveRoomInfo(savedRoom.roomId, true, 'spectator', myName.value)
      }
    }

    // 广播更新
    broadcast({
      type: 'role_swap',
      players: {
        black: players.black,
        white: players.white,
      },
      spectators: spectators.value,
      swappedPlayerId: playerId,
      newPlayerId: spectatorId,
      role: role,
    })
  }

  function disconnect() {
    if (hostConnection.value) {
      hostConnection.value.close()
    }
    connections.forEach(conn => conn.close())
    connections.clear()
    if (peer.value) {
      peer.value.destroy()
    }
    isConnected.value = false
    hostConnection.value = null
    peer.value = null
    myRole.value = ''
    myName.value = ''
    players.black = null
    players.white = null
    spectators.value = []
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    myPeerId,
    isConnected,
    error,
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
  }
}
