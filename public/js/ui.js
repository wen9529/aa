// public/js/ui.js

// Cached DOM elements (passed from client.js or queried here if preferred)
let DOMElements = {};
let currentViewName = 'loading'; // Keep track of the current view locally in UI module

// Card rendering constants (could be moved to a shared config if also used by game logic)
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);

function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }

export function cacheElements(elements) {
    DOMElements = elements; // Store references passed from main client.js
}
export function getCurrentView() { return currentViewName; }


export function showView(viewName) {
    console.log(`[UI] Switching view to: ${viewName}`);
    currentViewName = viewName;
    for (const key in DOMElements.views) {
        if (DOMElements.views[key]) {
            DOMElements.views[key].classList.add('hidden-view');
            DOMElements.views[key].classList.remove('view-block', 'view-flex');
        }
    }
    const targetView = DOMElements.views[viewName];
    if (targetView) {
        targetView.classList.remove('hidden-view');
        if (viewName === 'roomView' || viewName === 'gameOverOverlay') {
            targetView.classList.add('view-flex');
        } else {
            targetView.classList.add('view-block');
        }
    }
}

export function displayAuthMessage(message, isError) { if (DOMElements.authMessage) displayMessage(DOMElements.authMessage, message, isError); }
export function displayLobbyMessage(message, isError) { if (DOMElements.lobbyMessage) displayMessage(DOMElements.lobbyMessage, message, isError); }
export function displayGameStatus(message, isError = false, isSuccess = false) { if (DOMElements.gameStatusDisplayEl) displayMessage(DOMElements.gameStatusDisplayEl, message, isError, isSuccess); }
export function displayLoadingMessage(message, isError = false) { if (DOMElements.views?.loadingView) displayMessage(DOMElements.views.loadingView.querySelector('p'), message, isError); }


export function updateLobbyUsername(username) { if (DOMElements.lobbyUsernameEl) DOMElements.lobbyUsernameEl.textContent = username; }

export function renderRoomList(rooms, joinRoomHandler) {
    if (!DOMElements.roomListEl) return;
    DOMElements.roomListEl.innerHTML = '';
    if (!rooms || rooms.length === 0) {
        DOMElements.roomListEl.innerHTML = '<p>当前没有房间。</p>'; return;
    }
    rooms.forEach(room => { /* ... (same as your previous renderRoomList, but use joinRoomHandler) ... */ const item = document.createElement('div'); item.classList.add('room-item'); const nameSpan = document.createElement('span'); nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`; item.appendChild(nameSpan); const statusSpan = document.createElement('span'); statusSpan.textContent = `状态: ${room.status}`; statusSpan.classList.add(`status-${room.status}`); item.appendChild(statusSpan); if (room.hasPassword) { const passwordSpan = document.createElement('span'); passwordSpan.textContent = '🔒'; item.appendChild(passwordSpan); } const joinButton = document.createElement('button'); joinButton.textContent = '加入'; joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers; joinButton.onclick = () => joinRoomHandler(room.roomId /*, room.hasPassword */); item.appendChild(joinButton); DOMElements.roomListEl.appendChild(item); });
}

function getCardImageFilename(cardData) { /* ... (same as your previous) ... */ if (!cardData || typeof cardData.rank !== 'string' || typeof cardData.suit !== 'string') { console.error("Invalid cardData for getCardImageFilename:", cardData); return null; } let rankStr = cardData.rank.toLowerCase(); if (rankStr === 't') rankStr = '10'; else if (rankStr === 'j') rankStr = 'jack'; else if (rankStr === 'q') rankStr = 'queen'; else if (rankStr === 'k') rankStr = 'king'; else if (rankStr === 'a') rankStr = 'ace'; let suitStr = ''; switch (cardData.suit.toUpperCase()) { case 'S': suitStr = 'spades'; break; case 'H': suitStr = 'hearts'; break; case 'D': suitStr = 'diamonds'; break; case 'C': suitStr = 'clubs'; break; default: console.warn("Invalid suit for card image:", cardData.suit); return null; } return `${rankStr}_of_${suitStr}.png`; }
function renderSingleCardDOM(cardData, isHidden = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden');
        // Optionally, set card back image if you have one:
        // cardDiv.style.backgroundImage = "url('/images/card-back.png')";
    } else {
        cardDiv.classList.add('visible');
        const filename = getCardImageFilename(cardData);
        if (filename) { cardDiv.style.backgroundImage = `url('/images/cards/${filename}')`; }
        else { cardDiv.textContent = `${cardData.rank}${getSuitSymbol(cardData.suit)}`; } // Fallback
        cardDiv.dataset.rank = cardData.rank;
        cardDiv.dataset.suit = cardData.suit;
    }
    return cardDiv;
}

function renderPlayerHand(myHandContainer, handArray, selectedCardsArray, hintedCardsArray, isMyTurn) {
    if (!myHandContainer) return;
    myHandContainer.innerHTML = ''; // Clear existing cards

    if (!handArray || handArray.length === 0) {
        myHandContainer.innerHTML = '<span style="color:#bbb; font-style:italic;">- 无手牌 -</span>';
        return;
    }
    // Client-side sort preference (example, could be a state variable)
    let sortedHand = [...handArray];
    // if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient); else sortedHand.sort(compareBySuitThenRank);


    sortedHand.sort((a,b) => { // Default sort by rank then suit
        const rankValueA = RANK_VALUES_CLIENT[a.rank]; const rankValueB = RANK_VALUES_CLIENT[b.rank];
        if (rankValueA !== rankValueB) return rankValueA - rankValueB;
        return SUIT_VALUES_CLIENT[a.suit] - SUIT_VALUES_CLIENT[b.suit];
    }).forEach((cardData, index) => {
        const cardElement = renderSingleCardDOM(cardData);
        cardElement.style.zIndex = index; // For CSS stacking/overlap
        if (selectedCardsArray.some(c => c.rank === cardData.rank && c.suit === cardData.suit)) {
            cardElement.classList.add('selected');
        }
        if (hintedCardsArray && hintedCardsArray.some(c => c.rank === cardData.rank && c.suit === cardData.suit)) {
            cardElement.classList.add('hinted');
        }
        if (!isMyTurn) cardElement.classList.add('disabled'); // Add click listener in main client.js
        myHandContainer.appendChild(cardElement);
    });
}

export function renderRoom(gameState, myUserId, selectedCardsArray, hintedCardsArray) {
    if (!gameState || !DOMElements.roomViewNameEl) { console.warn("RenderRoom called too early or DOM not ready"); return; }

    // Update room info
    DOMElements.roomViewNameEl.textContent = gameState.roomName;
    DOMElements.roomViewIdEl.textContent = `ID: ${gameState.roomId}`;
    displayGameStatus(gameState.status === 'waiting' ? '等待玩家准备...' : (gameState.currentPlayerId === myUserId ? '轮到你出牌！' : `等待 ${gameState.players.find(p=>p.userId === gameState.currentPlayerId)?.username || ''} 出牌...`));


    // Render player areas
    const myPlayer = gameState.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("My player data not found in gameState for renderRoom"); return; }
    const mySlot = myPlayer.slot;

    gameState.players.forEach(player => {
        const isMe = player.userId === myUserId;
        const relativeSlot = (player.slot - mySlot + gameState.players.length) % gameState.players.length;
        const areaContainer = DOMElements.playerAreaElements[relativeSlot];
        if (!areaContainer) { console.warn(`Player area for slot ${relativeSlot} not found.`); return; }

        areaContainer.querySelector('.playerName').textContent = player.username + (isMe ? ' (你)' : '');
        areaContainer.querySelector('.playerRole').textContent = player.role ? `[${player.role}]` : '[?]';
        let infoText = `总分: ${player.score || 0}`;
        if (player.finished) infoText += ' <span class="finished-text">[已完成]</span>';
        else if (!player.connected && gameState.status !== 'waiting') infoText += ' <span class="disconnected-text">[断线]</span>';
        else if (gameState.status === 'waiting' && !isMe) infoText += player.isReady ? ' <span class="ready-text">[已准备]</span>' : ' <span class="not-ready-text">[未准备]</span>';
        areaContainer.querySelector('.playerInfo').innerHTML = infoText;

        const cardsContainer = areaContainer.querySelector('.playerCards');
        cardsContainer.innerHTML = ''; // Clear previous
        if (isMe) {
            renderPlayerHand(cardsContainer, player.hand, selectedCardsArray, hintedCardsArray?.cards, gameState.currentPlayerId === myUserId);
        } else { // Opponents
            if (player.finished) cardsContainer.innerHTML = '<span style="color:#bbb;">已出完</span>';
            else if (player.handCount > 0) {
                for (let i = 0; i < player.handCount; i++) cardsContainer.appendChild(renderSingleCardDOM(null, true));
            } else cardsContainer.innerHTML = '<span style="color:#bbb;">-</span>';
        }
    });

    // Render center pile
    if (DOMElements.centerPileAreaEl) {
        DOMElements.centerPileAreaEl.innerHTML = '';
        if (gameState.centerPile && gameState.centerPile.length > 0) {
            gameState.centerPile.forEach(card => DOMElements.centerPileAreaEl.appendChild(renderSingleCardDOM(card)));
        } else {
            DOMElements.centerPileAreaEl.innerHTML = '<span style="color:#bbb;">- 等待出牌 -</span>';
        }
    }
    if (DOMElements.lastHandTypeDisplayEl) DOMElements.lastHandTypeDisplayEl.textContent = gameState.lastHandInfo ? `类型: ${gameState.lastHandInfo.type}` : (gameState.isFirstTurn ? '请先出牌' : '新回合');

    // Update controls (ready button, action buttons)
    if (DOMElements.readyButton) {
        if (gameState.status === 'waiting') {
            DOMElements.readyButton.classList.remove('hidden-view');
            DOMElements.readyButton.textContent = myPlayer.isReady ? '取消准备' : '准备';
        } else {
            DOMElements.readyButton.classList.add('hidden-view');
        }
    }
    const actionContainer = DOMElements.playerAreaElements[0]?.querySelector('.my-actions-container');
    if (actionContainer) {
        if (gameState.status === 'playing' && gameState.currentPlayerId === myUserId && !myPlayer.finished) {
            actionContainer.classList.remove('hidden-view');
            if(DOMElements.playSelectedCardsButtonEl) DOMElements.playSelectedCardsButtonEl.disabled = selectedCardsArray.length === 0;
            // Add pass button disable logic from previous updateRoomControls
        } else {
            actionContainer.classList.add('hidden-view');
        }
    }
}


export function showGameOver(results, backToLobbyHandler) {
    if (!DOMElements.gameOverOverlayEl) return;
    DOMElements.gameOverTitleEl.textContent = results?.result || "游戏结束!";
    DOMElements.gameOverReasonEl.textContent = results?.reason || "";
    DOMElements.gameOverScoresEl.innerHTML = '';
    if (results?.finalScores) {
        results.finalScores.forEach(p => {
            const scoreP = document.createElement('p');
            scoreP.textContent = `${p.name} (${p.role || '?'}) 总分: ${p.score}`;
            DOMElements.gameOverScoresEl.appendChild(scoreP);
        });
    }
    if (DOMElements.backToLobbyButtonEl) DOMElements.backToLobbyButtonEl.onclick = backToLobbyHandler;
    showView('gameOverOverlay');
}

export function updatePlayButtonState(canPlay) {
    if (DOMElements.playSelectedCardsButtonEl) DOMElements.playSelectedCardsButtonEl.disabled = !canPlay;
}

// Add other UI helper functions as needed
