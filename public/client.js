// public/client.js
// (This single file combines logic that could be in ui.js, socketClient.js for simplicity now)

const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 3000
});

// --- State Variables ---
let currentView = 'loading';
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let previousGameState = null;
let isPlayerReady = false;
let selectedCards = [];
let currentSortMode = 'rank'; // 'rank' or 'suit'
let currentHint = null;
let currentHintCycleIndex = 0;

// --- DOM Elements (Cached after DOMContentLoaded) ---
let views = {};
let regPhoneInput, regPasswordInput, registerButton;
let loginPhoneInput, loginPasswordInput, loginButton;
let authMessage;
let lobbyUsernameEl, logoutButton, createRoomNameInput, createRoomButton, roomListEl, lobbyMessage;
let roomViewNameEl, roomViewIdEl, leaveRoomButton, readyButton;
let myHandEl, centerPileAreaEl, lastHandTypeDisplayEl;
let playSelectedCardsButtonEl, passTurnButtonEl, hintButtonEl, sortHandButtonEl;
let gameStatusDisplayEl;
let playerAreaElements = {};
let gameOverOverlayEl, gameOverTitleEl, gameOverReasonEl, gameOverScoresEl, backToLobbyButtonEl;

// --- Utility Functions ---
function cacheDOMElements() {
    views = {
        loadingView: document.getElementById('loadingView'),
        loginRegisterView: document.getElementById('loginRegisterView'),
        lobbyView: document.getElementById('lobbyView'),
        roomView: document.getElementById('roomView'),
        gameOverOverlay: document.getElementById('gameOverOverlay')
    };
    regPhoneInput = document.getElementById('regPhone');
    regPasswordInput = document.getElementById('regPassword');
    registerButton = document.getElementById('registerButton');
    loginPhoneInput = document.getElementById('loginPhone');
    loginPasswordInput = document.getElementById('loginPassword');
    loginButton = document.getElementById('loginButton');
    authMessage = document.getElementById('authMessage');
    lobbyUsernameEl = document.getElementById('lobbyUsername');
    logoutButton = document.getElementById('logoutButton');
    createRoomNameInput = document.getElementById('createRoomName');
    createRoomButton = document.getElementById('createRoomButton');
    roomListEl = document.getElementById('roomList');
    lobbyMessage = document.getElementById('lobbyMessage');
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
    gameOverOverlayEl = document.getElementById('gameOverOverlay');
    gameOverTitleEl = document.getElementById('gameOverTitle');
    gameOverReasonEl = document.getElementById('gameOverReason');
    gameOverScoresEl = document.getElementById('gameOverScores');
    backToLobbyButtonEl = document.getElementById('backToLobbyButton');
}

function showView(viewName) {
    console.log(`[VIEW] Switching from ${currentView} to: ${viewName}`);
    currentView = viewName;
    for (const key in views) {
        if (views[key]) {
            views[key].classList.add('hidden-view');
            views[key].classList.remove('view-block', 'view-flex');
        }
    }
    const targetView = views[viewName];
    if (targetView) {
        targetView.classList.remove('hidden-view');
        if (viewName === 'roomView' || viewName === 'gameOverOverlay') {
            targetView.classList.add('view-flex');
        } else {
            targetView.classList.add('view-block');
        }
    } else { console.warn(`[VIEW] View element not found: ${viewName}`); }
    const allowScroll = (viewName === 'loginRegisterView' || viewName === 'lobbyView');
    document.documentElement.style.overflow = allowScroll ? '' : 'hidden';
    document.body.style.overflow = allowScroll ? '' : 'hidden';
    clearMessages();
    if (viewName !== 'roomView' && viewName !== 'gameOverOverlay') {
        selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
        if (currentView !== 'gameOverOverlay') { currentGameState = null; previousGameState = null; }
    }
}
function displayMessage(element, message, isError = false, isSuccess = false) { if (element) { element.textContent = message; element.classList.remove('error', 'success', 'message'); if (isError) element.classList.add('error'); else if (isSuccess) element.classList.add('success'); else if (element.id !== 'gameStatusDisplay') element.classList.add('message'); } }
function clearMessages() { [authMessage, lobbyMessage].forEach(el => { if (el) { el.textContent = ''; el.classList.remove('error', 'success', 'message'); } }); }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);
function compareSingleCardsClient(cardA, cardB) { const rankValueA = RANK_VALUES_CLIENT[cardA.rank]; const rankValueB = RANK_VALUES_CLIENT[cardB.rank]; if (rankValueA !== rankValueB) return rankValueA - rankValueB; return SUIT_VALUES_CLIENT[cardA.suit] - SUIT_VALUES_CLIENT[cardB.suit]; }
function compareBySuitThenRank(cardA, cardB) { const suitValueA = SUIT_VALUES_CLIENT[cardA.suit]; const suitValueB = SUIT_VALUES_CLIENT[cardB.suit]; if (suitValueA !== suitValueB) return suitValueA - suitValueB; return RANK_VALUES_CLIENT[cardA.rank] - RANK_VALUES_CLIENT[cardB.rank]; }
function getCardImageFilename(cardData) { if (!cardData || typeof cardData.rank !== 'string' || typeof cardData.suit !== 'string') { return null; } let rankStr = cardData.rank.toLowerCase(); if (rankStr === 't') rankStr = '10'; else if (rankStr === 'j') rankStr = 'jack'; else if (rankStr === 'q') rankStr = 'queen'; else if (rankStr === 'k') rankStr = 'king'; else if (rankStr === 'a') rankStr = 'ace'; let suitStr = ''; switch (cardData.suit.toUpperCase()) { case 'S': suitStr = 'spades'; break; case 'H': suitStr = 'hearts'; break; case 'D': suitStr = 'diamonds'; break; case 'C': suitStr = 'clubs'; break; default: return null; } return `${rankStr}_of_${suitStr}.png`; }

// --- Rendering Functions ---
function renderSingleCardDOM(cardData, isHidden = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden');
         // cardDiv.style.backgroundImage = "url('/images/card-back.png')"; // Assuming you have this
    } else {
        cardDiv.classList.add('visible');
        const filename = getCardImageFilename(cardData);
        if (filename) { cardDiv.style.backgroundImage = `url('/images/cards/${filename}')`; }
        else { cardDiv.textContent = `${cardData.rank}${getSuitSymbol(cardData.suit)}`; }
        cardDiv.dataset.rank = cardData.rank;
        cardDiv.dataset.suit = cardData.suit;
    }
    return cardDiv;
}

function renderPlayerHand(myHandContainer, handArray, selectedCardsArray, hintedCardsArray, isMyTurn) {
    if (!myHandContainer) { console.warn("[DEBUG] renderPlayerHand: myHandContainer is null"); return; }
    myHandContainer.innerHTML = '';

    if (!handArray || handArray.length === 0) {
        myHandContainer.innerHTML = '<span style="color:#bbb; font-style:italic;">- 无手牌 -</span>';
        return;
    }
    let sortedHand = [...handArray];
    if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
    else sortedHand.sort(compareBySuitThenRank);

    sortedHand.forEach((cardData, index) => {
        const cardElement = renderSingleCardDOM(cardData);
        cardElement.style.zIndex = index;
        if (selectedCardsArray.some(c => c.rank === cardData.rank && c.suit === cardData.suit)) cardElement.classList.add('selected');
        if (hintedCardsArray && hintedCardsArray.cards && hintedCardsArray.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit)) cardElement.classList.add('hinted');
        if (!isMyTurn) cardElement.classList.add('disabled');
        myHandContainer.appendChild(cardElement);
    });
}

function clearPlayerAreaDOM(areaContainer) {
    if (!areaContainer) { console.warn("[DEBUG] clearPlayerAreaDOM: areaContainer is null for ID (unknown)"); return; }
    // console.log(`[DEBUG] clearPlayerAreaDOM for area: ${areaContainer.id}`);
    const avatarEl = areaContainer.querySelector('.player-avatar');
    const nameEl = areaContainer.querySelector('.playerName');
    const roleEl = areaContainer.querySelector('.playerRole');
    const infoEl = areaContainer.querySelector('.playerInfo');
    const cardsEl = areaContainer.querySelector('.playerCards');
    if (avatarEl) { avatarEl.innerHTML = ''; avatarEl.style.backgroundImage = ''; }
    if (nameEl) nameEl.textContent = (areaContainer.id === 'playerAreaBottom' && myUsername) ? myUsername + ' (你)' : '空位';
    if (roleEl) roleEl.textContent = '[?]';
    if (infoEl) infoEl.innerHTML = '总分: 0';
    if (cardsEl) cardsEl.innerHTML = '<span style="color:#bbb; font-style:italic;">- 等待 -</span>';
    const handCountEl = areaContainer.querySelector('.hand-count-display');
    if (handCountEl) handCountEl.remove();

    if (areaContainer.id === 'playerAreaBottom') {
        const actionsContainers = areaContainer.querySelectorAll('.my-actions-container');
        actionsContainers.forEach(ac => ac.classList.add('hidden-view'));
        if (readyButton) readyButton.classList.add('hidden-view');
    }
}

function renderPlayerArea(areaContainer, playerData, isMe, gameState) {
    if (!playerData || !playerData.userId) { clearPlayerAreaDOM(areaContainer); return; }

    areaContainer.querySelector('.playerName').textContent = playerData.username + (isMe ? ' (你)' : '');
    areaContainer.querySelector('.playerRole').textContent = playerData.role ? `[${playerData.role}]` : '[?]';
    let infoText = `总分: ${playerData.score || 0}`;
    if (playerData.finished) infoText += ' <span class="finished-text">[已完成]</span>';
    else if (!playerData.connected && gameState.status !== 'waiting') infoText += ' <span class="disconnected-text">[断线]</span>';
    else if (gameState.status === 'waiting' && !isMe) infoText += playerData.isReady ? ' <span class="ready-text">[已准备]</span>' : ' <span class="not-ready-text">[未准备]</span>';
    areaContainer.querySelector('.playerInfo').innerHTML = infoText;

    const avatarEl = areaContainer.querySelector('.player-avatar');
    if(avatarEl) {
        avatarEl.innerHTML = ''; // Clear previous content (like alarm icon)
        avatarEl.style.backgroundImage = `url('/images/avatar-slot-${playerData.slot % 4}.png')`; // Cycle avatars
        if (gameState.status === 'playing' && playerData.userId === gameState.currentPlayerId && !playerData.finished) {
            const alarmImg = document.createElement('img');
            alarmImg.src = '/images/alarm-icon.svg'; // Make sure this path is correct
            alarmImg.alt = '出牌提示';
            alarmImg.classList.add('alarm-icon');
            avatarEl.appendChild(alarmImg);
        }
    }


    const cardsContainer = areaContainer.querySelector('.playerCards');
    if (isMe) {
        renderPlayerHand(cardsContainer, playerData.hand, selectedCards, currentHint, gameState.currentPlayerId === myUserId);
    } else {
        cardsContainer.innerHTML = '';
        if (playerData.finished) cardsContainer.innerHTML = '<span style="color:#bbb;">已出完</span>';
        else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) cardsContainer.appendChild(renderSingleCardDOM(null, true));
            // Add hand count display for opponents
            let handCountEl = areaContainer.querySelector('.hand-count-display');
            if (!handCountEl) {
                handCountEl = document.createElement('div');
                handCountEl.classList.add('hand-count-display');
                areaContainer.appendChild(handCountEl); // Append to playerArea, not cardsContainer
            }
            handCountEl.textContent = `${playerData.handCount} 张`;
        } else {
             cardsContainer.innerHTML = '<span style="color:#bbb;">-</span>';
             let handCountEl = areaContainer.querySelector('.hand-count-display');
             if (handCountEl) handCountEl.remove();
        }
    }
}

function renderRoomView(state) {
    if (!state || !myUserId) { console.error("[DEBUG] RenderRoomView PREVENTED."); return; }
    console.log(`[DEBUG] renderRoomView START for room ${state.roomId}. Status: ${state.status}`);

    if(myHandEl) myHandEl.innerHTML = ''; // Force clear myHand at the very start

    if (roomViewNameEl) roomViewNameEl.textContent = state.roomName;
    if (roomViewIdEl) roomViewIdEl.textContent = `ID: ${state.roomId}`;
    if (gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, state.status === 'waiting' ? '等待玩家准备...' : (state.currentPlayerId === myUserId ? '轮到你出牌！' : `等待 ${state.players.find(p=>p.userId === state.currentPlayerId)?.username || ''} 出牌...`));

    Object.values(playerAreaElements).forEach(clearPlayerAreaDOM);

    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("[DEBUG] My player data NOT FOUND in renderRoomView!"); return; }
    isPlayerReady = myPlayer.isReady;
    const mySlot = myPlayer.slot;

    state.players.forEach(player => {
        const relativeSlot = (player.slot - mySlot + state.players.length) % state.players.length;
        if (playerAreaElements[relativeSlot]) {
            renderPlayerArea(playerAreaElements[relativeSlot], player, player.userId === myUserId, state);
        }
    });

    if (centerPileAreaEl) {
        centerPileAreaEl.innerHTML = '';
        if (state.centerPile && state.centerPile.length > 0) {
            state.centerPile.forEach(card => centerPileAreaEl.appendChild(renderSingleCardDOM(card)));
        } else { centerPileAreaEl.innerHTML = '<span style="color:#bbb;">- 等待出牌 -</span>'; }
    }
    if (lastHandTypeDisplayEl) lastHandTypeDisplayEl.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : (state.isFirstTurn ? '请先出牌' : '新回合');

    updateRoomControls(state);
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') { clearHintsAndSelection(false); }
    console.log(`[DEBUG] renderRoomView END for room ${state.roomId}.`);
}
// --- (Event Handlers, Socket Handlers, Init functions - Copied from previous stable version with handleReturnToLobby added) ---
function handleReturnToLobby() { console.log("[ACTION] handleReturnToLobby called."); currentRoomId = null; currentGameState = null; previousGameState = null; isPlayerReady = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0; if (gameOverOverlayEl && !gameOverOverlayEl.classList.contains('hidden-view')) { gameOverOverlayEl.classList.add('hidden-view'); gameOverOverlayEl.classList.remove('view-flex'); } showView('lobbyView'); socket.emit('listRooms', (rooms) => { if(roomListEl) renderRoomList(rooms); }); }
function renderRoomList(rooms) { if (!roomListEl) return; roomListEl.innerHTML = ''; if (!rooms || rooms.length === 0) { roomListEl.innerHTML = '<p>当前没有房间。</p>'; return; } rooms.forEach(room => { const item = document.createElement('div'); item.classList.add('room-item'); item.innerHTML = `<span>${room.roomName} (${room.playerCount}/${room.maxPlayers}) Status: ${room.status} ${room.hasPassword ? '🔒' : ''}</span>`; const joinButton = document.createElement('button'); joinButton.textContent = '加入'; joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers; joinButton.onclick = () => handleJoinRoom(room.roomId, room.hasPassword); item.appendChild(joinButton); roomListEl.appendChild(item); }); }
function handleJoinRoom(roomId, needsPassword) { let passwordToTry = null; if (needsPassword) { passwordToTry = prompt(`房间 "${roomId}" 受密码保护，请输入密码:`, ''); if (passwordToTry === null) return; } socket.emit('joinRoom', { roomId, password: passwordToTry }, (response) => { if (response.success) { currentRoomId = response.roomId; currentGameState = response.roomState; isPlayerReady = currentGameState.players.find(p=>p.userId === myUserId)?.isReady || false; showView('roomView'); renderRoomView(currentGameState); } else { if(lobbyMessage) displayMessage(lobbyMessage, response.message, true); } }); }
function handleRegister() { const phone = regPhoneInput.value.trim(); const password = regPasswordInput.value; socket.emit('register', { phoneNumber: phone, password }, (response) => { displayMessage(authMessage, response.message, !response.success); if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; } }); }
function handleLogin() { const phone = loginPhoneInput.value.trim(); const password = loginPasswordInput.value; socket.emit('login', { phoneNumber: phone, password }, (response) => { displayMessage(authMessage, response.message, !response.success); if (response.success) { myUserId = response.userId; myUsername = response.username; try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); } catch(e) {console.warn("localStorage failed", e);} if(lobbyUsernameEl) lobbyUsernameEl.textContent = myUsername; showView('lobbyView'); socket.emit('listRooms'); } }); }
function handleLogout() { console.log('Logging out...'); try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) {} myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; isPlayerReady = false; socket.disconnect(); socket.connect(); showView('loginRegisterView'); }
function handleCreateRoom() { const roomName = createRoomNameInput.value.trim(); if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; } socket.emit('createRoom', { roomName }, (response) => { if (response.success) { currentRoomId = response.roomId; currentGameState = response.roomState; isPlayerReady = false; showView('roomView'); renderRoomView(currentGameState); } else { displayMessage(lobbyMessage, response.message, true); } }); }
function handleLeaveRoom() { if (currentRoomId) socket.emit('leaveRoom', () => { currentRoomId = null; currentGameState = null; isPlayerReady = false; showView('lobbyView'); socket.emit('listRooms'); }); }
function handleReadyClick() { isPlayerReady = !isPlayerReady; socket.emit('playerReady', isPlayerReady, (response) => { if (!response.success) { isPlayerReady = !isPlayerReady; if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, response.message, true); }}); }
function handlePlayCards() { if (selectedCards.length === 0) { if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, '请选择要出的牌。', true); return; } socket.emit('playCard', selectedCards, (response) => { if (response.success) { selectedCards = []; currentHint = null; currentHintCycleIndex = 0; } else { if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, response.message, true); } }); }
function handlePassTurn() { socket.emit('passTurn', (response) => { if (!response.success && gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, response.message, true); }); }
function handleHint() { socket.emit('requestHint', currentHintCycleIndex, (response) => { if (response.success && response.hint) { currentHint = response.hint; currentHintCycleIndex = response.nextHintIndex; renderRoomView(currentGameState); } else { currentHint = null; currentHintCycleIndex = 0; if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, response.message || "没有可出的牌。", true); renderRoomView(currentGameState); } }); }
function handleSortHand() { if (currentSortMode === 'rank') currentSortMode = 'suit'; else currentSortMode = 'rank'; if (currentGameState) renderRoomView(currentGameState); }
function toggleCardSelection(cardData, cardElement) { const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit); if (index > -1) { selectedCards.splice(index, 1); cardElement.classList.remove('selected'); } else { selectedCards.push(cardData); cardElement.classList.add('selected'); } if(playSelectedCardsButtonEl) playSelectedCardsButtonEl.disabled = selectedCards.length === 0; }
function clearHintsAndSelection(resetCycle = true) { if(resetCycle) { currentHint = null; currentHintCycleIndex = 0; } selectedCards = []; if (myHandEl) { Array.from(myHandEl.children).forEach(c => {c.classList.remove('selected'); c.classList.remove('hinted');}); } if(playSelectedCardsButtonEl) playSelectedCardsButtonEl.disabled = true; }
function showGameOver(results) { if (!gameOverOverlayEl) return; if (results?.finalScores) { gameOverScoresEl.innerHTML = results.finalScores.map(p => `<p>${p.name} (${p.role || '?'}) 总分: ${p.score}</p>`).join(''); } else { gameOverScoresEl.innerHTML = '<p>无法获取详细得分。</p>';} gameOverTitleEl.textContent = results?.result || "游戏结束!"; gameOverReasonEl.textContent = results?.reason || ""; showView('gameOverOverlay'); }

socket.on('connect', () => { console.log('[NET] Connected!'); initClientSession(); });
socket.on('disconnect', (reason) => { console.log('[NET] Disconnected:', reason); showView('loadingView'); if(loadingView) displayMessage(loadingView.querySelector('p'), `已断开: ${reason}. 尝试重连...`, true); });
socket.on('connect_error', (err) => { console.error('[NET] Connect Error:', err); showView('loadingView'); if(loadingView) displayMessage(loadingView.querySelector('p'), `连接错误: ${err.message}`, true); });
socket.on('roomListUpdate', (rooms) => { if (currentView === 'lobbyView' && roomListEl) renderRoomList(rooms); });
socket.on('playerJoined', (data) => { if (currentGameState && currentView === 'roomView') { const p = currentGameState.players.find(x => x.userId === data.userId); if(p) Object.assign(p,data,{connected:true}); else currentGameState.players.push({...data,connected:true}); currentGameState.players.sort((a,b)=>a.slot-b.slot); renderRoomView(currentGameState); if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, `${data.username} 加入了房间。`, false, true); }});
socket.on('playerLeft', (data) => { if (currentGameState && currentView === 'roomView') { const p = currentGameState.players.find(x => x.userId === data.userId); if(p) p.connected = false; renderRoomView(currentGameState); if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, `${data.username} 离开了。`, true); }});
socket.on('playerReconnected', (data) => { if (currentGameState && currentView === 'roomView') { const p = currentGameState.players.find(x => x.userId === data.userId); if(p) Object.assign(p,data,{connected:true}); else currentGameState.players.push({...data,connected:true}); currentGameState.players.sort((a,b)=>a.slot-b.slot); renderRoomView(currentGameState); if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, `${data.username} 重连。`, false, true); }});
socket.on('playerReadyUpdate', (data) => { if (currentGameState && currentView === 'roomView') { const p = currentGameState.players.find(x => x.userId === data.userId); if(p) p.isReady = data.isReady; if(data.userId === myUserId) isPlayerReady = data.isReady; renderRoomView(currentGameState); }});
socket.on('gameStarted', (state) => { console.log('[EVENT] gameStarted:', state); currentGameState = state; currentRoomId = state.roomId; selectedCards = []; currentHint = null; currentHintCycleIndex = 0; isPlayerReady = false; if (currentView !== 'roomView') showView('roomView'); renderRoomView(currentGameState); if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, '游戏开始！', false, true); });
socket.on('gameStateUpdate', (newState) => { if (currentView !== 'roomView' || !currentGameState || currentRoomId !== newState.roomId) return; const myOldHand = currentGameState.players.find(p=>p.userId === myUserId)?.hand; previousGameState = JSON.parse(JSON.stringify(currentGameState)); currentGameState = newState; const myNewPlayerState = currentGameState.players.find(p => p.userId === myUserId); if (myNewPlayerState && myNewPlayerState.hand === undefined && myOldHand && newState.lastPlayerWhoPlayedId !== myUserId) { if (!myNewPlayerState.finished) myNewPlayerState.hand = myOldHand; } if (previousGameState.currentPlayerId === myUserId && currentGameState.currentPlayerId !== myUserId) { selectedCards = []; clearHintsAndSelection(true); } if (!currentGameState.lastHandInfo && previousGameState.lastHandInfo && currentGameState.currentPlayerId === myUserId) { selectedCards = []; clearHintsAndSelection(true); } renderRoomView(currentGameState); });
socket.on('gameOver', (results) => { if (currentGameState) currentGameState.status = 'finished'; showGameOver(results); });
socket.on('gameStartFailed', (data) => { if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, `开始失败: ${data.message}`, true); });
socket.on('allPlayersResetReady', () => { if (currentGameState) { currentGameState.players.forEach(p => p.isReady = false); isPlayerReady = false; renderRoomView(currentGameState); if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, '请重新准备。', true); }});
socket.on('invalidPlay', (data) => { if(gameStatusDisplayEl) displayMessage(gameStatusDisplayEl, `操作无效: ${data.message}`, true); renderRoomView(currentGameState); });

function initClientSession() {
    let storedUserId = null;
    try { storedUserId = localStorage.getItem('kkUserId'); } catch (e) {}
    if (storedUserId) {
        showView('loadingView');
        if(loadingView) displayMessage(loadingView.querySelector('p'), "正在重新连接...", false);
        socket.emit('reauthenticate', storedUserId, (response) => {
            if (response.success) {
                myUserId = response.userId; myUsername = response.username;
                if(lobbyUsernameEl) lobbyUsernameEl.textContent = myUsername;
                if (response.roomState) {
                    currentRoomId = response.roomState.roomId;
                    currentGameState = response.roomState;
                    isPlayerReady = currentGameState.players.find(p=>p.userId === myUserId)?.isReady || false;
                    showView('roomView'); renderRoomView(currentGameState);
                    if (currentGameState.status === 'finished') showGameOver(currentGameState.gameResult || currentGameState);
                } else { showView('lobbyView'); socket.emit('listRooms'); }
            } else { if(authMessage) displayMessage(authMessage, response.message || "重新认证失败。", true); showView('loginRegisterView'); }
        });
    } else { showView('loginRegisterView'); }
}

function setupEventListeners() {
    console.log("[SETUP] Setting up event listeners...");
    if (registerButton) registerButton.addEventListener('click', handleRegister);
    if (loginButton) loginButton.addEventListener('click', handleLogin);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);
    if (leaveRoomButton) leaveRoomButton.addEventListener('click', handleLeaveRoom);
    if (readyButton) readyButton.addEventListener('click', handleReadyClick);
    if (playSelectedCardsButtonEl) playSelectedCardsButtonEl.addEventListener('click', handlePlayCards);
    if (passTurnButtonEl) passTurnButtonEl.addEventListener('click', handlePassTurn);
    if (hintButtonEl) hintButtonEl.addEventListener('click', handleHint);
    if (sortHandButtonEl) sortHandButtonEl.addEventListener('click', handleSortHand);
    if (backToLobbyButtonEl) backToLobbyButtonEl.addEventListener('click', handleReturnToLobby); // Correctly bound

    if (myHandEl) {
        myHandEl.addEventListener('click', (event) => {
            const cardElement = event.target.closest('.card:not(.disabled)');
            if (!cardElement || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) return;
            const rank = cardElement.dataset.rank; const suit = cardElement.dataset.suit;
            if (rank && suit) toggleCardSelection({ rank, suit }, cardElement);
        });
    }
    console.log("[SETUP] Event listeners setup complete.");
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    cacheDOMElements();
    setupEventListeners();
    if (socket.connected) { initClientSession(); }
    else { showView('loadingView'); } // initClientSession will be called on 'connect'
    console.log('Client setup complete.');
});
