// Enemy system for Impossible Tower Defense

export class Enemy {
  constructor(col, row, hp, speed, type = 'grunt', isPathfinder = true) {
    this.col = col;
    this.row = row;
    this.x = col;
    this.y = row;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.type = type;
    this.alive = true;
    this.escaped = false;
    this.path = [];
    this.pathIndex = 0;
    this.dots = [];
    this.isPathfinder = isPathfinder;

    // Visual effects
    this.hitFlash = 0;       // flash timer when hit
    this.deathParticles = null;

    // Wanderer state
    this.wanderBias = 0.7;   // probability of moving toward exit vs random
    this.lastDir = null;     // avoid backtracking
    this.wanderTimer = 0;
    this.wanderInterval = 0.3; // seconds between direction changes
  }

  setPath(path) {
    this.path = path;
    this.pathIndex = 0;
    if (path && path.length > 0) {
      this.x = path[0].col;
      this.y = path[0].row;
    }
  }

  update(dt, grid) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.dots.length > 0) this.updateDots(dt);

    if (!this.alive) return;

    if (this.isPathfinder) {
      this.updatePathfinder(dt);
    } else {
      this.updateWanderer(dt, grid);
    }
  }

  updatePathfinder(dt) {
    if (!this.path || this.pathIndex >= this.path.length - 1) {
      if (this.alive && this.path && this.pathIndex >= this.path.length - 1) {
        this.escaped = true;
        this.alive = false;
      }
      return;
    }

    const target = this.path[this.pathIndex + 1];
    const dx = target.col - this.x;
    const dy = target.row - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) {
      this.x = target.col;
      this.y = target.row;
      this.col = target.col;
      this.row = target.row;
      this.pathIndex++;
    } else {
      const moveAmount = this.speed * dt;
      this.x += (dx / dist) * moveAmount;
      this.y += (dy / dist) * moveAmount;
      this.col = Math.round(this.x);
      this.row = Math.round(this.y);
    }
  }

  updateWanderer(dt, grid) {
    if (!grid) { this.updatePathfinder(dt); return; }

    const exitRow = grid.rows - 1;

    // Check if reached exit row
    if (Math.round(this.y) >= exitRow) {
      this.escaped = true;
      this.alive = false;
      return;
    }

    this.wanderTimer -= dt;
    if (this.wanderTimer > 0 && this.path && this.pathIndex < this.path.length - 1) {
      // Keep moving toward current waypoint
      this.updatePathfinder(dt);
      return;
    }

    this.wanderTimer = this.wanderInterval + Math.random() * 0.2;

    // Pick next cell: biased toward exit but with randomness
    const curCol = Math.round(this.x);
    const curRow = Math.round(this.y);

    // Possible moves (4-directional)
    const moves = [
      { col: curCol, row: curRow + 1 },     // down (toward exit)
      { col: curCol - 1, row: curRow },      // left
      { col: curCol + 1, row: curRow },      // right
      { col: curCol, row: curRow - 1 },      // up (away from exit)
    ];

    // Filter valid moves
    const validMoves = moves.filter(m => {
      if (m.col < 0 || m.col >= grid.cols || m.row < 0 || m.row >= grid.rows) return false;
      const cell = grid.getCell(m.col, m.row);
      if (cell === 1) return false; // CELL_BUNKER
      // Avoid backtracking (don't go back where we came from)
      if (this.lastDir && m.col === this.lastDir.col && m.row === this.lastDir.row) return false;
      return true;
    });

    if (validMoves.length === 0) {
      // Stuck — allow backtracking
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

    // Weight moves: down is heavily favored, sideways moderate, up rare
    const weighted = [];
    for (const m of validMoves) {
      let weight = 1;
      if (m.row > curRow) weight = 10;       // down — strong bias
      else if (m.row === curRow) weight = 3;  // sideways
      else weight = 0.5;                       // up — rare

      for (let i = 0; i < weight * 10; i++) weighted.push(m);
    }

    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    this.setWanderTarget(pick, curCol, curRow);
  }

  setWanderTarget(target, fromCol, fromRow) {
    this.lastDir = { col: fromCol, row: fromRow };
    this.path = [
      { col: fromCol, row: fromRow },
      { col: target.col, row: target.row },
    ];
    this.pathIndex = 0;
    this.x = fromCol;
    this.y = fromRow;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  applyDot(dps, duration) {
    this.dots.push({ dps, remaining: duration });
  }

  updateDots(dt) {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const dot = this.dots[i];
      this.hp -= dot.dps * dt;
      dot.remaining -= dt;
      if (dot.remaining <= 0) this.dots.splice(i, 1);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }
}

// Enemy type definitions
export const ENEMY_TYPES = {
  grunt:  { hp: 50,  speed: 1.5, color: '#e74c3c', size: 0.6 },
  runner: { hp: 25,  speed: 3.0, color: '#f39c12', size: 0.45 },
  tank:   { hp: 200, speed: 0.8, color: '#8e44ad', size: 0.8 },
  swarm:  { hp: 15,  speed: 2.0, color: '#e67e22', size: 0.35 },
  boss:   { hp: 500, speed: 0.6, color: '#c0392b', size: 0.95 },
};

// Visual effects manager
export class EffectsManager {
  constructor() {
    this.particles = [];
    this.damageNumbers = [];
  }

  addDeathEffect(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.5,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  }

  addDamageNumber(x, y, amount) {
    this.damageNumbers.push({
      x, y,
      text: `-${Math.round(amount)}`,
      life: 0.6,
      maxLife: 0.6,
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.y -= dt * 1.5; // float upward
      d.life -= dt;
      if (d.life <= 0) this.damageNumbers.splice(i, 1);
    }
  }
}

export class WaveManager {
  constructor(grid) {
    this.grid = grid;
    this.enemies = [];
    this.waveNumber = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.4;
    this.betweenWaveTimer = 10;
    this.betweenWaveDuration = 15;
    this.waveCleared = true;

    // Callbacks
    this.onEnemyEscaped = null;
    this.onEnemyKilled = null;
    this.onWaveStart = null;
    this.onWaveCleared = null;

    // Effects
    this.effects = new EffectsManager();
  }

  // Get pathfinder ratio for this wave (0-1)
  getPathfinderRatio(waveNum) {
    // Wave 1-5: 10%, ramps up gradually
    // Wave 10: ~30%, Wave 20: ~55%, Wave 30+: ~75%, caps at 85%
    const ratio = 0.1 + (waveNum - 1) * 0.025;
    return Math.min(0.85, ratio);
  }

  update(dt) {
    if (!this.waveActive && this.waveCleared) {
      this.betweenWaveTimer -= dt;
      if (this.betweenWaveTimer <= 0) {
        this.startNextWave();
      }
    }

    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = this.spawnInterval;
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.update(dt, this.grid);

      if (enemy.escaped) {
        if (this.onEnemyEscaped) this.onEnemyEscaped(enemy);
      }
    }

    // Handle kills
    for (const enemy of this.enemies) {
      if (!enemy.alive && !enemy.escaped && !enemy._deathHandled) {
        enemy._deathHandled = true;
        // Death effect
        const def = ENEMY_TYPES[enemy.type];
        this.effects.addDeathEffect(enemy.x, enemy.y, def.color);
        if (this.onEnemyKilled) this.onEnemyKilled(enemy);
      }
    }

    this.enemies = this.enemies.filter(e => e.alive);
    this.effects.update(dt);

    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.waveCleared = true;
      this.betweenWaveTimer = this.betweenWaveDuration;
      if (this.onWaveCleared) this.onWaveCleared(this.waveNumber);
    }
  }

  // Send next wave early for bonus cash
  sendEarly() {
    if (this.waveActive || !this.waveCleared) return 0;
    const timeLeft = this.betweenWaveTimer;
    if (timeLeft <= 1) return 0; // too close, no bonus

    const bonus = Math.round(timeLeft * 5); // $5 per second remaining
    this.betweenWaveTimer = 0;
    return bonus;
  }

  startNextWave() {
    this.waveNumber++;
    this.waveActive = true;
    this.waveCleared = false;
    this.spawnQueue = this.generateWave(this.waveNumber);
    this.spawnTimer = 0;
    if (this.onWaveStart) this.onWaveStart(this.waveNumber);
  }

  generateWave(waveNum) {
    const queue = [];
    const pfRatio = this.getPathfinderRatio(waveNum);
    const hpMultiplier = Math.pow(1.08, waveNum);

    // Speed also scales slightly after wave 15
    const speedMultiplier = waveNum > 15 ? 1 + (waveNum - 15) * 0.01 : 1;

    if (waveNum <= 5) {
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
          isPathfinder: Math.random() < pfRatio,
        });
      }
    } else {
      const types = ['grunt', 'runner', 'tank', 'swarm'];
      const count = 10 + waveNum * 2;

      // Boss every 10 waves
      if (waveNum % 10 === 0) {
        const bossDef = ENEMY_TYPES.boss;
        queue.push({
          type: 'boss',
          hp: Math.round(bossDef.hp * hpMultiplier * 1.5),
          speed: bossDef.speed * speedMultiplier,
          isPathfinder: true, // bosses always know the way
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

  spawnEnemy(data) {
    const spawnCol = Math.floor(Math.random() * this.grid.cols);
    const enemy = new Enemy(spawnCol, 0, data.hp, data.speed, data.type, data.isPathfinder);

    if (data.isPathfinder) {
      const path = this.grid.findPath(spawnCol, 0, null);
      if (path) {
        enemy.setPath(path);
        this.enemies.push(enemy);
      } else {
        const centerPath = this.grid.findPath(Math.floor(this.grid.cols / 2), 0, null);
        if (centerPath) {
          enemy.x = centerPath[0].col;
          enemy.y = centerPath[0].row;
          enemy.setPath(centerPath);
          this.enemies.push(enemy);
        }
      }
    } else {
      // Wanderer — just place at spawn, they'll figure it out
      enemy.x = spawnCol;
      enemy.y = 0;
      enemy.path = [{ col: spawnCol, row: 0 }, { col: spawnCol, row: 1 }];
      enemy.pathIndex = 0;
      this.enemies.push(enemy);
    }
  }

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

  getTimeUntilNextWave() {
    if (this.waveActive) return 0;
    return Math.max(0, this.betweenWaveTimer);
  }

  getEnemiesRemaining() {
    return this.enemies.filter(e => e.alive).length + this.spawnQueue.length;
  }
}
