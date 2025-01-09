const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoresDiv = document.getElementById('scores');
const gameOverDiv = document.getElementById('gameOver');
const nameModal = document.getElementById('nameModal');
const playerNameInput = document.getElementById('playerName');
const startButton = document.getElementById('startButton');

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

// Handle start button click
startButton.addEventListener('click', () => {
    playerName = playerNameInput.value.trim();
    if (playerName) {
        nameModal.style.display = 'none';
        canvas.style.display = 'block';
        document.getElementById('leaderboard').style.display = 'block';
        init(); // Start the game
        socket.emit('setName', playerName);
    }
});

// Handle enter key in name input
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startButton.click();
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
        this.vel = new Vector(1, 0);
        this.segments = [];
        this.radius = 10;
        this.length = 20;
        this.color = `hsl(${Math.random() * 360}, 50%, 50%)`;
        this.isDead = false;
        
        // Initialize segments
        for (let i = 0; i < this.length; i++) {
            this.segments.push(new Vector(x - i, y));
        }
    }

    update() {
        if (this.isDead) return;

        // Calculate direction based on mouse position
        const center = new Vector(canvas.width/2, canvas.height/2);
        const mouseVec = new Vector(mouseX - center.x, mouseY - center.y);
        mouseVec.normalize();
        mouseVec.mult(3);

        // Smooth turning
        this.vel.x = this.vel.x * 0.9 + mouseVec.x * 0.1;
        this.vel.y = this.vel.y * 0.9 + mouseVec.y * 0.1;
        
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
                // Check collision with other snake's segments
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
        for (let i = 0; i < value; i++) {
            const last = this.segments[this.segments.length - 1].copy();
            this.segments.push(last);
            this.length++;
        }
        this.radius = Math.min(this.radius + 0.5, 30);
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