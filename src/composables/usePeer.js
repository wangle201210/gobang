import { ref, reactive, onUnmounted } from 'vue'
import Peer from 'peerjs'

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
  // 玩家和观众列表
  const players = reactive({
    black: null, // { id, name }
    white: null,
  })
  const spectators = ref([]) // [{ id, name }]

  // 单个连接（非房主用）
  const hostConnection = ref(null)

  function generateRoomId() {
    return 'gobang-' + Math.random().toString(36).substring(2, 8)
  }

  function generateName() {
    return '玩家' + Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  function createRoom(onMessage) {
    return new Promise((resolve, reject) => {
      const roomId = generateRoomId()
      peer.value = new Peer(roomId)
      isHost.value = true
      myName.value = generateName()
      myRole.value = 'black'
      players.black = { id: 'host', name: myName.value }

      peer.value.on('open', (id) => {
        myPeerId.value = id
        isConnected.value = true
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

      // 分配角色
      let role = 'spectator'
      const name = generateName()

      if (!players.white) {
        role = 'white'
        players.white = { id: peerId, name }
      } else {
        spectators.value = [...spectators.value, { id: peerId, name }]
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
    })

    conn.on('data', (data) => {
      handleHostReceiveMessage(conn, data, onMessage)
    })

    conn.on('close', () => {
      handleDisconnect(conn.peer, onMessage)
    })
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
        })

        conn.on('data', (data) => {
          handleClientReceiveMessage(data, onMessage, resolve)
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

  function handleClientReceiveMessage(data, onMessage, resolveJoin) {
    if (data.type === 'init') {
      myRole.value = data.role
      myName.value = data.name
      players.black = data.players.black
      players.white = data.players.white
      spectators.value = data.spectators
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
      } else if (data.newPlayerId === myPeerId.value) {
        // 我被换上去了，变成玩家
        myRole.value = data.role
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
  }
}
