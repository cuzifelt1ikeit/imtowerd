/**
 * ENEMIES.JS — Enemy System, Wave Generation & Visual Effects
 *
 * This file handles:
 * - Individual enemy behavior (movement, taking damage, dying)
 * - The "pathfinder vs wanderer" intelligence system
 * - Wave generation (what enemies appear and when)
 * - Death particles and damage number effects
 *
 * Two types of enemy AI:
 * - PATHFINDERS (🧭) follow the optimal A* path through the maze
 * - WANDERERS (?) stumble toward the exit with random movement
 */

// ── Enemy Class ──────────────────────────────────────────────────
/**
 * Represents a single enemy on the field.
 *
 * Each enemy has:
 * - A position (x, y as floats for smooth movement)
 * - HP that decreases when hit by bunker units
 * - A movement speed
 * - Either pathfinder or wanderer behavior
 *
 * @param {number} col — Starting grid column
 * @param {number} row — Starting grid row
 * @param {number} hp — Total hit points
 * @param {number} speed — Movement speed (grid cells per second)
 * @param {string} type — Enemy type key (grunt, runner, tank, swarm, boss)
 * @param {boolean} isPathfinder — true = follows A* path, false = wanders randomly
 */
export class Enemy {
  constructor(col, row, hp, speed, type = 'grunt', isPathfinder = true) {
    // Grid position (integer — which cell the enemy is "in")
    this.col = col;
    this.row = row;

    // Smooth position (float — for rendering between cells)
    // While col/row snap to grid cells, x/y move smoothly for animation
    this.x = col;
    this.y = row;

    // Combat stats
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.type = type;

    // State flags
    this.alive = true;
    this.escaped = false;   // True if this enemy reached the exit

    // Pathfinding
    this.path = [];          // Array of {col, row} waypoints to follow
    this.pathIndex = 0;      // Which waypoint we're currently heading toward
    this.isPathfinder = isPathfinder;

    // Active DOT (damage over time) effects — e.g., from flamethrowers
    this.dots = [];          // Array of {dps, remaining} objects

    // Visual effects
    this.hitFlash = 0;       // Timer: when > 0, enemy flashes white

    // Wanderer-specific state
    this.wanderBias = 0.7;   // How strongly wanderers prefer moving toward the exit
    this.lastDir = null;     // Previous position — used to prevent pacing back and forth
    this.wanderTimer = 0;    // Countdown until next direction decision
    this.wanderInterval = 0.3; // How often wanderers pick a new direction (seconds)
  }

  /**
   * Set the path this enemy should follow.
   * Snaps the enemy's position to the start of the path.
   */
  setPath(path) {
    this.path = path;
    this.pathIndex = 0;
    if (path && path.length > 0) {
      this.x = path[0].col;
      this.y = path[0].row;
    }
  }

  /**
   * Main update — called every frame.
   * Delegates to either pathfinder or wanderer movement.
   *
   * @param {number} dt — Delta time in seconds
   * @param {Grid} grid — The game grid (needed for wanderer obstacle avoidance)
   */
  update(dt, grid) {
    // Count down the hit flash effect
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Process burn/DOT effects
    if (this.dots.length > 0) this.updateDots(dt);

    if (!this.alive) return;

    // Move based on AI type
    if (this.isPathfinder) {
      this.updatePathfinder(dt);
    } else {
      this.updateWanderer(dt, grid);
    }
  }

  /**
   * PATHFINDER MOVEMENT
   * Follows the pre-calculated A* path waypoint by waypoint.
   * Smooth movement between waypoints using linear interpolation.
   */
  updatePathfinder(dt) {
    // Check if we've reached the end of our path
    if (!this.path || this.pathIndex >= this.path.length - 1) {
      if (this.alive && this.path && this.pathIndex >= this.path.length - 1) {
        this.escaped = true;
        this.alive = false;
      }
      return;
    }

    // Move toward the next waypoint
    const target = this.path[this.pathIndex + 1];
    const dx = target.col - this.x;
    const dy = target.row - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) {
      // Close enough to the waypoint — snap to it and advance
      this.x = target.col;
      this.y = target.row;
      this.col = target.col;
      this.row = target.row;
      this.pathIndex++;
    } else {
      // Move toward the waypoint at our speed
      const moveAmount = this.speed * dt;
      this.x += (dx / dist) * moveAmount; // Normalize direction, then scale by speed
      this.y += (dy / dist) * moveAmount;
      this.col = Math.round(this.x);
      this.row = Math.round(this.y);
    }
  }

  /**
   * WANDERER MOVEMENT
   * Instead of following the optimal path, wanderers:
   * 1. Strongly prefer moving DOWN (toward the exit)
   * 2. Sometimes move LEFT or RIGHT
   * 3. Rarely move UP (away from exit)
   * 4. Never walk into bunkers
   * 5. Try not to backtrack (no pacing back and forth)
   *
   * This creates enemies that bumble through the maze, often getting
   * stuck in dead ends or taking long detours. As waves progress,
   * fewer enemies are wanderers and more are pathfinders.
   */
  updateWanderer(dt, grid) {
    // Fallback: if no grid reference, act as pathfinder
    if (!grid) { this.updatePathfinder(dt); return; }

    const exitRow = grid.rows - 1;

    // Check if we reached the exit
    if (Math.round(this.y) >= exitRow) {
      this.escaped = true;
      this.alive = false;
      return;
    }

    // If we still have a waypoint to reach, keep moving toward it
    if (this.path && this.pathIndex < this.path.length - 1) {
      this.updatePathfinder(dt); // Reuse pathfinder movement for smooth animation
      return;
    }

    // Reached the target cell — small pause before picking a new direction
    this.wanderTimer -= dt;
    if (this.wanderTimer > 0) return;
    this.wanderTimer = this.wanderInterval + Math.random() * 0.2;

    const curCol = Math.round(this.x);
    const curRow = Math.round(this.y);

    // All possible moves (4 directions)
    const moves = [
      { col: curCol, row: curRow + 1 },     // Down (toward exit) — preferred
      { col: curCol - 1, row: curRow },      // Left
      { col: curCol + 1, row: curRow },      // Right
      { col: curCol, row: curRow - 1 },      // Up (away from exit) — rare
    ];

    // Filter out moves that are blocked or would backtrack
    const validMoves = moves.filter(m => {
      if (m.col < 0 || m.col >= grid.cols || m.row < 0 || m.row >= grid.rows) return false;
      const cell = grid.getCell(m.col, m.row);
      if (cell === 1) return false; // Can't walk through bunkers (CELL_BUNKER = 1)
      // Don't go back where we just came from
      if (this.lastDir && m.col === this.lastDir.col && m.row === this.lastDir.row) return false;
      return true;
    });

    // If stuck (all moves blocked except backtracking), allow backtracking
    if (validMoves.length === 0) {
      const anyValid = moves.filter(m => {
        if (m.col < 0 || m.col >= grid.cols || m.row < 0 || m.row >= grid.rows) return false;
        return grid.getCell(m.col, m.row) !== 1;
      });
      if (anyValid.length > 0) {
        const pick = anyValid[Math.floor(Math.random() * anyValid.length)];
        this.setWanderTarget(pick, curCol, curRow);
      }
      return;
    }

    // Weighted random selection:
    // - Down (toward exit): weight 10 — heavily preferred
    // - Sideways: weight 3 — moderate
    // - Up (away from exit): weight 0.5 — rare
    const weighted = [];
    for (const m of validMoves) {
      let weight = 1;
      if (m.row > curRow) weight = 10;       // Moving down = good
      else if (m.row === curRow) weight = 3;  // Sideways = okay
      else weight = 0.5;                       // Moving up = bad

      // Add this move multiple times based on weight (poor man's weighted random)
      for (let i = 0; i < weight * 10; i++) weighted.push(m);
    }

    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    this.setWanderTarget(pick, curCol, curRow);
  }

  /** Helper: set a single-step path for the wanderer to follow */
  setWanderTarget(target, fromCol, fromRow) {
    this.lastDir = { col: fromCol, row: fromRow }; // Remember where we were (for anti-backtrack)
    this.path = [
      { col: fromCol, row: fromRow },
      { col: target.col, row: target.row },
    ];
    this.pathIndex = 0;
    this.x = fromCol;
    this.y = fromRow;
  }

  /**
   * Apply damage to this enemy.
   * Triggers a visual hit flash and kills the enemy if HP reaches 0.
   */
  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.1; // Flash white for 0.1 seconds
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  /** Apply a damage-over-time effect (e.g., from flamethrower burn) */
  applyDot(dps, duration) {
    this.dots.push({ dps, remaining: duration });
  }

  /** Process all active DOT effects — deals continuous damage each frame */
  updateDots(dt) {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const dot = this.dots[i];
      this.hp -= dot.dps * dt;      // Deal fractional damage based on time elapsed
      dot.remaining -= dt;
      if (dot.remaining <= 0) this.dots.splice(i, 1); // Remove expired DOTs
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }
}

// ── Enemy Type Definitions ───────────────────────────────────────
// Visual and base stat config for each enemy type.
// HP and speed are modified by wave scaling before spawning.
export const ENEMY_TYPES = {
  grunt:  { hp: 50,  speed: 1.5, color: '#e74c3c', size: 0.6 },   // Standard — red
  runner: { hp: 25,  speed: 3.0, color: '#f39c12', size: 0.45 },  // Fast, fragile — orange
  tank:   { hp: 200, speed: 0.8, color: '#8e44ad', size: 0.8 },   // Slow, beefy — purple
  swarm:  { hp: 15,  speed: 2.0, color: '#e67e22', size: 0.35 },  // Tiny, many — dark orange
  boss:   { hp: 500, speed: 0.6, color: '#c0392b', size: 0.95 },  // Huge, deadly — dark red
};

// ── Visual Effects Manager ───────────────────────────────────────
/**
 * Manages particle effects and floating damage numbers.
 * These are purely visual — they don't affect gameplay.
 */
export class EffectsManager {
  constructor() {
    this.particles = [];      // Death explosion particles
    this.damageNumbers = [];  // Floating "-25" text
  }

  /**
   * Create a burst of particles when an enemy dies.
   * 6 particles shoot outward in different directions.
   */
  addDeathEffect(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,  // Horizontal velocity (based on angle)
        vy: Math.sin(angle) * speed,  // Vertical velocity
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.5,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  }

  /** Create a floating damage number at a position */
  addDamageNumber(x, y, amount) {
    this.damageNumbers.push({
      x, y,
      text: `-${Math.round(amount)}`,
      life: 0.6,
      maxLife: 0.6,
    });
  }

  /** Move particles and fade out damage numbers each frame */
  update(dt) {
    // Update particles — move them and count down their life
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update damage numbers — float upward and fade
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.y -= dt * 1.5; // Float upward
      d.life -= dt;
      if (d.life <= 0) this.damageNumbers.splice(i, 1);
    }
  }
}

// ── Wave Manager ─────────────────────────────────────────────────
/**
 * Controls the flow of the game:
 * - Counts down between waves
 * - Generates enemy compositions for each wave
 * - Spawns enemies one at a time from the top of the grid
 * - Detects when a wave is cleared
 * - Handles the "early send" mechanic
 *
 * The wave manager is the "game director" — it decides what the
 * player faces and when.
 */
export class WaveManager {
  constructor(grid) {
    this.grid = grid;
    this.enemies = [];              // All active enemies on the field
    this.waveNumber = 0;            // Current wave (0 = pre-game)
    this.waveActive = false;        // Is a wave currently in progress?
    this.spawnQueue = [];           // Enemies waiting to be spawned
    this.spawnTimer = 0;            // Countdown to next spawn
    this.spawnInterval = 0.4;       // Seconds between enemy spawns
    this.betweenWaveTimer = 0;      // Countdown between waves (0 = waiting for player)
    this.betweenWaveDuration = 15;  // Seconds between waves
    this.waveCleared = true;        // Has the current wave been fully cleared?
    this.waitingForPlayer = true;   // True before wave 1 — player must click Start

    // Callbacks — the game.js file sets these to react to events
    this.onEnemyEscaped = null;     // Called when an enemy reaches the exit
    this.onEnemyKilled = null;      // Called when an enemy's HP reaches 0
    this.onWaveStart = null;        // Called when a new wave begins
    this.onWaveCleared = null;      // Called when all enemies in a wave are gone

    // Visual effects manager
    this.effects = new EffectsManager();
  }

  /**
   * Calculate what percentage of enemies should be pathfinders for this wave.
   *
   * Wave 1: ~10% pathfinders (mostly dumb enemies)
   * Wave 10: ~32.5%
   * Wave 20: ~57.5%
   * Wave 30: ~82.5%
   * Caps at 85% — there are always some wanderers
   */
  getPathfinderRatio(waveNum) {
    const ratio = 0.1 + (waveNum - 1) * 0.025;
    return Math.min(0.85, ratio);
  }

  /**
   * Main update — called every frame from the game loop.
   * Handles wave timing, spawning, enemy updates, and cleanup.
   */
  update(dt) {
    // ── Between Waves: Count Down ──
    if (!this.waveActive && this.waveCleared) {
      if (this.waitingForPlayer) return; // Don't auto-start — player must click Start
      this.betweenWaveTimer -= dt;
      if (this.betweenWaveTimer <= 0) {
        this.startNextWave();
      }
    }

    // ── Spawn Queue: Release Enemies One at a Time ──
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift()); // Take first enemy from queue
        this.spawnTimer = this.spawnInterval;
      }
    }

    // ── Update All Enemies ──
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.update(dt, this.grid);

      // Check if this enemy just escaped
      if (enemy.escaped) {
        if (this.onEnemyEscaped) this.onEnemyEscaped(enemy);
      }
    }

    // ── Handle Deaths ──
    for (const enemy of this.enemies) {
      if (!enemy.alive && !enemy.escaped && !enemy._deathHandled) {
        enemy._deathHandled = true;
        // Create death particle effect
        const def = ENEMY_TYPES[enemy.type];
        this.effects.addDeathEffect(enemy.x, enemy.y, def.color);
        if (this.onEnemyKilled) this.onEnemyKilled(enemy);
      }
    }

    // ── Cleanup Dead Enemies ──
    this.enemies = this.enemies.filter(e => e.alive);

    // ── Update Visual Effects ──
    this.effects.update(dt);

    // ── Check if Wave is Cleared ──
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.waveCleared = true;
      this.betweenWaveTimer = this.betweenWaveDuration;
      if (this.onWaveCleared) this.onWaveCleared(this.waveNumber);
    }
  }

  /**
   * EARLY SEND — Skip the wait timer and start the next wave now.
   * Rewards the player with bonus cash ($5 per second skipped).
   * Returns the bonus amount, or 0 if can't send early.
   */
  sendEarly() {
    if (this.waveActive || !this.waveCleared) return 0;

    // First click starts the game (no bonus for that)
    if (this.waitingForPlayer) {
      this.waitingForPlayer = false;
      this.betweenWaveTimer = 0;
      return 0;
    }

    const timeLeft = this.betweenWaveTimer;
    if (timeLeft <= 1) return 0; // Too close to auto-start, no bonus

    const bonus = Math.round(timeLeft * 5);
    this.betweenWaveTimer = 0; // This will trigger startNextWave on next update
    return bonus;
  }

  /** Start the next wave — generate enemies and begin spawning */
  startNextWave() {
    this.waveNumber++;
    this.waveActive = true;
    this.waveCleared = false;
    this.spawnQueue = this.generateWave(this.waveNumber);
    this.spawnTimer = 0;
    if (this.onWaveStart) this.onWaveStart(this.waveNumber);
  }

  /**
   * WAVE GENERATION — Decides what enemies appear in each wave.
   *
   * Phase 1 (Waves 1-5): Introduction
   *   Each wave showcases a single enemy type so the player learns them.
   *   Wave 1: Grunts, Wave 2: Runners, Wave 3: Tanks, Wave 4: Swarm, Wave 5: Boss
   *
   * Phase 2 (Waves 6+): Mixed
   *   Random combinations of all types. Boss every 10 waves.
   *   Enemy count increases each wave.
   *
   * All enemies get HP scaling: base HP × 1.08^waveNumber
   * This is exponential — by wave 20, enemies have ~4.7x their base HP.
   * Speed also scales slightly after wave 15.
   */
  generateWave(waveNum) {
    const queue = [];
    const pfRatio = this.getPathfinderRatio(waveNum);
    const hpMultiplier = Math.pow(1.15, waveNum); // Exponential HP scaling (steeper curve)
    const speedMultiplier = waveNum > 8 ? 1 + (waveNum - 8) * 0.015 : 1; // Speed ramps earlier

    if (waveNum <= 5) {
      // ── Introduction Waves ──
      let type, count;
      switch (waveNum) {
        case 1: type = 'grunt'; count = 10; break;
        case 2: type = 'runner'; count = 12; break;
        case 3: type = 'tank'; count = 5; break;
        case 4: type = 'swarm'; count = 25; break;
        case 5: type = 'boss'; count = 1; break;
      }
      for (let i = 0; i < count; i++) {
        const def = ENEMY_TYPES[type];
        queue.push({
          type,
          hp: Math.round(def.hp * hpMultiplier),
          speed: def.speed * speedMultiplier,
          isPathfinder: Math.random() < pfRatio, // Randomly decide pathfinder vs wanderer
        });
      }
    } else {
      // ── Mixed Waves ──
      const types = ['grunt', 'runner', 'tank', 'swarm'];
      const count = 12 + waveNum * 3; // More enemies each wave (ramps harder)

      // Boss every 10 waves (always a pathfinder, extra HP)
      if (waveNum % 10 === 0) {
        const bossDef = ENEMY_TYPES.boss;
        queue.push({
          type: 'boss',
          hp: Math.round(bossDef.hp * hpMultiplier * 1.5),
          speed: bossDef.speed * speedMultiplier,
          isPathfinder: true, // Bosses always know the optimal path
        });
      }

      for (let i = 0; i < count; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        const def = ENEMY_TYPES[t];
        queue.push({
          type: t,
          hp: Math.round(def.hp * hpMultiplier),
          speed: def.speed * speedMultiplier,
          isPathfinder: Math.random() < pfRatio,
        });
      }
    }

    return queue;
  }

  /**
   * Spawn a single enemy at a random column along the top edge.
   * Pathfinders get a pre-calculated A* path.
   * Wanderers just start at the top and figure it out.
   */
  spawnEnemy(data) {
    const spawnCol = Math.floor(Math.random() * this.grid.cols);
    const enemy = new Enemy(spawnCol, 0, data.hp, data.speed, data.type, data.isPathfinder);

    if (data.isPathfinder) {
      // Calculate the optimal path from spawn to exit
      const path = this.grid.findPath(spawnCol, 0, null);
      if (path) {
        enemy.setPath(path);
        this.enemies.push(enemy);
      } else {
        // Fallback: try from the center column
        const centerPath = this.grid.findPath(Math.floor(this.grid.cols / 2), 0, null);
        if (centerPath) {
          enemy.x = centerPath[0].col;
          enemy.y = centerPath[0].row;
          enemy.setPath(centerPath);
          this.enemies.push(enemy);
        }
      }
    } else {
      // Wanderers don't need a full path — they'll decide each step
      enemy.x = spawnCol;
      enemy.y = 0;
      enemy.path = [{ col: spawnCol, row: 0 }, { col: spawnCol, row: 1 }];
      enemy.pathIndex = 0;
      this.enemies.push(enemy);
    }
  }

  /**
   * Recalculate paths for all living PATHFINDER enemies.
   * Called when the player places a new bunker (the maze changed).
   * Wanderers don't need this — they navigate reactively.
   */
  recalculatePaths() {
    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.isPathfinder) continue;
      const currentCol = Math.round(enemy.x);
      const currentRow = Math.round(enemy.y);
      const path = this.grid.findPath(currentCol, currentRow, null);
      if (path) {
        enemy.path = path;
        enemy.pathIndex = 0;
      }
    }
  }

  /** Get seconds until next wave (0 if wave is active) */
  getTimeUntilNextWave() {
    if (this.waveActive) return 0;
    return Math.max(0, this.betweenWaveTimer);
  }

  /** Get total enemies remaining (on field + in spawn queue) */
  getEnemiesRemaining() {
    return this.enemies.filter(e => e.alive).length + this.spawnQueue.length;
  }
}
