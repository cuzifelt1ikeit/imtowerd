// Bunker and unit system for Impossible Tower Defense

// Unit type definitions
export const UNIT_TYPES = {
  machinegun: {
    name: 'Machine Gun',
    shortName: 'MG',
    cost: 30,
    damage: 5,
    fireRate: 6,      // shots per second
    range: 2.5,        // cells
    color: '#3498db',
    splash: false,
    dot: false,
    coneAngle: 0,
  },
  shotgun: {
    name: 'Shotgun',
    shortName: 'SG',
    cost: 45,
    damage: 12,
    fireRate: 2,
    range: 2.0,
    color: '#f39c12',
    splash: true,
    splashRadius: 0.8,
    dot: false,
    coneAngle: 0,
  },
  flamethrower: {
    name: 'Flamethrower',
    shortName: 'FT',
    cost: 60,
    damage: 8,
    fireRate: 4,
    range: 1.5,
    color: '#e74c3c',
    splash: true,
    splashRadius: 1.0,
    dot: true,
    dotDamage: 3,
    dotDuration: 2,  // seconds
    coneAngle: 0,
  },
  sniper: {
    name: 'Sniper',
    shortName: 'SN',
    cost: 50,
    damage: 40,
    fireRate: 0.8,
    range: 4.0,
    color: '#2ecc71',
    splash: false,
    dot: false,
    coneAngle: 0,
  },
};

export class Unit {
  constructor(type) {
    const def = UNIT_TYPES[type];
    this.type = type;
    this.damage = def.damage;
    this.fireRate = def.fireRate;
    this.range = def.range;
    this.tier = 1;
    this.fireCooldown = 0;
  }

  update(dt) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  canFire() {
    return this.fireCooldown <= 0;
  }

  fire() {
    this.fireCooldown = 1 / this.fireRate;
  }
}

export class Bunker {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.units = [];       // Array of Unit objects
    this.maxUnits = 4;
  }

  addUnit(type) {
    if (this.units.length >= this.maxUnits) return false;
    this.units.push(new Unit(type));
    return true;
  }

  getMaxRange() {
    let maxRange = 0;
    for (const unit of this.units) {
      if (unit.range > maxRange) maxRange = unit.range;
    }
    return maxRange;
  }

  update(dt, enemies, projectiles) {
    for (const unit of this.units) {
      unit.update(dt);

      if (!unit.canFire()) continue;

      // Find closest enemy in range
      const def = UNIT_TYPES[unit.type];
      let closestEnemy = null;
      let closestDist = Infinity;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - this.col;
        const dy = enemy.y - this.row;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= unit.range && dist < closestDist) {
          closestDist = dist;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        unit.fire();

        // Apply damage
        if (def.splash) {
          // Splash damage to all enemies in splash radius around target
          for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx = enemy.x - closestEnemy.x;
            const dy = enemy.y - closestEnemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= def.splashRadius) {
              enemy.takeDamage(unit.damage);
              if (def.dot) {
                enemy.applyDot(def.dotDamage, def.dotDuration);
              }
            }
          }
        } else {
          closestEnemy.takeDamage(unit.damage);
        }

        // Create projectile visual
        projectiles.push({
          fromX: this.col,
          fromY: this.row,
          toX: closestEnemy.x,
          toY: closestEnemy.y,
          color: def.color,
          life: 0.15,
          splash: def.splash,
          splashRadius: def.splashRadius || 0,
        });
      }
    }
  }
}

export class BunkerManager {
  constructor() {
    this.bunkers = {};  // key: "col,row" -> Bunker
    this.projectiles = [];
  }

  addBunker(col, row) {
    const key = `${col},${row}`;
    if (!this.bunkers[key]) {
      this.bunkers[key] = new Bunker(col, row);
    }
    return this.bunkers[key];
  }

  getBunker(col, row) {
    return this.bunkers[`${col},${row}`] || null;
  }

  update(dt, enemies) {
    // Update all bunkers
    for (const key in this.bunkers) {
      this.bunkers[key].update(dt, enemies, this.projectiles);
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].life -= dt;
      if (this.projectiles[i].life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  getAllBunkers() {
    return Object.values(this.bunkers);
  }
}
