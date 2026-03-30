// Impossible Tower Defense - Phase 1: Grid + Placement + A* Validation

import { Grid } from './grid.js';
import { Renderer } from './renderer.js';

// Grid: 9 columns wide (max 8 bunkers across = always 1 gap), 20 rows tall
const GRID_COLS = 9;
const GRID_ROWS = 20;

const grid = new Grid(GRID_COLS, GRID_ROWS);
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, grid);

// UI elements
const buildBtn = document.getElementById('build-btn');
const cashEl = document.getElementById('cash');

// Game state
let buildMode = false;
let cash = 500;
const BUNKER_COST = 50;

// Update path display
function updatePath() {
  renderer.currentPath = grid.getCurrentPath();
}
updatePath();

// Build mode toggle
buildBtn.addEventListener('click', () => {
  buildMode = !buildMode;
  renderer.buildMode = buildMode;
  buildBtn.classList.toggle('active', buildMode);
  buildBtn.textContent = buildMode ? '✅ Building...' : '🔨 Build Mode';
});

// Handle click/tap on grid
function handleGridClick(screenX, screenY) {
  const pos = renderer.screenToGrid(screenX, screenY);
  if (!pos) return;

  if (buildMode) {
    if (cash < BUNKER_COST) {
      flashMessage('Not enough cash!');
      return;
    }

    const placed = grid.tryPlace(pos.col, pos.row);
    if (placed) {
      cash -= BUNKER_COST;
      cashEl.textContent = cash;
      updatePath();
    } else if (grid.canPlace(pos.col, pos.row)) {
      flashMessage('Would block the path!');
    }
  }
  // TODO: tap bunker outside build mode → garrison panel
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
function gameLoop() {
  requestAnimationFrame(gameLoop);
  renderer.draw();
}

gameLoop();

console.log('Impossible Tower Defense loaded!');
console.log(`Grid: ${GRID_COLS}x${GRID_ROWS} | Bunker cost: $${BUNKER_COST}`);
