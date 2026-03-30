// Enemy system for Impossible Tower Defense

export class Enemy {
  constructor(col, row, hp, speed, type = 'grunt') {
    this.col = col;
    this.row = row;
    this.x = col;  // Smooth position (float)
    this.y = row;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed; // cells per second
    this.type = type;
    this.alive = true;
    this.escaped = false;
    this.path = [];
    this.pathIndex = 0;
    this.dots = []; // {dps, remaining}
  }

  setPath(path) {
    this.path = path;
    this.pathIndex = 0;
    if (path && path.length > 0) {
      this.x = path[0].col;
      this.y = path[0].row;
    }
  }

  update(dt) {
    // Process DOTs
    if (this.dots.length > 0) this.updateDots(dt);

    if (!this.alive || !this.path || this.pathIndex >= this.path.length - 1) {
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

  takeDamage(amount) {
    this.hp -= amount;
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
      this.takeDamage(dot.dps * dt);
      dot.remaining -= dt;
      if (dot.remaining <= 0) {
        this.dots.splice(i, 1);
      }
    }
  }
}

// Enemy type definitions
export const ENEMY_TYPES = {
  grunt: { hp: 50, speed: 1.5, color: '#e74c3c', size: 0.6 },
  runner: { hp: 25, speed: 3.0, color: '#f39c12', size: 0.45 },
  tank: { hp: 200, speed: 0.8, color: '#8e44ad', size: 0.8 },
  swarm: { hp: 15, speed: 2.0, color: '#e67e22', size: 0.35 },
  boss: { hp: 500, speed: 0.6, color: '#c0392b', size: 0.95 },
};

export class WaveManager {
  constructor(grid) {
    this.grid = grid;
    this.enemies = [];
    this.waveNumber = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.4; // seconds between spawns
    this.betweenWaveTimer = 10; // seconds before first wave
    this.betweenWaveDuration = 15; // seconds between waves
    this.waveCleared = true;

    // Callbacks
    this.onEnemyEscaped = null;
    this.onEnemyKilled = null;
    this.onWaveStart = null;
    this.onWaveCleared = null;
  }

  update(dt) {
    // Between waves countdown
    if (!this.waveActive && this.waveCleared) {
      this.betweenWaveTimer -= dt;
      if (this.betweenWaveTimer <= 0) {
        this.startNextWave();
      }
    }

    // Spawn enemies from queue
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = this.spawnInterval;
      }
    }

    // Update all enemies
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const wasAlive = enemy.alive;
      enemy.update(dt);

      if (enemy.escaped) {
        if (this.onEnemyEscaped) this.onEnemyEscaped(enemy);
      }
    }

    // Check for newly killed enemies (killed by bunker damage)
    for (const enemy of this.enemies) {
      if (!enemy.alive && !enemy.escaped && !enemy._deathHandled) {
        enemy._deathHandled = true;
        if (this.onEnemyKilled) this.onEnemyKilled(enemy);
      }
    }

    // Clean up dead/escaped enemies
    this.enemies = this.enemies.filter(e => e.alive);

    // Check if wave is cleared
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.waveCleared = true;
      this.betweenWaveTimer = this.betweenWaveDuration;
      if (this.onWaveCleared) this.onWaveCleared(this.waveNumber);
    }
  }

  startNextWave() {
    this.waveNumber++;
    this.waveActive = true;
    this.waveCleared = false;

    const waveData = this.generateWave(this.waveNumber);
    this.spawnQueue = waveData;
    this.spawnTimer = 0;

    if (this.onWaveStart) this.onWaveStart(this.waveNumber);
  }

  generateWave(waveNum) {
    const queue = [];

    // Phase 1 (waves 1-5): single types to introduce them
    // Phase 2 (6-15): mixed
    // Phase 3 (16+): chaos
    let type = 'grunt';
    let count = 8 + waveNum * 2;

    if (waveNum <= 5) {
      // Introduction waves
      switch (waveNum) {
        case 1: type = 'grunt'; count = 10; break;
        case 2: type = 'runner'; count = 12; break;
        case 3: type = 'tank'; count = 5; break;
        case 4: type = 'swarm'; count = 25; break;
        case 5: type = 'boss'; count = 1; break;
      }
    }

    // HP scaling: base * (1.08 ^ waveNum)
    const hpMultiplier = Math.pow(1.08, waveNum);

    if (waveNum <= 5) {
      // Single type waves
      for (let i = 0; i < count; i++) {
        const def = ENEMY_TYPES[type];
        queue.push({
          type,
          hp: Math.round(def.hp * hpMultiplier),
          speed: def.speed,
        });
      }
    } else {
      // Mixed waves
      const types = ['grunt', 'runner', 'tank', 'swarm'];
      count = 10 + waveNum * 2;

      // Boss every 10 waves
      if (waveNum % 10 === 0) {
        const bossDef = ENEMY_TYPES.boss;
        queue.push({
          type: 'boss',
          hp: Math.round(bossDef.hp * hpMultiplier),
          speed: bossDef.speed,
        });
      }

      for (let i = 0; i < count; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        const def = ENEMY_TYPES[t];
        queue.push({
          type: t,
          hp: Math.round(def.hp * hpMultiplier),
          speed: def.speed,
        });
      }
    }

    return queue;
  }

  spawnEnemy(data) {
    // Pick a random spawn column
    const spawnCol = Math.floor(Math.random() * this.grid.cols);

    const enemy = new Enemy(spawnCol, 0, data.hp, data.speed, data.type);

    // Find path from this spawn point
    const path = this.grid.findPath(spawnCol, 0, null);
    if (path) {
      enemy.setPath(path);
      this.enemies.push(enemy);
    }
    // If no path from this column, try center
    else {
      const centerPath = this.grid.findPath(Math.floor(this.grid.cols / 2), 0, null);
      if (centerPath) {
        enemy.x = centerPath[0].col;
        enemy.y = centerPath[0].row;
        enemy.setPath(centerPath);
        this.enemies.push(enemy);
      }
    }
  }

  // Recalculate paths for all living enemies (called when player builds)
  recalculatePaths() {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      // Find nearest walkable cell to enemy's current position
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
