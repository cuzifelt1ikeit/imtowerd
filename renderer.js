/**
 * RENDERER.JS — 2D Canvas Rendering
 *
 * This file draws everything you see on screen:
 * - The grid (cells, spawn zone, exit zone)
 * - Bunkers and their garrisoned unit indicators
 * - The A* path visualization (green line)
 * - Enemies (colored circles with HP bars)
 * - Projectile lines when bunkers fire
 * - Death particles and damage numbers
 * - Build mode hover highlights
 * - Scroll position and scroll indicator
 *
 * Uses the HTML5 Canvas API — a 2D drawing surface where you
 * draw shapes, lines, and text using JavaScript commands.
 *
 * The draw() method is called every frame (~60 times/second)
 * and redraws the entire screen from scratch each time.
 * This is standard for game rendering — it's called "immediate mode."
 */

import { CELL_EMPTY, CELL_BUNKER, CELL_SPAWN, CELL_EXIT } from './grid.js';
import { ENEMY_TYPES } from './enemies.js';
import { UNIT_TYPES } from './bunkers.js';

const COLORS = {
  background: '#000000',
  gridLine: '#0a2a4a',
  empty: '#050510',
  bunker: '#1a1a2a',
  bunkerBorder: '#00ffff',
  spawn: '#001a00',
  spawnBorder: '#00ff41',
  exit: '#1a0000',
  exitBorder: '#ff0040',
  path: 'rgba(0, 255, 65, 0.12)',
  pathLine: 'rgba(0, 255, 65, 0.7)',
  validPlace: 'rgba(0, 255, 65, 0.25)',
  invalidPlace: 'rgba(255, 0, 64, 0.25)',
  hover: 'rgba(0, 255, 255, 0.15)',
  hpBarBg: 'rgba(0, 0, 0, 0.7)',
  hpBarFill: '#00ff41',
  hpBarLow: '#ff0040',
};

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = grid;

    // Cell size in pixels
    this.cellSize = 48;
    this.padding = 2;

    // Scroll offset (vertical)
    this.scrollY = 0;
    this.maxScrollY = 0;

    // Hover state
    this.hoverCol = -1;
    this.hoverRow = -1;

    // Build mode
    this.buildMode = false;

    // Current path to display
    this.currentPath = null;

    // Enemies reference
    this.enemies = [];

    // Effects manager reference
    this.effects = null;

    // Bunker manager reference
    this.bunkerManager = null;

    // Selected bunker for info display
    this.selectedBunker = null;

    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    // Account for fixed bottom bar overlapping the canvas
    const bottomBar = document.getElementById('bottom-bar');
    const barHeight = bottomBar ? bottomBar.offsetHeight : 0;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.viewWidth = rect.width;
    this.viewHeight = rect.height - barHeight;

    // Calculate cell size to fit grid width with some margin
    const margin = 16;
    this.cellSize = Math.floor((this.viewWidth - margin * 2) / this.grid.cols);

    // Grid pixel dimensions
    this.gridPixelWidth = this.cellSize * this.grid.cols;
    this.gridPixelHeight = this.cellSize * this.grid.rows;

    // Center horizontally
    this.offsetX = Math.floor((this.viewWidth - this.gridPixelWidth) / 2);

    // Max scroll
    this.maxScrollY = Math.max(0, this.gridPixelHeight - this.viewHeight + 20);
  }

  // Convert screen coords to grid coords
  screenToGrid(screenX, screenY) {
    const gridX = screenX - this.offsetX;
    const gridY = screenY + this.scrollY;

    const col = Math.floor(gridX / this.cellSize);
    const row = Math.floor(gridY / this.cellSize);

    if (col < 0 || col >= this.grid.cols || row < 0 || row >= this.grid.rows) {
      return null;
    }

    return { col, row };
  }

  setHover(col, row) {
    this.hoverCol = col;
    this.hoverRow = row;
  }

  clearHover() {
    this.hoverCol = -1;
    this.hoverRow = -1;
  }

  scroll(deltaY) {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY + deltaY));
  }

  draw() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const p = this.padding;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    ctx.save();
    ctx.translate(0, -this.scrollY);

    // Draw cells
    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.cols; c++) {
        const x = this.offsetX + c * cs;
        const y = r * cs;

        // Skip if off screen
        if (y + cs < this.scrollY - cs || y > this.scrollY + this.viewHeight + cs) continue;

        const cell = this.grid.getCell(c, r);

        // Cell background
        let fillColor, borderColor;
        switch (cell) {
          case CELL_SPAWN:
            fillColor = COLORS.spawn;
            borderColor = COLORS.spawnBorder;
            break;
          case CELL_EXIT:
            fillColor = COLORS.exit;
            borderColor = COLORS.exitBorder;
            break;
          case CELL_BUNKER:
            fillColor = COLORS.bunker;
            borderColor = COLORS.bunkerBorder;
            break;
          default:
            fillColor = COLORS.empty;
            borderColor = COLORS.gridLine;
        }

        // Fill cell
        ctx.fillStyle = fillColor;
        ctx.fillRect(x + p, y + p, cs - p * 2, cs - p * 2);

        // Border — neon glow for bunkers, spawn, exit
        if (cell === CELL_BUNKER || cell === CELL_SPAWN || cell === CELL_EXIT) {
          ctx.shadowColor = borderColor;
          ctx.shadowBlur = 8;
        }
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + p, y + p, cs - p * 2, cs - p * 2);
        ctx.shadowBlur = 0;

        // Spawn label
        if (cell === CELL_SPAWN && r === 0) {
          ctx.fillStyle = '#00ff41';
          ctx.shadowColor = '#00ff41';
          ctx.shadowBlur = 6;
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('▼', x + cs / 2, y + cs / 2 + 4);
          ctx.shadowBlur = 0;
        }

        // Exit label
        if (cell === CELL_EXIT) {
          ctx.fillStyle = '#ff0040';
          ctx.shadowColor = '#ff0040';
          ctx.shadowBlur = 6;
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✕', x + cs / 2, y + cs / 2 + 4);
          ctx.shadowBlur = 0;
        }
      }
    }

    // Draw path
    if (this.currentPath && this.currentPath.length > 1) {
      // Path cells highlight
      for (const node of this.currentPath) {
        const x = this.offsetX + node.col * cs;
        const y = node.row * cs;
        ctx.fillStyle = COLORS.path;
        ctx.fillRect(x + p, y + p, cs - p * 2, cs - p * 2);
      }

      // Path line — neon glow
      ctx.beginPath();
      ctx.strokeStyle = COLORS.pathLine;
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let i = 0; i < this.currentPath.length; i++) {
        const px = this.offsetX + this.currentPath[i].col * cs + cs / 2;
        const py = this.currentPath[i].row * cs + cs / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw unit indicators on bunkers
    if (this.bunkerManager) {
      for (const bunker of this.bunkerManager.getAllBunkers()) {
        const bx = this.offsetX + bunker.col * cs;
        const by = bunker.row * cs;

        if (by + cs < this.scrollY - cs || by > this.scrollY + this.viewHeight + cs) continue;

        const units = bunker.units;
        if (units.length === 0) continue;

        // Draw unit dots in a 2x2 grid inside the bunker
        const positions = [
          [0.3, 0.3], [0.7, 0.3],
          [0.3, 0.7], [0.7, 0.7],
        ];

        for (let i = 0; i < units.length; i++) {
          const [px, py] = positions[i];
          const ux = bx + px * cs;
          const uy = by + py * cs;
          const unitDef = UNIT_TYPES[units[i].type];

          ctx.beginPath();
          ctx.arc(ux, uy, cs * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = unitDef.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Colored border based on garrison
        if (units.length > 0) {
          const primaryColor = UNIT_TYPES[units[0].type].color;
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx + 1, by + 1, cs - 2, cs - 2);
        }
      }

      // Draw range circle for selected bunker
      if (this.selectedBunker && this.selectedBunker.units.length > 0) {
        const range = this.selectedBunker.getMaxRange();
        const sx = this.offsetX + this.selectedBunker.col * cs + cs / 2;
        const sy = this.selectedBunker.row * cs + cs / 2;

        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, range * cs, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
      }
    }

    // Hover highlight
    if (this.hoverCol >= 0 && this.hoverRow >= 0 && this.buildMode) {
      const x = this.offsetX + this.hoverCol * cs;
      const y = this.hoverRow * cs;
      const canPlace = this.grid.canPlace(this.hoverCol, this.hoverRow);

      ctx.fillStyle = canPlace ? COLORS.validPlace : COLORS.invalidPlace;
      ctx.fillRect(x + p, y + p, cs - p * 2, cs - p * 2);
    }

    // Draw enemies
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const ex = this.offsetX + enemy.x * cs + cs / 2;
      const ey = enemy.y * cs + cs / 2;

      if (ey + cs < this.scrollY - cs || ey - cs > this.scrollY + this.viewHeight + cs) continue;

      const typeDef = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.grunt;
      const radius = (cs * typeDef.size) / 2;

      // Hit flash — white overlay
      if (enemy.hitFlash > 0) {
        ctx.beginPath();
        ctx.arc(ex, ey, radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${enemy.hitFlash * 8})`;
        ctx.fill();
      }

      // Enemy body — neon glow
      const enemyColor = enemy.hitFlash > 0 ? '#ffffff' : typeDef.color;
      ctx.shadowColor = enemyColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.fillStyle = enemyColor;
      ctx.fill();
      ctx.strokeStyle = enemyColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Burn indicator (DOT active)
      if (enemy.dots.length > 0) {
        ctx.beginPath();
        ctx.arc(ex, ey, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 100, 0, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Wanderer indicator removed — clean look

      // HP bar
      const barWidth = cs * 0.8;
      const barHeight = 4;
      const barX = ex - barWidth / 2;
      const barY = ey - radius - 8;
      const hpRatio = enemy.hp / enemy.maxHp;

      ctx.fillStyle = COLORS.hpBarBg;
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = hpRatio > 0.3 ? COLORS.hpBarFill : COLORS.hpBarLow;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    }

    // Draw death particles
    if (this.effects) {
      for (const p of this.effects.particles) {
        const px = this.offsetX + p.x * cs + cs / 2;
        const py = p.y * cs + cs / 2;
        const alpha = p.life / p.maxLife;

        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, p.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // Damage numbers
      for (const d of this.effects.damageNumbers) {
        const dx = this.offsetX + d.x * cs + cs / 2;
        const dy = d.y * cs + cs / 2;
        const alpha = d.life / d.maxLife;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff0040';
        ctx.shadowColor = '#ff0040';
        ctx.shadowBlur = 6;
        ctx.font = `bold ${Math.max(10, cs * 0.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(d.text, dx, dy);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }

    // Draw projectiles — each weapon type has a distinct visual
    if (this.bunkerManager) {
      for (const proj of this.bunkerManager.projectiles) {
        const fx = this.offsetX + proj.fromX * cs + cs / 2;
        const fy = proj.fromY * cs + cs / 2;
        const tx = this.offsetX + proj.toX * cs + cs / 2;
        const ty = proj.toY * cs + cs / 2;
        const alpha = Math.min(1, proj.life / 0.08);

        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 10;

        if (proj.unitType === 'machinegun') {
          // MG: Rapid thin tracer lines with slight spread
          const spread = (Math.random() - 0.5) * cs * 0.15;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(tx + spread, ty + spread);
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = alpha;
          ctx.stroke();
          // Small spark at impact
          ctx.beginPath();
          ctx.arc(tx + spread, ty + spread, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.globalAlpha = 1;

        } else if (proj.unitType === 'shotgun') {
          // SG: Fan of 4 short thick lines in a cone
          const angle = Math.atan2(ty - fy, tx - fx);
          const spreadAngle = 0.4; // ~23 degrees each side
          const dist = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2);
          ctx.globalAlpha = alpha;
          for (let i = 0; i < 4; i++) {
            const a = angle + (i - 1.5) * (spreadAngle / 2);
            const len = dist * (0.7 + Math.random() * 0.3);
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(a) * len, fy + Math.sin(a) * len);
            ctx.strokeStyle = proj.color;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          // Shockwave circle at impact
          ctx.beginPath();
          ctx.arc(tx, ty, cs * 0.2 * (1 - alpha + 0.3), 0, Math.PI * 2);
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;

        } else if (proj.unitType === 'flamethrower') {
          // FT: Cone-shaped particle wash, no lines
          const angle = Math.atan2(ty - fy, tx - fx);
          const dist = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2);
          ctx.globalAlpha = alpha * 0.6;
          // Draw 6 flame particles in a cone
          for (let i = 0; i < 6; i++) {
            const spread = (Math.random() - 0.5) * 0.8;
            const a = angle + spread;
            const d = dist * (0.3 + Math.random() * 0.7);
            const px = fx + Math.cos(a) * d;
            const py = fy + Math.sin(a) * d;
            const r = cs * (0.06 + Math.random() * 0.1);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            // Gradient from orange core to red edge
            ctx.fillStyle = Math.random() > 0.5 ? proj.color : '#ff6600';
            ctx.fill();
          }
          // Burn glow on ground at target
          if (proj.splash && proj.splashRadius > 0) {
            ctx.beginPath();
            ctx.arc(tx, ty, proj.splashRadius * cs * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 80, 0, 0.15)';
            ctx.fill();
          }
          ctx.globalAlpha = 1;

        } else if (proj.unitType === 'sniper') {
          // SN: Single bright thin line that lingers, flash at impact
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = alpha;
          ctx.stroke();
          // Bright flash at impact point
          const flashAlpha = Math.min(1, proj.life / 0.15);
          ctx.beginPath();
          ctx.arc(tx, ty, cs * 0.15 * flashAlpha, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = flashAlpha * 0.8;
          ctx.fill();
          // Outer glow ring
          ctx.beginPath();
          ctx.arc(tx, ty, cs * 0.25 * flashAlpha, 0, Math.PI * 2);
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = flashAlpha * 0.4;
          ctx.stroke();
          ctx.globalAlpha = 1;

        } else {
          // Fallback: simple line
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = alpha;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();

    // Scroll indicator
    if (this.maxScrollY > 0) {
      const scrollRatio = this.scrollY / this.maxScrollY;
      const barHeight = Math.max(30, (this.viewHeight / this.gridPixelHeight) * this.viewHeight);
      const barY = scrollRatio * (this.viewHeight - barHeight);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(this.viewWidth - 6, barY, 4, barHeight);
    }
  }
}
