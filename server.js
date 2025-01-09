const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

const players = {};
const foods = [];
const FOOD_COUNT = 200;
const COUNTDOWN_TIME = 10; // seconds to wait after start game clicked
const AUTO_READY_TIME = 30; // seconds before room master is auto-ready
let gameState = 'waiting';
let countdownTime = COUNTDOWN_TIME;
let gameStartInterval = null;
let roomMaster = null;
let autoReadyTimeout = null;

function startGameCountdown() {
    // Check if all players (including master) are ready
    const allPlayersReady = Object.values(players).every(player => player.ready);
    
    // Only room master can start the game and all players must be ready
    if (gameState === 'waiting' && roomMaster && allPlayersReady) {
        gameState = 'countdown';
        countdownTime = COUNTDOWN_TIME;
        
        if (gameStartInterval) {
            clearInterval(gameStartInterval);
        }
        
        gameStartInterval = setInterval(() => {
            countdownTime--;
            io.emit('countdown', countdownTime);
            
            if (countdownTime <= 0) {
                clearInterval(gameStartInterval);
                gameState = 'playing';
                io.emit('gameStart');
                initializeGame();
            }
        }, 1000);
    } else if (!allPlayersReady) {
        // Notify that not all players are ready
        io.emit('waitingForPlayers');
    }
}

function setNewRoomMaster() {
    const playerIds = Object.keys(players);
    if (playerIds.length > 0) {
        roomMaster = playerIds[0];
        io.emit('roomMaster', roomMaster);
        
        // Start auto-ready timer for room master
        if (autoReadyTimeout) {
            clearTimeout(autoReadyTimeout);
        }
        
        autoReadyTimeout = setTimeout(() => {
            if (players[roomMaster] && !players[roomMaster].ready) {
                players[roomMaster].ready = true;
                io.emit('playerList', Object.values(players).map(player => ({
                    ...player,
                    isRoomMaster: player.id === roomMaster
                })));
                startGameCountdown();
            }
        }, AUTO_READY_TIME * 1000);
    } else {
        roomMaster = null;
    }
}

function initializeGame() {
    // Clear existing food
    foods.length = 0;
    
    // Generate new food
    for (let i = 0; i < FOOD_COUNT; i++) {
        foods.push(generateFood());
    }
    
    // Reset all players' scores
    Object.values(players).forEach(player => {
        player.score = 0;
        player.segments = [];
    });
}

function generateFood() {
    return {
        x: Math.random() * 3000 - 1500,
        y: Math.random() * 3000 - 1500,
        r: 8,
        color: `hsl(${Math.random() * 360}, 50%, 50%)`,
        value: 1
    };
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    players[socket.id] = {
        x: 0,
        y: 0,
        segments: [],
        color: `hsl(${Math.random() * 360}, 50%, 50%)`,
        radius: 10,
        score: 0,
        name: 'Anonymous',
        ready: false
    };

    // Set room master if none exists
    if (!roomMaster) {
        setNewRoomMaster();
    }

    // Send current game state to new player
    socket.emit('gameState', {
        state: gameState,
        countdown: countdownTime,
        roomMaster: roomMaster
    });

    socket.on('setName', (name) => {
        if (players[socket.id]) {
            players[socket.id].name = name;
            io.emit('playerList', Object.values(players).map(player => ({
                ...player,
                isRoomMaster: socket.id === roomMaster
            })));
        }
    });

    socket.on('playerReady', () => {
        if (players[socket.id]) {
            // All players (including master) toggle their ready status
            players[socket.id].ready = !players[socket.id].ready;
            io.emit('playerList', Object.values(players).map(player => ({
                ...player,
                isRoomMaster: socket.id === roomMaster
            })));
            
            // Check if all players are ready
            const allPlayersReady = Object.values(players).every(player => player.ready);
            if (allPlayersReady) {
                io.to(roomMaster).emit('allPlayersReady', true);
            } else {
                io.to(roomMaster).emit('allPlayersReady', false);
            }
        }
    });

    socket.on('startGame', () => {
        if (socket.id === roomMaster) {
            startGameCountdown();
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        
        // If room master disconnected, assign new room master
        if (socket.id === roomMaster) {
            setNewRoomMaster();
        }
        
        io.emit('playerList', Object.values(players).map(player => ({
            ...player,
            isRoomMaster: socket.id === roomMaster
        })));
        
        // If not enough players, reset game state
        if (Object.keys(players).length === 0) {
            gameState = 'waiting';
            if (gameStartInterval) {
                clearInterval(gameStartInterval);
            }
            if (autoReadyTimeout) {
                clearTimeout(autoReadyTimeout);
            }
            io.emit('gameState', { 
                state: 'waiting', 
                countdown: COUNTDOWN_TIME,
                roomMaster: roomMaster
            });
        }
    });

    socket.on('update', (data) => {
        if (players[socket.id] && gameState === 'playing') {
            players[socket.id] = {
                ...players[socket.id],
                ...data,
                score: players[socket.id].score,
                name: data.name || players[socket.id].name
            };
        }
    });

    socket.on('foodEaten', (index) => {
        if (index >= 0 && index < foods.length && gameState === 'playing') {
            if (players[socket.id]) {
                players[socket.id].score += 1;
            }
            foods[index] = generateFood();
        }
    });

    socket.on('playerDied', (foodDots) => {
        if (gameState === 'playing') {
            foodDots.forEach(dot => {
                const index = Math.floor(Math.random() * foods.length);
                foods[index] = {
                    ...dot,
                    value: 1
                };
            });
            
            if (players[socket.id]) {
                players[socket.id].score = 0;
                players[socket.id].segments = [];
            }
        }
    });
});

// Game loop
setInterval(() => {
    if (gameState === 'playing') {
        // Send game state to all players
        io.emit('heartbeat', {
            players,
            foods
        });

        // Update leaderboard
        const leaderboard = Object.entries(players)
            .map(([id, player]) => ({
                id,
                name: player.name,
                score: player.score
            }))
            .sort((a, b) => b.score - a.score);

        io.emit('updateLeaderboard', leaderboard);
    }
}, 16);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 