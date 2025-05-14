// public/client.js
import * as UI from './js/ui.js'; // Assuming ui.js exists and exports functions
import * as SocketClient from './js/socketClient.js'; // Assuming socketClient.js exists

// --- State Variables (Client-side representation) ---
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null; // Holds the game state received from server
let selectedCards = [];
let currentHint = null;
let currentHintCycleIndex = 0;
let isPlayerReady = false; // Local ready state

// --- DOM Element References (Cached after DOMContentLoaded) ---
// Login/Register View
let regPhoneInput, regPasswordInput, registerButton;
let loginPhoneInput, loginPasswordInput, loginButton;
let authMessage;
// Lobby View
let lobbyUsernameEl, logoutButton, createRoomNameInput, createRoomButton, roomListEl, lobbyMessage;
// Room View
let roomViewNameEl, roomViewIdEl, leaveRoomButton, readyButton;
let myHandEl, centerPileAreaEl, lastHandTypeDisplayEl;
let playSelectedCardsButtonEl, passTurnButtonEl, hintButtonEl, sortHandButtonEl;
let gameStatusDisplayEl;
let playerAreaElements = {}; // { 0: el, 1: el, ... }
// Game Over Overlay
let gameOverOverlayEl, gameOverTitleEl, gameOverReasonEl, gameOverScoresEl, backToLobbyButtonEl;


function cacheDOMElements() {
    // Login/Register
    regPhoneInput = document.getElementById('regPhone');
    regPasswordInput = document.getElementById('regPassword');
    registerButton = document.getElementById('registerButton');
    loginPhoneInput = document.getElementById('loginPhone');
    loginPasswordInput = document.getElementById('loginPassword');
    loginButton = document.getElementById('loginButton');
    authMessage = document.getElementById('authMessage');
    // Lobby
    lobbyUsernameEl = document.getElementById('lobbyUsername');
    logoutButton = document.getElementById('logoutButton');
    createRoomNameInput = document.getElementById('createRoomName');
    createRoomButton = document.getElementById('createRoomButton');
    roomListEl = document.getElementById('roomList');
    lobbyMessage = document.getElementById('lobbyMessage');
    // Room
    roomViewNameEl = document.getElementById('roomViewName');
    roomViewIdEl = document.getElementById('roomViewId');
    leaveRoomButton = document.getElementById('leaveRoomButton');
    readyButton = document.getElementById('readyButton');
    myHandEl = document.getElementById('myHand');
    centerPileAreaEl = document.getElementById('centerPileArea');
    lastHandTypeDisplayEl = document.getElementById('lastHandTypeDisplay');
    playSelectedCardsButtonEl = document.getElementById('playSelectedCardsButton');
    passTurnButtonEl = document.getElementById('passTurnButton');
    hintButtonEl = document.getElementById('hintButton');
    sortHandButtonEl = document.getElementById('sortHandButton');
    gameStatusDisplayEl = document.getElementById('gameStatusDisplay');
    playerAreaElements = {
        0: document.getElementById('playerAreaBottom'),
        1: document.getElementById('playerAreaLeft'),
        2: document.getElementById('playerAreaTop'),
        3: document.getElementById('playerAreaRight')
    };
    // Game Over
    gameOverOverlayEl = document.getElementById('gameOverOverlay');
    gameOverTitleEl = document.getElementById('gameOverTitle');
    gameOverReasonEl = document.getElementById('gameOverReason');
    gameOverScoresEl = document.getElementById('gameOverScores');
    backToLobbyButtonEl = document.getElementById('backToLobbyButton');
}

// --- Event Handlers for UI Actions ---
function handleRegister() {
    const phone = regPhoneInput.value.trim();
    const password = regPasswordInput.value;
    SocketClient.emitRegister({ phoneNumber: phone, password }, (response) => {
        UI.displayAuthMessage(response.message, !response.success);
        if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; }
    });
}

function handleLogin() {
    const phone = loginPhoneInput.value.trim();
    const password = loginPasswordInput.value;
    SocketClient.emitLogin({ phoneNumber: phone, password }, (response) => {
        UI.displayAuthMessage(response.message, !response.success);
        if (response.success) {
            myUserId = response.userId;
            myUsername = response.username;
            try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); } catch(e) {console.warn("localStorage failed", e);}
            UI.updateLobbyUsername(myUsername);
            UI.showView('lobbyView');
            SocketClient.emitListRooms(); // Request room list on login
        }
    });
}

function handleLogout() {
    // Clear local storage, reset state variables
    try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch(e) {}
    myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null;
    SocketClient.disconnectAndReconnect(); // Disconnect and reconnect for a fresh session
    UI.showView('loginRegisterView');
}

function handleCreateRoom() {
    const roomName = createRoomNameInput.value.trim();
    if (!roomName) { UI.displayLobbyMessage('请输入房间名称。', true); return; }
    SocketClient.emitCreateRoom({ roomName }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId; // Server now joins us, roomState in response
            currentGameState = response.roomState;
            isPlayerReady = false; // Reset ready state for new room
            UI.showView('roomView');
            UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint); // Initial render
        } else {
            UI.displayLobbyMessage(response.message, true);
        }
    });
}

function handleJoinRoom(roomId) {
    SocketClient.emitJoinRoom({ roomId }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            currentGameState = response.roomState;
            isPlayerReady = currentGameState.players.find(p=>p.userId === myUserId)?.isReady || false;
            UI.showView('roomView');
            UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
        } else {
            UI.displayLobbyMessage(response.message, true);
        }
    });
}

function handleLeaveRoom() {
    if (currentRoomId) {
        SocketClient.emitLeaveRoom(() => {
            // Callback from server after leave is processed (or client assumes success)
            currentRoomId = null; currentGameState = null; isPlayerReady = false;
            UI.showView('lobbyView');
            SocketClient.emitListRooms();
        });
    } else {
         UI.showView('lobbyView'); // Should not happen if button is hidden
    }
}

function handleReadyClick() {
    isPlayerReady = !isPlayerReady;
    SocketClient.emitPlayerReady(isPlayerReady, (response) => {
        if (!response.success) {
            isPlayerReady = !isPlayerReady; // Revert on failure
            UI.displayGameStatus(response.message, true);
        }
        // UI will be updated by 'playerReadyUpdate' or 'gameStateUpdate'
    });
}

function handlePlayCards() {
    if (selectedCards.length === 0) { UI.displayGameStatus('请选择要出的牌。', true); return; }
    SocketClient.emitPlayCard(selectedCards, (response) => {
        if (response.success) {
            selectedCards = []; // Clear selection, UI will update on gameStateUpdate
            // Hint might become invalid
            currentHint = null;
            currentHintCycleIndex = 0;
        } else {
            UI.displayGameStatus(response.message, true);
        }
    });
}
function handlePassTurn() { SocketClient.emitPassTurn((response) => { if (!response.success) UI.displayGameStatus(response.message, true); }); }
function handleHint() {
    SocketClient.emitRequestHint(currentHintCycleIndex, (response) => {
        if (response.success && response.hint) {
            currentHint = response.hint;
            currentHintCycleIndex = response.nextHintIndex;
            UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint); // Re-render to show hint
        } else {
            currentHint = null; // No hint or no more hints
            currentHintCycleIndex = 0;
            UI.displayGameStatus(response.message || "没有可出的牌。", true);
            UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint); // Re-render to clear old hint
        }
    });
}
function handleSortHand() { /* Implement client-side sort and re-render of #myHand if needed */ }


// --- Client State Update and Rendering based on Server Events ---
function onRoomListUpdate(rooms) {
    if (UI.getCurrentView() === 'lobbyView') {
        UI.renderRoomList(rooms, handleJoinRoom);
    }
}

function onPlayerJoined(playerData) {
    if (currentGameState && UI.getCurrentView() === 'roomView') {
        const existing = currentGameState.players.find(p => p.userId === playerData.userId);
        if (existing) Object.assign(existing, playerData); else currentGameState.players.push(playerData);
        currentGameState.players.sort((a,b) => a.slot - b.slot);
        UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
        UI.displayGameStatus(`${playerData.username} 加入了房间。`, false, true);
    }
}
function onPlayerLeft({ userId, username }) {
    if (currentGameState && UI.getCurrentView() === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) player.connected = false; // Mark as disconnected
        UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
        UI.displayGameStatus(`${username} 离开了房间。`, true);
    }
}
function onPlayerReconnected(playerData) {
     if (currentGameState && UI.getCurrentView() === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === playerData.userId);
        if (player) Object.assign(player, playerData, {connected: true});
        else currentGameState.players.push({...playerData, connected: true});
        currentGameState.players.sort((a,b)=>a.slot-b.slot);
        UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
        UI.displayGameStatus(`${playerData.username} 重新连接。`, false, true);
    }
}


function onPlayerReadyUpdate({ userId, isReady }) {
    if (currentGameState && UI.getCurrentView() === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) player.isReady = isReady;
        if (userId === myUserId) isPlayerReady = isReady;
        UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
    }
}

function onGameStarted(initialGameState) {
    console.log('[CLIENT] Game Started:', initialGameState);
    currentGameState = initialGameState;
    currentRoomId = initialGameState.roomId; // Ensure currentRoomId is set
    selectedCards = [];
    currentHint = null;
    currentHintCycleIndex = 0;
    isPlayerReady = false; // Game started, ready state is no longer relevant for self in same way
    if (UI.getCurrentView() !== 'roomView') UI.showView('roomView'); // Ensure in room view
    UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
    UI.displayGameStatus('游戏开始！', false, true);
}

function onGameStateUpdate(newState) {
    console.log('[CLIENT] GameState Update:', newState);
    if (UI.getCurrentView() !== 'roomView' || !currentGameState || currentRoomId !== newState.roomId) {
        console.warn("gameStateUpdate ignored, not in correct state/view.");
        return;
    }
    const myOldHand = currentGameState.players.find(p=>p.userId === myUserId)?.hand;

    currentGameState = newState; // newState is the authority

    // Restore my hand if server didn't send it (common for updates not caused by my play)
    const myNewPlayerState = currentGameState.players.find(p => p.userId === myUserId);
    if (myNewPlayerState && myNewPlayerState.hand === undefined && myOldHand && newState.lastPlayerWhoPlayedId !== myUserId) {
        if (!myNewPlayerState.finished) myNewPlayerState.hand = myOldHand;
    }

    // If my turn ended, clear my selections
    if (previousGameState && previousGameState.currentPlayerId === myUserId && currentGameState.currentPlayerId !== myUserId) {
        selectedCards = [];
        currentHint = null;
        currentHintCycleIndex = 0;
    }
    UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
    previousGameState = JSON.parse(JSON.stringify(currentGameState)); // Store for next comparison
}

function onGameOver(results) {
    console.log('[CLIENT] Game Over:', results);
    if (currentGameState) currentGameState.status = 'finished'; // Update local status
    UI.showGameOver(results, handleReturnToLobby);
}

function onGameStartFailed({ message }) { UI.displayGameStatus(`游戏开始失败: ${message}`, true); }
function onAllPlayersResetReady() { if (currentGameState) { currentGameState.players.forEach(p => p.isReady = false); isPlayerReady = false; UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint); UI.displayGameStatus('请重新准备。', true);}}
function onInvalidPlay({ message }) { UI.displayGameStatus(`操作无效: ${message}`, true); UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint); }


// --- Client Initialization ---
function initClientSession() {
    let storedUserId = null;
    try { storedUserId = localStorage.getItem('kkUserId'); } catch (e) { console.warn('localStorage access error', e); }

    if (storedUserId) {
        UI.showView('loadingView');
        UI.displayLoadingMessage("正在重新连接...");
        SocketClient.emitReauthenticate(storedUserId, (response) => {
            if (response.success) {
                myUserId = response.userId;
                myUsername = response.username;
                UI.updateLobbyUsername(myUsername);
                if (response.roomState) {
                    currentRoomId = response.roomState.roomId;
                    currentGameState = response.roomState;
                    isPlayerReady = currentGameState.players.find(p=>p.userId === myUserId)?.isReady || false;
                    UI.showView('roomView');
                    UI.renderRoom(currentGameState, myUserId, selectedCards, currentHint);
                    if (currentGameState.status === 'finished') {
                        UI.showGameOver(currentGameState.gameResult || currentGameState, handleReturnToLobby);
                    }
                } else {
                    UI.showView('lobbyView');
                    SocketClient.emitListRooms();
                }
            } else {
                UI.displayAuthMessage(response.message || "重新认证失败。", true);
                UI.showView('loginRegisterView');
            }
        });
    } else {
        UI.showView('loginRegisterView');
    }
}

function setupEventListeners() {
    // Auth
    if (registerButton) registerButton.addEventListener('click', handleRegister);
    if (loginButton) loginButton.addEventListener('click', handleLogin);
    // Lobby
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);
    // Room & Game
    if (leaveRoomButton) leaveRoomButton.addEventListener('click', handleLeaveRoom);
    if (readyButton) readyButton.addEventListener('click', handleReadyClick);
    if (playSelectedCardsButtonEl) playSelectedCardsButtonEl.addEventListener('click', handlePlayCards);
    if (passTurnButtonEl) passTurnButtonEl.addEventListener('click', handlePassTurn);
    if (hintButtonEl) hintButtonEl.addEventListener('click', handleHint);
    if (sortHandButtonEl) sortHandButtonEl.addEventListener('click', handleSortHand); // Define handleSortHand if needed
    // Game Over
    if (backToLobbyButtonEl) backToLobbyButtonEl.addEventListener('click', handleReturnToLobby);

    // Global card selection delegate for #myHand (if cards are dynamically added)
    if (myHandEl) {
        myHandEl.addEventListener('click', (event) => {
            const cardElement = event.target.closest('.card:not(.disabled)');
            if (!cardElement || !currentGameState || currentGameState.currentPlayerId !== myUserId) return;
            const rank = cardElement.dataset.rank;
            const suit = cardElement.dataset.suit;
            if (rank && suit) {
                const cardData = { rank, suit };
                const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
                if (index > -1) {
                    selectedCards.splice(index, 1);
                    cardElement.classList.remove('selected');
                } else {
                    selectedCards.push(cardData);
                    cardElement.classList.add('selected');
                }
                UI.updatePlayButtonState(selectedCards.length > 0);
            }
        });
    }
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    cacheDOMElements(); // Cache DOM elements once
    setupEventListeners();

    // Initialize Socket.IO client connection and event listeners
    SocketClient.init({
        onConnect: initClientSession, // Attempt to re-authenticate or show login on connect
        onDisconnect: (reason) => { UI.showView('loadingView'); UI.displayLoadingMessage(`已断开: ${reason}. 尝试重连...`); },
        onConnectError: (err) => { UI.showView('loadingView'); UI.displayLoadingMessage(`连接错误: ${err.message}`, true);},
        onRoomListUpdate,
        onPlayerJoined,
        onPlayerLeft,
        onPlayerReconnected,
        onPlayerReadyUpdate,
        onGameStarted,
        onGameStateUpdate,
        onGameOver,
        onGameStartFailed,
        onAllPlayersResetReady,
        onInvalidPlay,
    });

    UI.showView('loadingView'); // Initial view
    console.log('Client setup complete.');
});
