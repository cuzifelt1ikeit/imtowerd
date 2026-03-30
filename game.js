// Impossible Tower Defense - Phase 2: Enemies + Waves

import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { WaveManager } from './enemies.js';

// Grid: 9 columns wide (max 8 bunkers across = always 1 gap), 20 rows tall
const GRID_COLS = 9;
const GRID_ROWS = 20;

const grid = new Grid(GRID_COLS, GRID_ROWS);
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, grid);
const waveManager = new WaveManager(grid);

// UI elements
const buildBtn = document.getElementById('build-btn');
const cashEl = document.getElementById('cash');
const hpEl = document.getElementById('hp');
const waveNumEl = document.getElementById('wave-num');
const waveTimerEl = document.getElementById('wave-timer');

// Game state
let buildMode = false;
let cash = 500;
let playerHp = 100;
const MAX_HP = 100;
const BUNKER_COST = 50;
let gameOver = false;
let lastTime = performance.now();

// HP damage per enemy type
const LEAK_DAMAGE = {
  grunt: 1,
  runner: 2,
  tank: 5,
  swarm: 0.5,
  boss: 20,
};

// Update path display
function updatePath() {
  renderer.currentPath = grid.getCurrentPath();
}
updatePath();

// Wave manager callbacks
waveManager.onEnemyEscaped = (enemy) => {
  const damage = LEAK_DAMAGE[enemy.type] || 1;
  playerHp = Math.max(0, playerHp - damage);
  hpEl.textContent = Math.round(playerHp);

  if (playerHp <= 0 && !gameOver) {
    gameOver = true;
    showGameOver();
  }
};

waveManager.onWaveStart = (waveNum) => {
  waveNumEl.textContent = `Wave ${waveNum}`;
};

waveManager.onWaveCleared = (waveNum) => {
  // Wave clear bonus could go here later
};

// Build mode toggle
buildBtn.addEventListener('click', () => {
  if (gameOver) return;
  buildMode = !buildMode;
  renderer.buildMode = buildMode;
  buildBtn.classList.toggle('active', buildMode);
  buildBtn.textContent = buildMode ? '✅ Building...' : '🔨 Build Mode';
});

// Handle click/tap on grid
function handleGridClick(screenX, screenY) {
  if (gameOver) return;

  const pos = renderer.screenToGrid(screenX, screenY);
  if (!pos) return;

  if (buildMode) {
    if (cash < BUNKER_COST) {
      flashMessage('Not enough cash!');
      return;
    }

    // Check no enemies on this cell
    const enemyOnCell = waveManager.enemies.some(e =>
      e.alive && Math.round(e.x) === pos.col && Math.round(e.y) === pos.row
    );
    if (enemyOnCell) {
      flashMessage('Enemies on this cell!');
      return;
    }

    const placed = grid.tryPlace(pos.col, pos.row);
    if (placed) {
      cash -= BUNKER_COST;
      cashEl.textContent = cash;
      updatePath();
      // Recalculate paths for existing enemies
      waveManager.recalculatePaths();
    } else if (grid.canPlace(pos.col, pos.row)) {
      flashMessage('Would block the path!');
    }
  }
}

// Game over screen
function showGameOver() {
  let el = document.getElementById('game-over');
  if (!el) {
    el = document.createElement('div');
    el.id = 'game-over';
    el.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.75); display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 200;
      color: white; font-family: sans-serif;
    `;
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <h1 style="font-size: 48px; color: #e74c3c; margin-bottom: 16px;">GAME OVER</h1>
    <p style="font-size: 24px; margin-bottom: 8px;">You reached Wave ${waveManager.waveNumber}</p>
    <p style="font-size: 18px; color: #aaa;">Refresh to play again</p>
  `;
}

// Flash message overlay
let flashTimeout = null;
function flashMessage(msg) {
  let el = document.getElementById('flash-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-msg';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: #ff6b6b; padding: 12px 24px;
      border-radius: 8px; font-size: 18px; font-weight: bold; z-index: 100;
      pointer-events: none; transition: opacity 0.3s;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}

// Format time
function formatTime(seconds) {
  const s = Math.ceil(seconds);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Mouse/touch input
let isDragging = false;
let lastTouchY = 0;
let touchStartY = 0;
let touchStartTime = 0;

canvas.addEventListener('mousedown', (e) => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const pos = renderer.screenToGrid(x, y);
  if (pos) {
    renderer.setHover(pos.col, pos.row);
  } else {
    renderer.clearHover();
  }
});

canvas.addEventListener('click', (e) => {
  if (isDragging) return;
  const rect = canvas.getBoundingClientRect();
  handleGridClick(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('mouseleave', () => {
  renderer.clearHover();
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  lastTouchY = touch.clientY;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  isDragging = false;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const deltaY = lastTouchY - touch.clientY;
  renderer.scroll(deltaY);
  lastTouchY = touch.clientY;

  if (Math.abs(touch.clientY - touchStartY) > 10) {
    isDragging = true;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!isDragging && Date.now() - touchStartTime < 300) {
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    handleGridClick(touch.clientX - rect.left, touch.clientY - rect.top);
  }
}, { passive: false });

// Mouse wheel scroll
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.scroll(e.deltaY);
}, { passive: false });

// Window resize
window.addEventListener('resize', () => {
  renderer.resize();
});

// Game loop
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  // Clamp dt to avoid huge jumps
  const clampedDt = Math.min(dt, 0.1);

  if (!gameOver) {
    // Update wave manager
    waveManager.update(clampedDt);

    // Update HUD
    const timeLeft = waveManager.getTimeUntilNextWave();
    if (timeLeft > 0) {
      waveTimerEl.textContent = `Next wave: ${formatTime(timeLeft)}`;
    } else {
      const remaining = waveManager.getEnemiesRemaining();
      waveTimerEl.textContent = `Enemies: ${remaining}`;
    }
  }

  // Pass enemies to renderer
  renderer.enemies = waveManager.enemies;
  renderer.draw();
}

requestAnimationFrame(gameLoop);

console.log('Impossible Tower Defense loaded!');
console.log(`Grid: ${GRID_COLS}x${GRID_ROWS} | Bunker cost: $${BUNKER_COST}`);
