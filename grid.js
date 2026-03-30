// Grid system for Impossible Tower Defense

export const CELL_EMPTY = 0;
export const CELL_BUNKER = 1;
export const CELL_SPAWN = 2;
export const CELL_EXIT = 3;

export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];

    // Initialize empty grid
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        if (r === 0) {
          this.cells[r][c] = CELL_SPAWN;
        } else if (r === rows - 1) {
          this.cells[r][c] = CELL_EXIT;
        } else {
          this.cells[r][c] = CELL_EMPTY;
        }
      }
    }
  }

  getCell(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return this.cells[row][col];
  }

  setCell(col, row, value) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    this.cells[row][col] = value;
    return true;
  }

  canPlace(col, row) {
    return this.getCell(col, row) === CELL_EMPTY;
  }

  // Try placing a bunker - returns true if valid (path still exists)
  tryPlace(col, row) {
    if (!this.canPlace(col, row)) return false;

    // Temporarily place
    this.cells[row][col] = CELL_BUNKER;

    // Check if path still exists from any spawn to any exit
    const pathExists = this.hasValidPath();

    if (!pathExists) {
      // Revert
      this.cells[row][col] = CELL_EMPTY;
      return false;
    }

    return true;
  }

  // Check if at least one path exists from spawn row to exit row
  hasValidPath() {
    // Try from each spawn cell to see if any exit is reachable
    for (let c = 0; c < this.cols; c++) {
      if (this.findPath(c, 0, null) !== null) {
        return true;
      }
    }
    return false;
  }

  // A* pathfinding from a spawn cell to nearest exit cell
  // Returns array of {col, row} or null if no path
  findPath(startCol, startRow, targetExitCol) {
    const openSet = [];
    const closedSet = new Set();
    const cameFrom = {};

    const exitRow = this.rows - 1;

    const heuristic = (col, row) => {
      if (targetExitCol !== null && targetExitCol !== undefined) {
        return Math.abs(col - targetExitCol) + Math.abs(row - exitRow);
      }
      return Math.abs(row - exitRow);
    };

    const key = (col, row) => `${col},${row}`;

    const startKey = key(startCol, startRow);
    openSet.push({
      col: startCol,
      row: startRow,
      g: 0,
      f: heuristic(startCol, startRow),
    });

    const gScore = {};
    gScore[startKey] = 0;

    while (openSet.length > 0) {
      // Find node with lowest f
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const currentKey = key(current.col, current.row);

      // Reached exit row?
      if (current.row === exitRow) {
        // Reconstruct path
        const path = [];
        let k = currentKey;
        while (k) {
          const [cc, cr] = k.split(',').map(Number);
          path.unshift({ col: cc, row: cr });
          k = cameFrom[k];
        }
        return path;
      }

      closedSet.add(currentKey);

      // Check 4 neighbors
      const neighbors = [
        { col: current.col, row: current.row - 1 },
        { col: current.col, row: current.row + 1 },
        { col: current.col - 1, row: current.row },
        { col: current.col + 1, row: current.row },
      ];

      for (const n of neighbors) {
        const nKey = key(n.col, n.row);
        if (closedSet.has(nKey)) continue;

        const cell = this.getCell(n.col, n.row);
        if (cell === -1 || cell === CELL_BUNKER) continue; // Out of bounds or blocked

        const tentativeG = gScore[currentKey] + 1;

        if (tentativeG < (gScore[nKey] ?? Infinity)) {
          gScore[nKey] = tentativeG;
          cameFrom[nKey] = currentKey;
          const f = tentativeG + heuristic(n.col, n.row);

          // Add to open set if not already there
          const existing = openSet.find(o => o.col === n.col && o.row === n.row);
          if (existing) {
            existing.g = tentativeG;
            existing.f = f;
          } else {
            openSet.push({ col: n.col, row: n.row, g: tentativeG, f });
          }
        }
      }
    }

    return null; // No path found
  }

  // Get the current best path (from center spawn to center exit)
  getCurrentPath() {
    const centerCol = Math.floor(this.cols / 2);
    return this.findPath(centerCol, 0, centerCol);
  }
}
