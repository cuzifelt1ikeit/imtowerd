/**
 * BUNKERS.JS — Bunker & Unit System
 *
 * This file handles everything about the player's defenses:
 * - What types of units exist and their stats
 * - How bunkers store and manage their garrisoned units
 * - How units target enemies and deal damage
 * - The upgrade system (5 tiers per unit)
 *
 * The bunker is the only building type. It's a shell that holds up to 4 units.
 * The units inside determine what the bunker does.
 */

// ── Unit Type Definitions ────────────────────────────────────────
// Each unit type has base stats that define its behavior.
// These are the "blueprints" — individual units are created from these.
export const UNIT_TYPES = {
  machinegun: {
    name: 'Machine Gun',
    shortName: 'MG',
    cost: 30,            // How much it costs to buy this unit
    damage: 5,           // Damage per hit
    fireRate: 6,         // Shots per second (higher = faster)
    range: 2.5,          // How far it can shoot (in grid cells)
    color: '#3498db',    // Blue — used for visual indicators
    splash: false,       // Does it hit multiple enemies?
    dot: false,          // Does it apply damage over time?
    coneAngle: 0,        // Unused for now (future: shotgun cone width)
  },
  shotgun: {
    name: 'Shotgun',
    shortName: 'SG',
    cost: 45,
    damage: 12,
    fireRate: 2,
    range: 2.0,
    color: '#f39c12',    // Orange
    splash: true,        // Hits enemies near the target
    splashRadius: 0.8,   // How wide the splash area is (in cells)
    dot: false,
    coneAngle: 0,
  },
  flamethrower: {
    name: 'Flamethrower',
    shortName: 'FT',
    cost: 60,
    damage: 8,
    fireRate: 4,
    range: 1.5,          // Short range — must be right next to the path
    color: '#e74c3c',    // Red
    splash: true,
    splashRadius: 1.0,   // Wide splash
    dot: true,           // Applies a burn effect
    dotDamage: 3,        // Burn damage per second
    dotDuration: 2,      // Burn lasts 2 seconds
    coneAngle: 0,
  },
  sniper: {
    name: 'Sniper',
    shortName: 'SN',
    cost: 50,
    damage: 40,          // Massive single-hit damage
    fireRate: 0.8,       // Very slow (less than 1 shot per second)
    range: 4.0,          // Longest range in the game
    color: '#2ecc71',    // Green
    splash: false,       // Single target only
    dot: false,
    coneAngle: 0,
  },
};

// ── Upgrade System ───────────────────────────────────────────────
// Units can be upgraded from Tier 1 to Tier 5.
// Each tier multiplies the base stats by these factors.

export const MAX_TIER = 5;

export const UPGRADE_MULTIPLIERS = {
  //                T1    T2    T3    T4    T5
  damage:   [1,   1.4,  1.9,  2.5,  3.2],   // Damage scales the most
  fireRate: [1,   1.15, 1.3,  1.45, 1.6],   // Fire rate scales moderately
  range:    [1,   1.1,  1.2,  1.3,  1.4],   // Range scales the least
};

/**
 * Calculate how much it costs to upgrade a unit to the next tier.
 *
 * The cost scales with the unit's base cost:
 * - T1 → T2: 1.0x base cost ($30 for MG)
 * - T2 → T3: 1.5x base cost ($45 for MG)
 * - T3 → T4: 2.0x base cost ($60 for MG)
 * - T4 → T5: 2.5x base cost ($75 for MG)
 *
 * @param {string} unitType — The unit type key (e.g., 'machinegun')
 * @param {number} currentTier — The unit's current tier (1-5)
 * @returns {number} — The cost to upgrade, or Infinity if already max tier
 */
export function getUpgradeCost(unitType, currentTier) {
  if (currentTier >= MAX_TIER) return Infinity;
  const baseCost = UNIT_TYPES[unitType].cost;
  const tierCostMultiplier = [0, 1.0, 1.5, 2.0, 2.5]; // Index = current tier
  return Math.round(baseCost * tierCostMultiplier[currentTier]);
}

// ── Unit Class ───────────────────────────────────────────────────
/**
 * A Unit is a single soldier/weapon garrisoned inside a bunker.
 * Each unit has its own stats, tier, and fire cooldown.
 */
export class Unit {
  constructor(type) {
    const def = UNIT_TYPES[type];
    this.type = type;

    // Store base stats (never change — used for upgrade calculations)
    this.baseDamage = def.damage;
    this.baseFireRate = def.fireRate;
    this.baseRange = def.range;

    // Active stats (these change when upgraded)
    this.damage = def.damage;
    this.fireRate = def.fireRate;
    this.range = def.range;

    this.tier = 1;
    this.fireCooldown = 0; // Time until this unit can fire again (seconds)
  }

  /**
   * Upgrade this unit to the next tier.
   * Recalculates all stats based on the tier multipliers.
   * Returns false if already at max tier.
   */
  upgrade() {
    if (this.tier >= MAX_TIER) return false;
    this.tier++;
    const ti = this.tier - 1; // Convert to 0-indexed for the multiplier arrays
    this.damage = Math.round(this.baseDamage * UPGRADE_MULTIPLIERS.damage[ti]);
    this.fireRate = +(this.baseFireRate * UPGRADE_MULTIPLIERS.fireRate[ti]).toFixed(2);
    this.range = +(this.baseRange * UPGRADE_MULTIPLIERS.range[ti]).toFixed(1);
    return true;
  }

  /** Check if this unit can be upgraded further */
  canUpgrade() {
    return this.tier < MAX_TIER;
  }

  /** Calculate DPS (damage per second) = damage × fire rate */
  getDPS() {
    return +(this.damage * this.fireRate).toFixed(1);
  }

  /** Called every frame — counts down the fire cooldown */
  update(dt) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  /** Check if the cooldown has expired and the unit can fire */
  canFire() {
    return this.fireCooldown <= 0;
  }

  /** Fire! Resets the cooldown based on fire rate. */
  fire() {
    this.fireCooldown = 1 / this.fireRate; // Higher fire rate = shorter cooldown
  }
}

// ── Bunker Class ─────────────────────────────────────────────────
/**
 * A Bunker sits on one grid cell and holds up to 4 units.
 * It handles targeting enemies and telling its units to fire.
 */
export class Bunker {
  constructor(col, row) {
    this.col = col;       // Grid column position
    this.row = row;       // Grid row position
    this.units = [];      // Array of Unit objects garrisoned here
    this.maxUnits = 4;    // Maximum garrison size
  }

  /**
   * Add a new unit to this bunker's garrison.
   * Returns false if the bunker is already full.
   */
  addUnit(type) {
    if (this.units.length >= this.maxUnits) return false;
    this.units.push(new Unit(type));
    return true;
  }

  /**
   * Get the maximum range of any unit in this bunker.
   * Used for the range circle display and targeting.
   */
  getMaxRange() {
    let maxRange = 0;
    for (const unit of this.units) {
      if (unit.range > maxRange) maxRange = unit.range;
    }
    return maxRange;
  }

  /**
   * Main update — called every frame.
   * Each unit independently:
   * 1. Counts down its fire cooldown
   * 2. Looks for the closest enemy in range
   * 3. If found and ready to fire → deals damage
   *
   * @param {number} dt — Delta time (seconds since last frame)
   * @param {Array} enemies — All active enemies on the field
   * @param {Array} projectiles — Array to push new projectile visuals into
   */
  update(dt, enemies, projectiles) {
    for (const unit of this.units) {
      // Count down the fire cooldown
      unit.update(dt);

      // Skip if still on cooldown
      if (!unit.canFire()) continue;

      // Get this unit type's definition (for splash, DOT, etc.)
      const def = UNIT_TYPES[unit.type];

      // ── Target Acquisition ──
      // Find the closest living enemy within this unit's range
      let closestEnemy = null;
      let closestDist = Infinity;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;

        // Calculate distance from bunker to enemy using Pythagorean theorem
        // distance = √(dx² + dy²)
        const dx = enemy.x - this.col;
        const dy = enemy.y - this.row;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= unit.range && dist < closestDist) {
          closestDist = dist;
          closestEnemy = enemy;
        }
      }

      // ── Fire! ──
      if (closestEnemy) {
        unit.fire(); // Reset cooldown

        if (def.splash) {
          // Splash damage: hurt ALL enemies within the splash radius of the target
          for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx = enemy.x - closestEnemy.x;
            const dy = enemy.y - closestEnemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= def.splashRadius) {
              enemy.takeDamage(unit.damage);
              // Apply burn DOT if this is a flamethrower
              if (def.dot) {
                enemy.applyDot(def.dotDamage, def.dotDuration);
              }
            }
          }
        } else {
          // Single target: only hit the one enemy
          closestEnemy.takeDamage(unit.damage);
        }

        // Create a visual projectile line (purely cosmetic — damage is instant)
        projectiles.push({
          fromX: this.col,
          fromY: this.row,
          toX: closestEnemy.x,
          toY: closestEnemy.y,
          color: def.color,
          life: 0.15,                       // How long the line stays visible (seconds)
          splash: def.splash,
          splashRadius: def.splashRadius || 0,
        });
      }
    }
  }
}

// ── Bunker Manager ───────────────────────────────────────────────
/**
 * Manages all bunkers on the grid.
 * Stores them in a dictionary keyed by "col,row" for fast lookup.
 * Also manages the projectile visual effects.
 */
export class BunkerManager {
  constructor() {
    this.bunkers = {};      // Key: "col,row" string → Value: Bunker object
    this.projectiles = [];  // Active projectile visuals
  }

  /** Create and register a new bunker at this grid position */
  addBunker(col, row) {
    const key = `${col},${row}`;
    if (!this.bunkers[key]) {
      this.bunkers[key] = new Bunker(col, row);
    }
    return this.bunkers[key];
  }

  /** Look up a bunker at a specific position (returns null if none) */
  getBunker(col, row) {
    return this.bunkers[`${col},${row}`] || null;
  }

  /**
   * Update all bunkers and clean up expired projectile visuals.
   * Called every frame from the main game loop.
   */
  update(dt, enemies) {
    // Let each bunker target and fire
    for (const key in this.bunkers) {
      this.bunkers[key].update(dt, enemies, this.projectiles);
    }

    // Remove projectile visuals that have expired
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].life -= dt;
      if (this.projectiles[i].life <= 0) {
        this.projectiles.splice(i, 1); // Remove from array
      }
    }
  }

  /** Get all bunkers as an array (useful for rendering) */
  getAllBunkers() {
    return Object.values(this.bunkers);
  }
}
