// services/roomService.js
const { generateRoomId } = require('../utils/helpers');
const { Game } = require('../game'); // Assuming game.js exports Game class

let activeRooms = {}; // { roomId: { roomId, roomName, ..., game: GameInstance, players: [{userId, username, socketId, isReady, slot, connected}] } }
let ioInstance; // Will be set by socketHandler

function initializeRoomService(io) {
    ioInstance = io;
}

function getPublicRoomList() {
    return Object.values(activeRooms).map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        playerCount: room.players.filter(p => p.connected).length,
        maxPlayers: room.maxPlayers || 4, // Assuming Game class has maxPlayers or default
        status: room.game ? (room.game.gameStarted ? 'playing' : 'waiting') : 'waiting',
        // hasPassword: !!room.password, // Add password logic if needed
    }));
}

function broadcastRoomList() {
    if (ioInstance) {
        ioInstance.emit('roomListUpdate', getPublicRoomList());
    }
}

function createRoom(creatorId, creatorUsername, roomName /*, password */) {
    if (!roomName || roomName.trim().length === 0) {
        return { success: false, message: '需要有效的房间名称。' };
    }
    let newRoomId = generateRoomId();
    while(activeRooms[newRoomId]) { newRoomId = generateRoomId(); } // Ensure unique

    const game = new Game(newRoomId, 4); // Create a new Game instance

    const room = {
        roomId: newRoomId,
        roomName: roomName.trim(),
        creatorId,
        players: [], // { userId, username, socketId, isReady, slot, connected }
        game: game,
        maxPlayers: 4, // Or from game.maxPlayers
        // password: password || null,
    };
    activeRooms[newRoomId] = room;
    console.log(`[ROOM] Room created: "${room.roomName}" (${room.roomId}) by ${creatorUsername}`);
    broadcastRoomList();
    return { success: true, roomId: room.roomId };
}

function addPlayerToSocketRoom(socket, roomId) {
    socket.join(roomId);
    socket.roomId = roomId; // Store roomId on socket for easy access
}

// Helper to get sanitized room state for a specific player
function getRoomStateForPlayer(roomId, requestingUserId) {
    const room = activeRooms[roomId];
    if (!room) return null;

    // Use game.getStateForPlayer if it provides all necessary player info (hand, handCount, role etc.)
    const gameState = room.game.getStateForPlayer(requestingUserId);

    return {
        roomId: room.roomId,
        roomName: room.roomName,
        status: room.game.gameStarted ? (room.game.gameFinished ? 'finished' : 'playing') : 'waiting',
        players: room.players.map(p => {
            const gamePlayer = gameState.players.find(gp => gp.id === p.userId);
            return {
                userId: p.userId,
                username: p.username,
                slot: p.slot,
                isReady: p.isReady,
                connected: p.connected,
                // Merge game-specific player data from gameState
                ...(gamePlayer && {
                    score: gamePlayer.score,
                    role: gamePlayer.role,
                    finished: gamePlayer.finished,
                    handCount: gamePlayer.handCount,
                    hand: gamePlayer.hand, // This will be undefined for others
                    isCurrentPlayer: gameState.currentPlayerId === p.userId
                })
            };
        }),
        centerPile: gameState.centerPile,
        lastHandInfo: gameState.lastHandInfo,
        currentPlayerId: gameState.currentPlayerId,
        isFirstTurn: gameState.isFirstTurn,
        gameMode: gameState.gameMode,
        myUserId: requestingUserId // So client knows who it is
    };
}


function joinRoom(socket, roomId /*, password */) {
    const room = activeRooms[roomId];
    if (!room) return { success: false, message: '房间不存在。' };
    if (room.players.length >= room.maxPlayers) return { success: false, message: '房间已满。' };
    // if (room.password && room.password !== password) return { success: false, message: '房间密码错误。' };

    const existingPlayer = room.players.find(p => p.userId === socket.userId);
    if (existingPlayer) { // Player is already in the room (e.g. rejoining)
        existingPlayer.connected = true;
        existingPlayer.socketId = socket.id;
        if (room.game) room.game.markPlayerConnected(socket.userId, true);
        addPlayerToSocketRoom(socket, roomId);
        console.log(`[ROOM] Player ${socket.username} re-joined room ${room.roomName}`);
        ioInstance.to(roomId).emit('playerReconnected', { userId: socket.userId, username: socket.username, slot: existingPlayer.slot, isReady: existingPlayer.isReady });
        broadcastRoomList();
        return { success: true, roomState: getRoomStateForPlayer(roomId, socket.userId) };
    }

    // Find an available slot
    const usedSlots = room.players.map(p => p.slot);
    let assignedSlot = -1;
    for (let i = 0; i < room.maxPlayers; i++) {
        if (!usedSlots.includes(i)) {
            assignedSlot = i;
            break;
        }
    }
    if (assignedSlot === -1) return { success: false, message: '无法找到可用位置。' };

    const newPlayer = {
        userId: socket.userId,
        username: socket.username,
        socketId: socket.id,
        isReady: false,
        slot: assignedSlot,
        connected: true
    };
    room.players.push(newPlayer);
    room.players.sort((a, b) => a.slot - b.slot); // Keep sorted by slot
    room.game.addPlayer(newPlayer.userId, newPlayer.username, newPlayer.slot);

    addPlayerToSocketRoom(socket, roomId);
    console.log(`[ROOM] Player ${socket.username} joined room ${room.roomName} in slot ${assignedSlot}`);

    // Notify others in the room
    socket.to(roomId).emit('playerJoined', { userId: newPlayer.userId, username: newPlayer.username, slot: newPlayer.slot, isReady: newPlayer.isReady, connected: newPlayer.connected });
    broadcastRoomList();
    return { success: true, roomState: getRoomStateForPlayer(roomId, socket.userId) };
}

function setPlayerReady(socket, isReady) {
    const room = activeRooms[socket.roomId];
    if (!room || !socket.userId) return { success: false, message: '无效操作。' };
    if (room.game.gameStarted) return { success: false, message: '游戏已开始。' };

    const player = room.players.find(p => p.userId === socket.userId);
    if (!player) return { success: false, message: '玩家不在房间内。' };

    player.isReady = !!isReady;
    console.log(`[ROOM] Player ${player.username} in room ${socket.roomId} ready status: ${player.isReady}`);
    ioInstance.to(socket.roomId).emit('playerReadyUpdate', { userId: player.userId, isReady: player.isReady });

    // Check if all players are ready to start the game
    const connectedPlayers = room.players.filter(p => p.connected);
    if (connectedPlayers.length === room.maxPlayers && connectedPlayers.every(p => p.isReady)) {
        startGameInRoom(socket.roomId);
    }
    return { success: true };
}

function startGameInRoom(roomId) {
    const room = activeRooms[roomId];
    if (!room || room.game.gameStarted) return;

    console.log(`[GAME] Attempting to start game in room ${roomId}`);
    const playerStartInfo = room.players.filter(p => p.connected).map(p => ({
        id: p.userId,
        name: p.username,
        slot: p.slot
    }));

    // Ensure exactly maxPlayers are provided to game.startGame
    if (playerStartInfo.length !== room.maxPlayers) {
        console.error(`[GAME] Cannot start game in room ${roomId}. Incorrect player count: ${playerStartInfo.length}/${room.maxPlayers}`);
        ioInstance.to(roomId).emit('gameStartFailed', { message: `需要 ${room.maxPlayers} 位连接的玩家才能开始游戏。` });
        return;
    }


    const startGameResult = room.game.startGame(playerStartInfo);
    if (startGameResult.success) {
        console.log(`[GAME] Game started in room ${roomId}`);
        // Send personalized game state to each player
        room.players.forEach(p => {
            if (p.connected && p.socketId) {
                const playerSocket = ioInstance.sockets.sockets.get(p.socketId);
                if (playerSocket) {
                    playerSocket.emit('gameStarted', getRoomStateForPlayer(roomId, p.userId));
                }
            }
        });
        broadcastRoomList(); // Update status in room list
    } else {
        console.error(`[GAME] Failed to start game in room ${roomId}: ${startGameResult.message}`);
        ioInstance.to(roomId).emit('gameStartFailed', { message: startGameResult.message });
        // Optionally reset ready status for all players
        room.players.forEach(p => p.isReady = false);
        ioInstance.to(roomId).emit('allPlayersResetReady');
    }
}

function handlePlayCard(socket, cards) {
    const room = activeRooms[socket.roomId];
    if (!room || !room.game || !room.game.gameStarted || room.game.gameFinished) {
        return { success: false, message: '不在游戏中或游戏未开始/已结束。' };
    }
    const playResult = room.game.playCard(socket.userId, cards);
    if (playResult.success) {
        ioInstance.to(socket.roomId).emit('gameStateUpdate', getRoomStateForPlayer(socket.roomId, null)); // Broadcast to all
        if (playResult.gameOver) {
            ioInstance.to(socket.roomId).emit('gameOver', playResult.scoreResult);
            broadcastRoomList();
        }
    }
    return playResult;
}

function handlePassTurn(socket) {
    const room = activeRooms[socket.roomId];
     if (!room || !room.game || !room.game.gameStarted || room.game.gameFinished) {
        return { success: false, message: '不在游戏中或游戏未开始/已结束。' };
    }
    const passResult = room.game.handlePass(socket.userId);
    if (passResult.success) {
        ioInstance.to(socket.roomId).emit('gameStateUpdate', getRoomStateForPlayer(socket.roomId, null));
    }
    return passResult;
}

function handleRequestHint(socket, currentHintIndex) {
    const room = activeRooms[socket.roomId];
    if (!room || !room.game || !room.game.gameStarted || room.game.gameFinished) {
        return { success: false, message: '不在游戏中或游戏未开始/已结束。' };
    }
    return room.game.findHint(socket.userId, currentHintIndex);
}


function leaveRoom(socket) {
    const roomId = socket.roomId;
    if (!roomId || !activeRooms[roomId]) {
        console.log(`[ROOM] Player ${socket.username} tried to leave non-existent room ${roomId}`);
        delete socket.roomId;
        return { success: true, message: "你已不在任何房间中。" };
    }

    const room = activeRooms[roomId];
    const playerIndex = room.players.findIndex(p => p.userId === socket.userId);

    if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        console.log(`[ROOM] Player ${player.username} leaving room ${roomId}`);
        room.players.splice(playerIndex, 1);
        socket.leave(roomId);
        ioInstance.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username });

        if (room.game && room.game.gameStarted && !room.game.gameFinished) {
            room.game.removePlayer(player.userId); // Mark as disconnected in game
            // Check if game should end due to player leaving
            const activeGamePlayers = room.game.players.filter(p => p.connected && !p.finished).length;
            if (activeGamePlayers < 2) { // Or your game's minimum player rule
                console.log(`[GAME] Game in room ${roomId} ending due to player leaving.`);
                const scoreResult = room.game.endGame('有玩家离开，游戏结束');
                ioInstance.to(roomId).emit('gameOver', scoreResult || { reason: '有玩家离开，游戏结束。' });
            } else {
                 if (room.game.currentPlayerId === player.userId) { // If leaving player was current
                    room.game.nextTurn(true); // Force next turn
                }
                ioInstance.to(roomId).emit('gameStateUpdate', getRoomStateForPlayer(roomId, null));
            }
        }
    }
    delete socket.roomId;

    if (room.players.length === 0) {
        console.log(`[ROOM] Room ${roomId} is empty, deleting.`);
        delete activeRooms[roomId];
    }
    broadcastRoomList();
    return { success: true };
}

function handleDisconnect(socket) {
    const roomId = socket.roomId; // roomId should be on socket if they were in a room
    if (!roomId || !activeRooms[roomId]) {
        // console.log(`[DISCO] Socket ${socket.id} disconnected, was not in an active room.`);
        return;
    }
    const room = activeRooms[roomId];
    const player = room.players.find(p => p.socketId === socket.id); // Find by socket.id

    if (player) {
        console.log(`[DISCO] Player ${player.username} (ID: ${player.userId}) disconnected from room ${roomId}`);
        player.connected = false;
        ioInstance.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username, reason: 'disconnected' }); // Notify others

        if (room.game && room.game.gameStarted && !room.game.gameFinished) {
            room.game.markPlayerConnected(player.userId, false);
            const activeGamePlayers = room.game.players.filter(p => p.connected && !p.finished).length;
            if (activeGamePlayers < 2) { // Or your game's minimum player rule
                console.log(`[GAME] Game in room ${roomId} ending due to player disconnect.`);
                const scoreResult = room.game.endGame('有玩家断线，游戏结束');
                ioInstance.to(roomId).emit('gameOver', scoreResult || { reason: '有玩家断线，游戏结束。' });
            } else {
                if (room.game.currentPlayerId === player.userId) {
                    room.game.nextTurn(true);
                }
                ioInstance.to(roomId).emit('gameStateUpdate', getRoomStateForPlayer(roomId, null));
            }
        }
        // Check if room should be deleted (e.g., all players disconnected)
        if (room.players.every(p => !p.connected)) {
            console.log(`[ROOM] All players in room ${roomId} disconnected. Deleting room.`);
            delete activeRooms[roomId];
        }
    }
    broadcastRoomList();
}

function findRoomByUserId(userId) {
    for (const roomId in activeRooms) {
        if (activeRooms[roomId].players.some(p => p.userId === userId)) {
            return activeRooms[roomId];
        }
    }
    return null;
}

function handleUserReconnected(socket, previousRoomId) {
    const room = activeRooms[previousRoomId];
    if (!room) return { success: false, message: "尝试重连的房间已不存在。" };

    const player = room.players.find(p => p.userId === socket.userId);
    if (!player) return { success: false, message: "玩家数据异常，无法重连。" };

    player.connected = true;
    player.socketId = socket.id; // Update socketId
    addPlayerToSocketRoom(socket, previousRoomId);

    if (room.game) room.game.markPlayerConnected(socket.userId, true);

    console.log(`[RECO] Player ${player.username} reconnected to room ${previousRoomId}`);
    socket.to(previousRoomId).emit('playerReconnected', { userId: player.userId, username: player.username, slot: player.slot, isReady: player.isReady });
    return { success: true, roomState: getRoomStateForPlayer(previousRoomId, socket.userId) };
}


module.exports = {
    initializeRoomService,
    getPublicRoomList,
    broadcastRoomList,
    createRoom,
    joinRoom,
    setPlayerReady,
    handlePlayCard,
    handlePassTurn,
    handleRequestHint,
    leaveRoom,
    handleDisconnect,
    findRoomByUserId,
    handleUserReconnected,
    getRoomStateForPlayer // Export for reauthentication logic
};
