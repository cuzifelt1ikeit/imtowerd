/**
 * GAME.JS — Main Game Loop & UI Logic
 *
 * This is the "brain" of the game. It connects all the other modules together:
 * - Creates the grid, renderer, wave manager, and bunker manager
 * - Handles all user input (clicks, touches, button presses)
 * - Manages the game state (cash, HP, wave number)
 * - Controls the garrison panel UI (buying and upgrading units)
 * - Runs the main game loop (update → draw, 60 times per second)
 *
 * Think of this file as the conductor of an orchestra — it doesn't play
 * any instruments itself, but it tells everyone else when and how to play.
 */

import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { WaveManager } from './enemies.js';
import { BunkerManager, UNIT_TYPES, MAX_TIER, getUpgradeCost } from './bunkers.js';

// ── Initialize Core Systems ──────────────────────────────────────
// Grid: 9 columns wide (max 8 bunkers across = always 1 gap), 20 rows tall
const GRID_COLS = 9;
const GRID_ROWS = 20;

const grid = new Grid(GRID_COLS, GRID_ROWS);          // The game board
const canvas = document.getElementById('game');         // The HTML canvas element
const renderer = new Renderer(canvas, grid);            // Draws everything to screen
const waveManager = new WaveManager(grid);              // Controls enemy waves
const bunkerManager = new BunkerManager();              // Manages all bunkers

// Connect systems so the renderer can draw bunkers and effects
renderer.bunkerManager = bunkerManager;
renderer.effects = waveManager.effects;

// ── UI Element References ────────────────────────────────────────
// These grab HTML elements so we can update their text/visibility from code.
const buildBtn = document.getElementById('build-btn');
const sendBtn = document.getElementById('send-btn');
const helpBtn = document.getElementById('help-btn');
const helpOverlay = document.getElementById('help-overlay');
const helpCloseBtn = document.getElementById('help-close-btn');
const cashEl = document.getElementById('cash');
const hpEl = document.getElementById('hp');
const waveNumEl = document.getElementById('wave-num');
const waveTimerEl = document.getElementById('wave-timer');

// Init build mode off — player learns to toggle it
renderer.buildMode = false;

// Help button — only visible before game starts
helpBtn.addEventListener('click', () => {
  helpOverlay.style.display = 'flex';
});
helpCloseBtn.addEventListener('click', () => {
  helpOverlay.style.display = 'none';
});

// ── Game State ───────────────────────────────────────────────────
// These variables track the current state of the game.
// They change as the player builds, enemies die, etc.
let buildMode = false;
let cash = 500;
let playerHp = 100;
const MAX_HP = 100;
const BUNKER_COST = 50;
let gameOver = false;
let lastTime = performance.now();
let totalKills = 0;
let totalEarned = 0;
let totalLeaked = 0;

// ── Economy ──────────────────────────────────────────────────────
// Kill bounty is calculated per-wave: total budget / number of enemies.
// This means every wave rewards roughly the same total cash, regardless
// of whether it has 5 tanks or 25 swarmers.
function getKillBounty(waveNum) {
  const budget = 50 + waveNum * 10; // Very tight economy
  const enemyCount = waveManager.spawnQueue.length + waveManager.enemies.length;
  return Math.max(1, Math.round(budget / Math.max(1, enemyCount)));
}
let currentBounty = 10; // default

// How much HP the player loses when each enemy type reaches the exit.
// Bigger/scarier enemies hurt more — a leaked boss is devastating.
const LEAK_DAMAGE = {
  grunt: 1,
  runner: 2,
  tank: 5,
  swarm: 0.5,
  boss: 20,
};

// ── Garrison Panel ───────────────────────────────────────────────
// The garrison panel is the popup that appears when you tap a bunker.
// It lets you add units and upgrade existing ones.
let garrisonPanel = null;
let selectedBunkerPos = null;

/** Refresh the garrison panel if it's open (call whenever cash changes) */
let lastGarrisonCash = -1;
function refreshGarrison() {
  if (!garrisonPanel || !selectedBunkerPos) return;
  if (cash === lastGarrisonCash) return; // No change, skip
  lastGarrisonCash = cash;
  const bunker = bunkerManager.getBunker(selectedBunkerPos.col, selectedBunkerPos.row);
  if (bunker) renderGarrisonPanel(bunker);
}

function updatePath() {
  renderer.currentPath = grid.getCurrentPath();
}
updatePath();

// ── Event Callbacks ──────────────────────────────────────────────
// These functions are called by the wave manager when things happen.
// They connect game events to UI updates and state changes.
waveManager.onEnemyEscaped = (enemy) => {
  const damage = LEAK_DAMAGE[enemy.type] || 1;
  playerHp = Math.max(0, playerHp - damage);
  hpEl.textContent = Math.round(playerHp);
  totalLeaked++;

  if (playerHp <= 0 && !gameOver) {
    gameOver = true;
    showGameOver();
  }
};

waveManager.onEnemyKilled = (enemy) => {
  cash += currentBounty;
  totalEarned += currentBounty;
  totalKills++;
  cashEl.textContent = cash;
  refreshGarrison();
};

waveManager.onWaveStart = (waveNum) => {
  waveNumEl.textContent = `Wave ${waveNum}`;
  // Calculate bounty for this wave
  const budget = 50 + waveNum * 10;
  const totalEnemies = waveManager.spawnQueue.length + waveManager.enemies.length;
  currentBounty = Math.max(1, Math.round(budget / Math.max(1, totalEnemies)));
};

waveManager.onWaveCleared = (waveNum) => {};

// Early send / Start button
sendBtn.addEventListener('click', () => {
  if (gameOver) return;
  if (waveManager.waitingForPlayer) {
    waveManager.sendEarly(); // Starts the game
    helpBtn.style.display = 'none';
    helpOverlay.style.display = 'none';
    renderer.resize(); // Recalculate viewport now that help button is gone
    flashMessage('Wave 1 incoming!', '#4CAF50');
    return;
  }
  const bonus = waveManager.sendEarly();
  if (bonus > 0) {
    cash += bonus;
    totalEarned += bonus;
    cashEl.textContent = cash;
    refreshGarrison();
    flashMessage(`+$${bonus} early send bonus!`, '#f0c040');
  }
});

// Build mode toggle
buildBtn.addEventListener('click', () => {
  if (gameOver) return;
  buildMode = !buildMode;
  renderer.buildMode = buildMode;
  buildBtn.classList.toggle('active', buildMode);
  buildBtn.textContent = buildMode ? '✅ Building...' : '🔨 Build Mode';
  closeGarrisonPanel();
});

// Handle click/tap on grid
function handleGridClick(screenX, screenY) {
  if (gameOver) return;

  const pos = renderer.screenToGrid(screenX, screenY);
  if (!pos) {
    closeGarrisonPanel();
    return;
  }

  if (buildMode) {
    // If clicking an existing bunker in build mode, exit build mode and open its panel
    const existingBunker = bunkerManager.getBunker(pos.col, pos.row);
    if (existingBunker) {
      buildMode = false;
      renderer.buildMode = false;
      buildBtn.classList.remove('active');
      buildBtn.textContent = '🔨 Build Mode';
      openGarrisonPanel(existingBunker);
      return;
    }

    // Place bunker
    if (cash < BUNKER_COST) {
      flashMessage('Not enough cash!');
      return;
    }

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
      bunkerManager.addBunker(pos.col, pos.row);
      updatePath();
      waveManager.recalculatePaths();
    } else if (grid.canPlace(pos.col, pos.row)) {
      flashMessage('Would block the path!');
    }
  } else {
    // Check if clicking a bunker
    const bunker = bunkerManager.getBunker(pos.col, pos.row);
    if (bunker) {
      openGarrisonPanel(bunker);
    } else {
      closeGarrisonPanel();
    }
  }
}

// Garrison panel
function openGarrisonPanel(bunker) {
  selectedBunkerPos = { col: bunker.col, row: bunker.row };
  renderer.selectedBunker = bunker;
  lastGarrisonCash = -1; // Force refresh on open

  closeGarrisonPanel();

  garrisonPanel = document.createElement('div');
  garrisonPanel.id = 'garrison-panel';
  garrisonPanel.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: rgba(10, 10, 30, 0.95); border: 1px solid #444;
    border-radius: 12px; padding: 16px; z-index: 50;
    min-width: 300px; max-width: 90vw; color: white; font-family: sans-serif;
  `;

  renderGarrisonPanel(bunker);
  document.body.appendChild(garrisonPanel);
}

function renderGarrisonPanel(bunker) {
  if (!garrisonPanel) return;

  let html = `<div id="close-panel" style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:16px; margin-bottom:10px; cursor:pointer; padding:4px 0;">
    <span>🏰 Bunker (${bunker.units.length}/${bunker.maxUnits})</span>
    <span style="font-size:20px; padding:4px 8px;">✕</span>
  </div>`;

  // Current garrison with upgrade buttons
  if (bunker.units.length > 0) {
    html += `<div style="margin-bottom:10px;">`;
    for (let i = 0; i < bunker.units.length; i++) {
      const unit = bunker.units[i];
      const def = UNIT_TYPES[unit.type];
      const upgCost = getUpgradeCost(unit.type, unit.tier);
      const canUpgrade = unit.canUpgrade();
      const canAffordUpg = cash >= upgCost;

      html += `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;
        padding:6px 8px; background:rgba(255,255,255,0.05); border-radius:6px;
        border-left: 3px solid ${def.color};">
        <div style="flex:1;">
          <span style="font-weight:bold; color:${def.color};">${def.shortName}</span>
          <span style="color:#aaa; font-size:12px;">T${unit.tier}/${MAX_TIER}</span>
          <div style="font-size:11px; color:#777; margin-top:2px;">
            DMG:${unit.damage} · FR:${unit.fireRate}/s · RNG:${unit.range}
            · <span style="color:#f0c040;">DPS:${unit.getDPS()}</span>
          </div>
        </div>
        ${canUpgrade ? `
          <button class="unit-upg-btn" data-index="${i}" style="
            padding:4px 10px; border-radius:4px; font-size:11px;
            border:1px solid ${canAffordUpg ? '#4CAF50' : '#444'};
            background:${canAffordUpg ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.03)'};
            color:${canAffordUpg ? '#4CAF50' : '#666'};
            cursor:${canAffordUpg ? 'pointer' : 'not-allowed'};
            white-space:nowrap;
          ">⬆ $${upgCost}</button>
        ` : `<span style="font-size:11px; color:#4CAF50;">MAX</span>`}
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="color:#888; margin-bottom:10px; font-size:13px;">Empty — add units to attack</div>`;
  }

  // Add unit buttons
  if (bunker.units.length < bunker.maxUnits) {
    html += `<div style="font-size:13px; color:#aaa; margin-bottom:6px;">Add Unit:</div>`;
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">`;
    for (const [type, def] of Object.entries(UNIT_TYPES)) {
      const canAfford = cash >= def.cost;
      html += `<button class="unit-buy-btn" data-type="${type}" style="
        padding: 8px 12px; border-radius: 6px; border: 1px solid ${canAfford ? def.color : '#444'};
        background: ${canAfford ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'};
        color: ${canAfford ? '#fff' : '#666'}; cursor: ${canAfford ? 'pointer' : 'not-allowed'};
        font-size: 12px; text-align: center;
      ">
        <div style="font-weight:bold;">${def.shortName}</div>
        <div style="font-size:11px;">$${def.cost}</div>
      </button>`;
    }
    html += `</div>`;
  }

  // Bunker total stats
  if (bunker.units.length > 0) {
    const totalDPS = bunker.units.reduce((sum, u) => sum + u.getDPS(), 0).toFixed(1);
    html += `<div style="margin-top:8px; font-size:11px; color:#888; display:flex; justify-content:space-between;">
      <span>Range: ${bunker.getMaxRange()} cells</span>
      <span style="color:#f0c040;">Total DPS: ${totalDPS}</span>
    </div>`;
  }

  garrisonPanel.innerHTML = html;

  // Close button
  document.getElementById('close-panel')?.addEventListener('click', closeGarrisonPanel);

  // Buy buttons
  garrisonPanel.querySelectorAll('.unit-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const def = UNIT_TYPES[type];
      if (cash < def.cost) {
        flashMessage('Not enough cash!');
        return;
      }
      if (bunker.units.length >= bunker.maxUnits) return;

      bunker.addUnit(type);
      cash -= def.cost;
      cashEl.textContent = cash;
      renderGarrisonPanel(bunker);
    });
  });

  // Upgrade buttons
  garrisonPanel.querySelectorAll('.unit-upg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const unit = bunker.units[idx];
      if (!unit || !unit.canUpgrade()) return;

      const cost = getUpgradeCost(unit.type, unit.tier);
      if (cash < cost) {
        flashMessage('Not enough cash!');
        return;
      }

      unit.upgrade();
      cash -= cost;
      cashEl.textContent = cash;
      renderGarrisonPanel(bunker);
    });
  });
}

function closeGarrisonPanel() {
  if (garrisonPanel) {
    garrisonPanel.remove();
    garrisonPanel = null;
  }
  selectedBunkerPos = null;
  renderer.selectedBunker = null;
  lastGarrisonCash = -1;
}

// Game over screen
function showGameOver() {
  closeGarrisonPanel();
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
  const bunkerCount = bunkerManager.getAllBunkers().length;
  const unitCount = bunkerManager.getAllBunkers().reduce((s, b) => s + b.units.length, 0);

  el.innerHTML = `
    <h1 style="font-size: 48px; color: #e74c3c; margin-bottom: 16px;">GAME OVER</h1>
    <p style="font-size: 28px; margin-bottom: 20px;">Wave ${waveManager.waveNumber}</p>
    <div style="background:rgba(255,255,255,0.05); padding:16px 24px; border-radius:10px;
      text-align:left; font-size:16px; line-height:2; min-width:250px;">
      <div>🎯 Kills: <span style="color:#4CAF50; float:right;">${totalKills}</span></div>
      <div>💀 Leaked: <span style="color:#e74c3c; float:right;">${totalLeaked}</span></div>
      <div>💰 Earned: <span style="color:#f0c040; float:right;">$${totalEarned}</span></div>
      <div>🏰 Bunkers: <span style="color:#aaa; float:right;">${bunkerCount}</span></div>
      <div>👥 Units: <span style="color:#aaa; float:right;">${unitCount}</span></div>
    </div>
    <button id="play-again-btn" style="
      margin-top: 20px; padding: 14px 36px; font-size: 18px; font-weight: bold;
      border: 2px solid #4CAF50; border-radius: 8px;
      background: rgba(76, 175, 80, 0.2); color: #4CAF50;
      cursor: pointer;
    ">🔄 Play Again</button>
  `;
  document.getElementById('play-again-btn').addEventListener('click', () => location.reload());
}

// Flash message
let flashTimeout = null;
function flashMessage(msg, color = '#ff6b6b') {
  let el = document.getElementById('flash-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-msg';
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: ${color}; padding: 12px 24px;
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

function formatTime(seconds) {
  const s = Math.ceil(seconds);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Input Handling ───────────────────────────────────────────────
// Handles both mouse (desktop) and touch (mobile) input.
// Touch input distinguishes between scrolling (drag) and tapping (click)
// by checking how far the finger moved and how long it was held.
let isDragging = false;
let lastTouchY = 0;
let touchStartY = 0;
let touchStartTime = 0;

canvas.addEventListener('mousedown', () => { isDragging = false; });

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const pos = renderer.screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
  if (pos) renderer.setHover(pos.col, pos.row);
  else renderer.clearHover();
});

canvas.addEventListener('click', (e) => {
  if (isDragging) return;
  const rect = canvas.getBoundingClientRect();
  handleGridClick(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('mouseleave', () => renderer.clearHover());

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
  renderer.scroll(lastTouchY - touch.clientY);
  lastTouchY = touch.clientY;
  if (Math.abs(touch.clientY - touchStartY) > 10) isDragging = true;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!isDragging && Date.now() - touchStartTime < 300) {
    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    handleGridClick(touch.clientX - rect.left, touch.clientY - rect.top);
  }
}, { passive: false });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.scroll(e.deltaY);
}, { passive: false });

window.addEventListener('resize', () => renderer.resize());

// ── Main Game Loop ───────────────────────────────────────────────
// This function runs ~60 times per second (via requestAnimationFrame).
// Each frame: update game state → draw everything to the screen.
//
// "dt" (delta time) is the time since the last frame in seconds.
// Using dt makes the game run at the same speed regardless of frame rate.
// Example: if an enemy moves at 2 cells/second, it moves 2*dt cells per frame.
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  if (!gameOver) {
    waveManager.update(dt);
    bunkerManager.update(dt, waveManager.enemies);

    // Keep garrison panel in sync with cash changes
    refreshGarrison();

    if (waveManager.waitingForPlayer) {
      waveTimerEl.textContent = `Build your maze, then start!`;
      sendBtn.style.display = 'inline-block';
      sendBtn.textContent = `▶ Start Game`;
    } else if (waveManager.getTimeUntilNextWave() > 0) {
      const timeLeft = waveManager.getTimeUntilNextWave();
      waveTimerEl.textContent = `Next wave: ${formatTime(timeLeft)}`;
      sendBtn.style.display = 'inline-block';
      const bonus = Math.round(timeLeft * 5);
      sendBtn.textContent = `⚡ Send (+$${bonus})`;
    } else {
      const remaining = waveManager.getEnemiesRemaining();
      waveTimerEl.textContent = `Enemies: ${remaining}`;
      sendBtn.style.display = 'none';
    }
  }

  renderer.enemies = waveManager.enemies;
  renderer.draw();
}

requestAnimationFrame(gameLoop);

console.log('Impossible Tower Defense loaded!');
