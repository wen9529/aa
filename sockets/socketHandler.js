// sockets/socketHandler.js
const authService = require('../services/authService');
const roomService = require('../services/roomService');

function initializeSocketEvents(io) {
    roomService.initializeRoomService(io); // Pass io instance to roomService

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Client connected: ${socket.id}`);
        socket.emit('roomListUpdate', roomService.getPublicRoomList()); // Send initial room list

        // Authentication Events
        socket.on('register', async (data, callback) => {
            const result = await authService.registerUser(data.phoneNumber, data.password);
            callback(result);
        });

        socket.on('login', async (data, callback) => {
            const result = await authService.loginUser(data.phoneNumber, data.password);
            if (result.success) {
                socket.userId = result.userId;
                socket.username = result.username;
                // console.log(`[SOCKET] User ${socket.username} (ID: ${socket.userId}) authenticated on socket ${socket.id}`);
            }
            callback(result);
        });

        socket.on('reauthenticate', async (storedUserId, callback) => {
            const userData = authService.findUserById(storedUserId);
            if (userData) {
                socket.userId = userData.userId;
                socket.username = userData.username;
                console.log(`[SOCKET] User ${socket.username} reauthenticated on socket ${socket.id}`);

                const previousRoom = roomService.findRoomByUserId(socket.userId);
                if (previousRoom) {
                    console.log(`[REAUTH] User ${socket.username} was in room ${previousRoom.roomId}. Attempting reconnect.`);
                    const reconnectResult = roomService.handleUserReconnected(socket, previousRoom.roomId);
                    callback({
                        success: true,
                        message: reconnectResult.message || '重新认证成功。',
                        userId: userData.userId,
                        username: userData.username,
                        roomState: reconnectResult.success ? reconnectResult.roomState : null
                    });
                } else {
                    callback({ success: true, message: '重新认证成功。', userId: userData.userId, username: userData.username, roomState: null });
                }
            } else {
                callback({ success: false, message: '无效的用户凭证。' });
            }
        });

        // Room Events
        socket.on('createRoom', (data, callback) => {
            if (!socket.userId) return callback({ success: false, message: '请先登录。' });
            const result = roomService.createRoom(socket.userId, socket.username, data.roomName /*, data.password */);
            if (result.success) {
                // Automatically join the creator to the room
                const joinResult = roomService.joinRoom(socket, result.roomId);
                callback(joinResult); // This will include roomState
            } else {
                callback(result);
            }
        });

        socket.on('joinRoom', (data, callback) => {
            if (!socket.userId) return callback({ success: false, message: '请先登录。' });
            const result = roomService.joinRoom(socket, data.roomId /*, data.password */);
            callback(result);
        });

        socket.on('listRooms', (callback) => {
            if (typeof callback === 'function') {
                callback(roomService.getPublicRoomList());
            }
        });

        socket.on('playerReady', (isReady, callback) => {
            if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。' });
            const result = roomService.setPlayerReady(socket, isReady);
            callback(result);
        });

        socket.on('leaveRoom', (callback) => {
            if (!socket.userId) return callback ? callback({ success: false, message: '未登录。'}) : null;
            const result = roomService.leaveRoom(socket);
            if (callback) callback(result);
        });

        // Game Play Events
        socket.on('playCard', (cards, callback) => {
            if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
            const result = roomService.handlePlayCard(socket, cards);
            callback(result);
        });

        socket.on('passTurn', (callback) => {
            if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
            const result = roomService.handlePassTurn(socket);
            callback(result);
        });

        socket.on('requestHint', (currentHintIndex, callback) => {
            if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
            const result = roomService.handleRequestHint(socket, currentHintIndex);
            callback(result);
        });

         socket.on('requestGameState', (callback) => {
             if (!socket.userId || !socket.roomId) return callback ? callback(null) : null;
             if (callback) callback(roomService.getRoomStateForPlayer(socket.roomId, socket.userId));
         });


        socket.on('disconnect', (reason) => {
            console.log(`[SOCKET] Client disconnected: ${socket.id}. Reason: ${reason}`);
            roomService.handleDisconnect(socket);
        });
    });
}

module.exports = {
    initializeSocketEvents
};
