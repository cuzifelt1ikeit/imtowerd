// 2D Canvas renderer for the TD grid

import { CELL_EMPTY, CELL_BUNKER, CELL_SPAWN, CELL_EXIT } from './grid.js';
import { ENEMY_TYPES } from './enemies.js';

const COLORS = {
  background: '#1a1a2e',
  gridLine: '#2a2a4a',
  empty: '#16213e',
  bunker: '#555555',
  bunkerBorder: '#888888',
  spawn: '#1b4332',
  spawnBorder: '#2d6a4f',
  exit: '#4a1525',
  exitBorder: '#7a2540',
  path: 'rgba(76, 175, 80, 0.25)',
  pathLine: 'rgba(76, 175, 80, 0.6)',
  validPlace: 'rgba(76, 175, 80, 0.3)',
  invalidPlace: 'rgba(255, 50, 50, 0.3)',
  hover: 'rgba(255, 255, 255, 0.15)',
  hpBarBg: 'rgba(0, 0, 0, 0.5)',
  hpBarFill: '#2ecc71',
  hpBarLow: '#e74c3c',
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

    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.viewWidth = rect.width;
    this.viewHeight = rect.height;

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

        // Border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + p, y + p, cs - p * 2, cs - p * 2);

        // Spawn label
        if (cell === CELL_SPAWN && r === 0) {
          ctx.fillStyle = '#4CAF50';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('▼', x + cs / 2, y + cs / 2 + 4);
        }

        // Exit label
        if (cell === CELL_EXIT) {
          ctx.fillStyle = '#ff6b6b';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✕', x + cs / 2, y + cs / 2 + 4);
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

      // Path line
      ctx.beginPath();
      ctx.strokeStyle = COLORS.pathLine;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let i = 0; i < this.currentPath.length; i++) {
        const px = this.offsetX + this.currentPath[i].col * cs + cs / 2;
        const py = this.currentPath[i].row * cs + cs / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
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

      // Skip if off screen
      if (ey + cs < this.scrollY - cs || ey - cs > this.scrollY + this.viewHeight + cs) continue;

      const typeDef = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.grunt;
      const radius = (cs * typeDef.size) / 2;

      // Enemy body
      ctx.beginPath();
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.fillStyle = typeDef.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // HP bar
      const barWidth = cs * 0.8;
      const barHeight = 4;
      const barX = ex - barWidth / 2;
      const barY = ey - radius - 8;
      const hpRatio = enemy.hp / enemy.maxHp;

      // Background
      ctx.fillStyle = COLORS.hpBarBg;
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Fill
      ctx.fillStyle = hpRatio > 0.3 ? COLORS.hpBarFill : COLORS.hpBarLow;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
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
