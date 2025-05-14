// public/js/socketClient.js
let socket;
let handlers = {}; // To store handlers passed from client.js

export function init(eventHandlers) {
    handlers = eventHandlers; // Store the handlers
    socket = io({
        reconnectionAttempts: 5,
        reconnectionDelay: 3000
    });

    socket.on('connect', () => {
        console.log('[SOCKET_CLIENT] Connected.');
        if (handlers.onConnect) handlers.onConnect();
    });
    socket.on('disconnect', (reason) => {
        console.log('[SOCKET_CLIENT] Disconnected:', reason);
        if (handlers.onDisconnect) handlers.onDisconnect(reason);
    });
    socket.on('connect_error', (err) => {
        console.error('[SOCKET_CLIENT] Connect Error:', err);
        if (handlers.onConnectError) handlers.onConnectError(err);
    });

    // General game events
    socket.on('roomListUpdate', (rooms) => { if (handlers.onRoomListUpdate) handlers.onRoomListUpdate(rooms); });
    socket.on('playerJoined', (data) => { if (handlers.onPlayerJoined) handlers.onPlayerJoined(data); });
    socket.on('playerLeft', (data) => { if (handlers.onPlayerLeft) handlers.onPlayerLeft(data); });
    socket.on('playerReconnected', (data) => { if (handlers.onPlayerReconnected) handlers.onPlayerReconnected(data); });
    socket.on('playerReadyUpdate', (data) => { if (handlers.onPlayerReadyUpdate) handlers.onPlayerReadyUpdate(data); });
    socket.on('gameStarted', (state) => { if (handlers.onGameStarted) handlers.onGameStarted(state); });
    socket.on('gameStateUpdate', (state) => { if (handlers.onGameStateUpdate) handlers.onGameStateUpdate(state); });
    socket.on('gameOver', (results) => { if (handlers.onGameOver) handlers.onGameOver(results); });
    socket.on('gameStartFailed', (data) => { if (handlers.onGameStartFailed) handlers.onGameStartFailed(data);});
    socket.on('allPlayersResetReady', () => {if (handlers.onAllPlayersResetReady) handlers.onAllPlayersResetReady();});
    socket.on('invalidPlay', (data) => {if (handlers.onInvalidPlay) handlers.onInvalidPlay(data);});
}

export function disconnectAndReconnect() {
    if (socket) {
        socket.disconnect();
        setTimeout(() => socket.connect(), 100); // Give a moment before reconnecting
    }
}

// --- Emit functions ---
export function emitRegister(data, cb) { if (socket) socket.emit('register', data, cb); }
export function emitLogin(data, cb) { if (socket) socket.emit('login', data, cb); }
export function emitReauthenticate(userId, cb) { if (socket) socket.emit('reauthenticate', userId, cb); }
export function emitListRooms() { if (socket) socket.emit('listRooms', (rooms) => { if (handlers.onRoomListUpdate) handlers.onRoomListUpdate(rooms); }); }
export function emitCreateRoom(data, cb) { if (socket) socket.emit('createRoom', data, cb); }
export function emitJoinRoom(data, cb) { if (socket) socket.emit('joinRoom', data, cb); }
export function emitLeaveRoom(cb) { if (socket) socket.emit('leaveRoom', cb); }
export function emitPlayerReady(isReady, cb) { if (socket) socket.emit('playerReady', isReady, cb); }
export function emitPlayCard(cards, cb) { if (socket) socket.emit('playCard', cards, cb); }
export function emitPassTurn(cb) { if (socket) socket.emit('passTurn', cb); }
export function emitRequestHint(index, cb) { if (socket) socket.emit('requestHint', index, cb); }
export function emitRequestGameState(cb) { if (socket) socket.emit('requestGameState', cb); }
