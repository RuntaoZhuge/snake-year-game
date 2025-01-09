const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

const players = {};
const foods = [];
const FOOD_COUNT = 200;

// Generate initial food
function generateFood() {
    return {
        x: Math.random() * 3000 - 1500,
        y: Math.random() * 3000 - 1500,
        r: 8,
        color: `hsl(${Math.random() * 360}, 50%, 50%)`,
        value: 1
    };
}

// Initialize food
for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(generateFood());
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
        name: 'Anonymous'
    };

    socket.on('setName', (name) => {
        if (players[socket.id]) {
            players[socket.id].name = name;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
    });

    socket.on('update', (data) => {
        if (players[socket.id]) {
            players[socket.id] = {
                ...players[socket.id],
                ...data,
                score: players[socket.id].score,
                name: data.name || players[socket.id].name
            };
        }
    });

    socket.on('foodEaten', (index) => {
        if (index >= 0 && index < foods.length) {
            if (players[socket.id]) {
                players[socket.id].score += 1;
            }
            foods[index] = generateFood();
        }
    });

    socket.on('playerDied', (foodDots) => {
        // Replace random food dots with the dead snake's dots
        foodDots.forEach(dot => {
            const index = Math.floor(Math.random() * foods.length);
            foods[index] = {
                ...dot,
                value: 1
            };
        });
        
        // Reset player score instead of removing them
        if (players[socket.id]) {
            players[socket.id].score = 0;
            players[socket.id].segments = [];  // Clear segments
        }
    });
});

// Game loop
setInterval(() => {
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
}, 16);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 