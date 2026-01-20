import { ref, onUnmounted } from 'vue'
import Peer from 'peerjs'

export function usePeer() {
  const peer = ref(null)
  const connection = ref(null)
  const myPeerId = ref('')
  const isConnected = ref(false)
  const error = ref('')
  const isHost = ref(false)

  function generateRoomId() {
    return 'gobang-' + Math.random().toString(36).substring(2, 8)
  }

  function createRoom(onMessage) {
    return new Promise((resolve, reject) => {
      const roomId = generateRoomId()
      peer.value = new Peer(roomId)
      isHost.value = true

      peer.value.on('open', (id) => {
        myPeerId.value = id
        resolve(id)
      })

      peer.value.on('connection', (conn) => {
        connection.value = conn
        setupConnection(conn, onMessage)
      })

      peer.value.on('error', (err) => {
        error.value = err.message
        reject(err)
      })
    })
  }

  function joinRoom(roomId, onMessage) {
    return new Promise((resolve, reject) => {
      peer.value = new Peer()
      isHost.value = false

      peer.value.on('open', () => {
        const conn = peer.value.connect(roomId, { reliable: true })
        connection.value = conn
        setupConnection(conn, onMessage)

        conn.on('open', () => {
          resolve()
        })
      })

      peer.value.on('error', (err) => {
        error.value = err.message
        reject(err)
      })
    })
  }

  function setupConnection(conn, onMessage) {
    conn.on('open', () => {
      isConnected.value = true
      error.value = ''
    })

    conn.on('data', (data) => {
      if (onMessage) {
        onMessage(data)
      }
    })

    conn.on('close', () => {
      isConnected.value = false
      error.value = '对方已断开连接'
    })

    conn.on('error', (err) => {
      error.value = err.message
    })
  }

  function sendMessage(data) {
    if (connection.value && isConnected.value) {
      connection.value.send(data)
    }
  }

  function disconnect() {
    if (connection.value) {
      connection.value.close()
    }
    if (peer.value) {
      peer.value.destroy()
    }
    isConnected.value = false
    connection.value = null
    peer.value = null
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    myPeerId,
    isConnected,
    error,
    isHost,
    createRoom,
    joinRoom,
    sendMessage,
    disconnect,
  }
}
