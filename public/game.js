const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoresDiv = document.getElementById('scores');
const gameOverDiv = document.getElementById('gameOver');
const nameModal = document.getElementById('nameModal');
const playerNameInput = document.getElementById('playerName');
const enterGameButton = document.getElementById('enterGameButton');
const readyButton = document.getElementById('readyButton');
const startGameButton = document.getElementById('startGameButton');
const waitingMessage = document.getElementById('waitingMessage');

// Set canvas size
canvas.width = window.innerWidth - 50;
canvas.height = window.innerHeight - 50;

// Game variables
const socket = io();
let snake;
let foods = [];
let otherPlayers = {};
let mouseX = 0;
let mouseY = 0;
let gameOver = false;
let playerName = '';

// Hide canvas and leaderboard initially
canvas.style.display = 'none';
document.getElementById('leaderboard').style.display = 'none';

// Add waiting room elements
const waitingRoom = document.getElementById('waitingRoom');
const playerList = document.getElementById('playerList');
const countdownDisplay = document.getElementById('countdown');

// Game state
let isReady = false;
let gameStarted = false;
let isRoomMaster = false;

// Handle enter game button click
enterGameButton.addEventListener('click', () => {
    playerName = playerNameInput.value.trim();
    if (playerName) {
        nameModal.style.display = 'none';
        waitingRoom.style.display = 'block';
        socket.emit('setName', playerName);
    }
});

// Handle ready button click (for all players including master)
readyButton.addEventListener('click', () => {
    isReady = !isReady;
    readyButton.textContent = isReady ? 'Not Ready' : 'Ready';
    readyButton.style.background = isReady ? '#ff0000' : '#4CAF50';
    socket.emit('playerReady');
});

// Handle start game button click (for room master)
startGameButton.addEventListener('click', () => {
    if (isRoomMaster) {
        socket.emit('startGame');
        startGameButton.disabled = true;
        startGameButton.style.opacity = '0.5';
    }
});

// Update UI based on room master status
function updateStartButton() {
    if (isRoomMaster) {
        startGameButton.style.display = 'inline-block';
    } else {
        startGameButton.style.display = 'none';
    }
}

// Socket events for game state
socket.on('gameState', (data) => {
    if (data.state === 'playing') {
        startGame();
    } else if (data.state === 'countdown') {
        countdownDisplay.textContent = `Game starts in ${data.countdown} seconds`;
    }
    
    // Update room master status
    isRoomMaster = socket.id === data.roomMaster;
    updateStartButton();
});

// Handle enter key in name input
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        enterGameButton.click();
    }
});

// Game boundaries
const WORLD_SIZE = 3000;
const WORLD_BOUNDS = {
    minX: -WORLD_SIZE/2,
    maxX: WORLD_SIZE/2,
    minY: -WORLD_SIZE/2,
    maxY: WORLD_SIZE/2
};

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
    }

    sub(v) {
        return new Vector(this.x - v.x, this.y - v.y);
    }

    mult(n) {
        this.x *= n;
        this.y *= n;
    }

    normalize() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y);
        if (len !== 0) {
            this.x /= len;
            this.y /= len;
        }
    }

    copy() {
        return new Vector(this.x, this.y);
    }
}

class Snake {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);  // Start with zero velocity
        this.segments = [];
        this.radius = 10;
        this.length = 50;
        this.color = `hsl(${Math.random() * 360}, 50%, 50%)`;
        this.isDead = false;
        
        // Initialize segments
        for (let i = 0; i < this.length; i++) {
            this.segments.push(new Vector(x - i, y));
        }
    }

    update() {
        if (this.isDead) return;

        const CONSTANT_SPEED = 2;  
        
        // Calculate direction based on control type
        let moveVec;
        if (isMobileControl) {
            if (Math.abs(joystickData.x) > 0.1 || Math.abs(joystickData.y) > 0.1) {
                moveVec = new Vector(joystickData.x, joystickData.y);
            } else {
                moveVec = new Vector(this.vel.x, this.vel.y);
            }
        } else {
            const center = new Vector(canvas.width/2, canvas.height/2);
            moveVec = new Vector(mouseX - center.x, mouseY - center.y);
        }

        // Normalize and apply constant speed
        if (moveVec.x !== 0 || moveVec.y !== 0) {
            const len = Math.sqrt(moveVec.x * moveVec.x + moveVec.y * moveVec.y);
            moveVec.x = (moveVec.x / len) * CONSTANT_SPEED;
            moveVec.y = (moveVec.y / len) * CONSTANT_SPEED;
        }

        // Smooth turning
        this.vel.x = this.vel.x * 0.9 + moveVec.x * 0.1;
        this.vel.y = this.vel.y * 0.9 + moveVec.y * 0.1;

        // Ensure constant speed
        const currentSpeed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
        if (currentSpeed > 0) {
            this.vel.x = (this.vel.x / currentSpeed) * CONSTANT_SPEED;
            this.vel.y = (this.vel.y / currentSpeed) * CONSTANT_SPEED;
        }
        
        // Update head position
        this.pos.add(this.vel);
        
        // Check world boundaries
        if (this.pos.x < WORLD_BOUNDS.minX || this.pos.x > WORLD_BOUNDS.maxX ||
            this.pos.y < WORLD_BOUNDS.minY || this.pos.y > WORLD_BOUNDS.maxY) {
            this.die();
            return;
        }

        // Check collision with other snakes
        for (const id in otherPlayers) {
            if (id !== socket.id) {
                const otherSnake = otherPlayers[id];
                for (const segment of otherSnake.segments) {
                    const dx = this.pos.x - segment.x;
                    const dy = this.pos.y - segment.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < this.radius + otherSnake.radius) {
                        this.die();
                        return;
                    }
                }
            }
        }
        
        // Update segments
        let prev = this.pos.copy();
        for (let segment of this.segments) {
            const temp = segment.copy();
            segment.x = prev.x;
            segment.y = prev.y;
            prev = temp;
        }
    }

    die() {
        this.isDead = true;
        gameOver = true;
        gameOverDiv.style.display = 'block';

        // Calculate position for food dots, shifted away from border if needed
        let foodX = this.pos.x;
        let foodY = this.pos.y;
        const shiftAmount = 50;

        // Only shift if we hit a border
        if (this.pos.x <= WORLD_BOUNDS.minX) foodX = WORLD_BOUNDS.minX + shiftAmount;
        else if (this.pos.x >= WORLD_BOUNDS.maxX) foodX = WORLD_BOUNDS.maxX - shiftAmount;
        if (this.pos.y <= WORLD_BOUNDS.minY) foodY = WORLD_BOUNDS.minY + shiftAmount;
        else if (this.pos.y >= WORLD_BOUNDS.maxY) foodY = WORLD_BOUNDS.maxY - shiftAmount;

        // Create food dots at the death position
        const foodDots = [];
        // Create one dot for each segment plus head
        for (let i = 0; i < this.segments.length + 1; i++) {
            foodDots.push({
                x: foodX,
                y: foodY,
                r: this.radius,
                color: this.color,
                value: 1
            });
        }

        // Send food dots to server
        socket.emit('playerDied', foodDots);
        
        // Clear segments
        this.segments = [];
    }

    draw(ctx) {
        if (this.isDead) return;
        
        ctx.fillStyle = this.color;
        
        // Draw segments
        for (let i = 0; i < this.segments.length; i++) {
            const size = this.radius * (1 - i/this.segments.length * 0.5);
            ctx.beginPath();
            ctx.arc(this.segments[i].x, this.segments[i].y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw head
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw eyes
        const angle = Math.atan2(this.vel.y, this.vel.x);
        const eyeDistance = this.radius * 0.5;
        const eyeSize = this.radius * 0.3;
        const eyeOffset = this.radius * 0.3;

        // Left eye position
        const leftEyeX = this.pos.x + Math.cos(angle - 0.5) * eyeDistance;
        const leftEyeY = this.pos.y + Math.sin(angle - 0.5) * eyeDistance;
        
        // Right eye position
        const rightEyeX = this.pos.x + Math.cos(angle + 0.5) * eyeDistance;
        const rightEyeY = this.pos.y + Math.sin(angle + 0.5) * eyeDistance;

        // Draw eye whites
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw pupils
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(leftEyeX + Math.cos(angle) * eyeOffset * 0.3, 
                leftEyeY + Math.sin(angle) * eyeOffset * 0.3, 
                eyeSize * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightEyeX + Math.cos(angle) * eyeOffset * 0.3, 
                rightEyeY + Math.sin(angle) * eyeOffset * 0.3, 
                eyeSize * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw name
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(playerName, this.pos.x, this.pos.y - this.radius - 5);
    }

    eat(food) {
        if (this.isDead) return false;
        
        const dx = this.pos.x - food.x;
        const dy = this.pos.y - food.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.radius + food.r) {
            this.grow(food.value || 1);
            return true;
        }
        return false;
    }

    grow(value = 1) {
        // Add a new segment every time food is eaten
        const last = this.segments[this.segments.length - 1].copy();
        this.segments.push(last);
        this.length++;
        
        // Very small radius increase
        this.radius = Math.min(this.radius + 0.02, 25);
    }
}

// Draw grid
function drawGrid(ctx, offsetX, offsetY) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const gridSize = 50;
    
    // Draw only visible grid
    const startX = Math.max(WORLD_BOUNDS.minX, -canvas.width/2 - offsetX);
    const endX = Math.min(WORLD_BOUNDS.maxX, canvas.width/2 - offsetX);
    const startY = Math.max(WORLD_BOUNDS.minY, -canvas.height/2 - offsetY);
    const endY = Math.min(WORLD_BOUNDS.maxY, canvas.height/2 - offsetY);
    
    // Vertical lines
    for (let x = Math.floor(startX/gridSize)*gridSize; x <= endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, startY + offsetY);
        ctx.lineTo(x + offsetX, endY + offsetY);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = Math.floor(startY/gridSize)*gridSize; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX + offsetX, y + offsetY);
        ctx.lineTo(endX + offsetX, y + offsetY);
        ctx.stroke();
    }

    // Draw world bounds
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 5;
    ctx.strokeRect(
        WORLD_BOUNDS.minX + offsetX,
        WORLD_BOUNDS.minY + offsetY,
        WORLD_SIZE,
        WORLD_SIZE
    );
}

// Initialize game
function init() {
    snake = new Snake(0, 0); // Start at center
    
    // Socket events
    socket.on('heartbeat', function(data) {
        otherPlayers = data.players;
        foods = data.foods;
    });

    socket.on('updateLeaderboard', function(data) {
        updateLeaderboard(data);
    });

    // Start game loop
    gameLoop();
}

// Track mouse movement
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Update leaderboard display
function updateLeaderboard(data) {
    scoresDiv.innerHTML = data
        .slice(0, 5)
        .map(player => `<div>${player.name}: ${player.score}</div>`)
        .join('');
}

// Game loop
function gameLoop() {
    if (!gameOver) {
        // Clear canvas
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Calculate camera offset
        const offsetX = canvas.width/2 - snake.pos.x;
        const offsetY = canvas.height/2 - snake.pos.y;
        
        // Draw grid
        drawGrid(ctx, offsetX, offsetY);
        
        // Draw food
        for (const food of foods) {
            ctx.fillStyle = food.color || '#ff0000';
            ctx.beginPath();
            ctx.arc(food.x + offsetX, food.y + offsetY, food.r, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw other players
        for (const id in otherPlayers) {
            if (id !== socket.id) {
                const player = otherPlayers[id];
                ctx.fillStyle = player.color;

                // Draw segments
                for (const segment of player.segments) {
                    ctx.beginPath();
                    ctx.arc(segment.x + offsetX, segment.y + offsetY, player.radius, 0, Math.PI * 2);
                    ctx.fill();
                }

                // If player has at least one segment (for direction)
                if (player.segments.length > 0) {
                    // Calculate direction
                    const dx = player.x - player.segments[0].x;
                    const dy = player.y - player.segments[0].y;
                    const angle = Math.atan2(dy, dx);

                    // Draw eyes
                    const eyeDistance = player.radius * 0.5;
                    const eyeSize = player.radius * 0.3;
                    const eyeOffset = player.radius * 0.3;

                    // Left eye position
                    const leftEyeX = player.x + Math.cos(angle - 0.5) * eyeDistance;
                    const leftEyeY = player.y + Math.sin(angle - 0.5) * eyeDistance;
                    
                    // Right eye position
                    const rightEyeX = player.x + Math.cos(angle + 0.5) * eyeDistance;
                    const rightEyeY = player.y + Math.sin(angle + 0.5) * eyeDistance;

                    // Draw eye whites
                    ctx.fillStyle = 'white';
                    ctx.beginPath();
                    ctx.arc(leftEyeX + offsetX, leftEyeY + offsetY, eyeSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(rightEyeX + offsetX, rightEyeY + offsetY, eyeSize, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw pupils
                    ctx.fillStyle = 'black';
                    ctx.beginPath();
                    ctx.arc(leftEyeX + Math.cos(angle) * eyeOffset * 0.3 + offsetX, 
                            leftEyeY + Math.sin(angle) * eyeOffset * 0.3 + offsetY, 
                            eyeSize * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(rightEyeX + Math.cos(angle) * eyeOffset * 0.3 + offsetX, 
                            rightEyeY + Math.sin(angle) * eyeOffset * 0.3 + offsetY, 
                            eyeSize * 0.5, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw name
                    ctx.fillStyle = 'white';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(player.name, player.x + offsetX, player.y + offsetY - player.radius - 5);
                }
            }
        }
        
        // Update and draw player snake
        snake.update();
        ctx.save();
        ctx.translate(offsetX, offsetY);
        snake.draw(ctx);
        ctx.restore();
        
        // Check for food collision
        for (let i = foods.length - 1; i >= 0; i--) {
            if (snake.eat(foods[i])) {
                socket.emit('foodEaten', i);
            }
        }
        
        // Send player data to server
        socket.emit('update', {
            x: snake.pos.x,
            y: snake.pos.y,
            segments: snake.segments.map(s => ({x: s.x, y: s.y})),
            color: snake.color,
            radius: snake.radius,
            name: playerName
        });
    }
    
    requestAnimationFrame(gameLoop);
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth - 50;
    canvas.height = window.innerHeight - 50;
});

// Add restart function
function restartGame() {
    gameOver = false;
    gameOverDiv.style.display = 'none';
    waitingRoom.style.display = 'block';
    canvas.style.display = 'none';
    
    // Reset ready state
    isReady = false;
    readyButton.disabled = false;
    readyButton.style.opacity = '1';
    
    // Create new snake at center with zero initial velocity
    snake = new Snake(0, 0);
    
    // Reset any accumulated movement data
    joystickData = { x: 0, y: 0 };
    lastMoveVec = new Vector(0, 0);
}

// Update the game over div event listener
document.getElementById('playAgain').onclick = (e) => {
    e.preventDefault();
    restartGame();
};

// Add mobile control variables
const mobileControls = document.getElementById('mobileControls');
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');
let isMobileControl = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let joystickData = { x: 0, y: 0 };
let lastMoveVec = new Vector(0, 0);

// Joystick touch handling
let isJoystickActive = false;
const joystickBounds = {
    maxDistance: 35,  // Maximum distance stick can move from center
    centerX: 0,
    centerY: 0
};

function updateJoystickBounds() {
    const rect = joystick.getBoundingClientRect();
    joystickBounds.centerX = rect.left + rect.width / 2;
    joystickBounds.centerY = rect.top + rect.height / 2;
}

function handleJoystickStart(e) {
    isJoystickActive = true;
    updateJoystickBounds();
    handleJoystickMove(e);
}

function handleJoystickMove(e) {
    if (!isJoystickActive) return;

    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    
    let dx = touch.clientX - joystickBounds.centerX;
    let dy = touch.clientY - joystickBounds.centerY;
    
    // Calculate distance from center
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize if distance is greater than maxDistance
    if (distance > joystickBounds.maxDistance) {
        dx = (dx / distance) * joystickBounds.maxDistance;
        dy = (dy / distance) * joystickBounds.maxDistance;
    }
    
    // Update stick position
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    
    // Update joystick data for snake movement
    joystickData.x = dx / joystickBounds.maxDistance;
    joystickData.y = dy / joystickBounds.maxDistance;
}

function handleJoystickEnd() {
    isJoystickActive = false;
    stick.style.transform = 'translate(-50%, -50%)';
    joystickData = { x: 0, y: 0 };
}

// Add touch event listeners
joystick.addEventListener('touchstart', handleJoystickStart);
joystick.addEventListener('touchmove', handleJoystickMove);
joystick.addEventListener('touchend', handleJoystickEnd);
joystick.addEventListener('touchcancel', handleJoystickEnd);

// Also add mouse event listeners for testing on desktop
joystick.addEventListener('mousedown', handleJoystickStart);
document.addEventListener('mousemove', (e) => {
    if (isJoystickActive) handleJoystickMove(e);
});
document.addEventListener('mouseup', handleJoystickEnd);

// Add fullscreen button functionality
const fullscreenButton = document.getElementById('fullscreenButton');

fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

// Update canvas size function
function updateCanvasSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Handle window resize and orientation change
window.addEventListener('resize', updateCanvasSize);
window.addEventListener('orientationchange', updateCanvasSize);

// Initial canvas size
updateCanvasSize();

// Handle fullscreen change
document.addEventListener('fullscreenchange', () => {
    updateCanvasSize();
});

socket.on('playerList', (players) => {
    const playerListHTML = players.map(player => {
        const statusClass = player.ready ? 'ready' : 'not-ready';
        const statusText = player.ready ? 'Ready' : 'Not Ready';
        const masterIcon = player.isRoomMaster ? '<span class="crown-icon">👑 Game Master</span>' : '';
        
        return `
            <div class="player-item">
                <div class="player-name">
                    ${masterIcon}
                    <span>${player.name}</span>
                </div>
                <span class="status-indicator ${statusClass}">${statusText}</span>
            </div>`;
    }).join('');
    
    playerList.innerHTML = playerListHTML;
    
    // Update waiting message
    const allReady = players.every(player => player.ready);
    if (allReady) {
        if (isRoomMaster) {
            waitingMessage.textContent = 'All players ready! Click Start Game to begin!';
        } else {
            waitingMessage.textContent = 'All players ready! Waiting for game master to start...';
        }
        waitingMessage.style.color = '#4CAF50';
    } else {
        const notReadyCount = players.filter(player => !player.ready).length;
        waitingMessage.textContent = `Waiting for ${notReadyCount} player${notReadyCount > 1 ? 's' : ''} to be ready...`;
        waitingMessage.style.color = 'orange';
    }
});

// Add socket event for all players ready
socket.on('allPlayersReady', (ready) => {
    if (isRoomMaster) {
        startGameButton.disabled = !ready;
        startGameButton.style.opacity = ready ? '1' : '0.5';
        waitingMessage.textContent = ready ? 'All players ready! You can start the game!' : 'Waiting for all players to be ready...';
        waitingMessage.style.color = ready ? '#4CAF50' : 'orange';
    }
}); 