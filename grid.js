/**
 * GRID.JS — Grid Data Structure & A* Pathfinding
 *
 * This file manages the game board (a 2D grid of cells) and handles
 * pathfinding — figuring out if enemies can still reach the exit
 * when the player places a new bunker.
 *
 * Think of the grid like a spreadsheet: each cell has a column (x)
 * and row (y) position, and a type (empty, bunker, spawn, exit).
 */

// ── Cell Type Constants ──────────────────────────────────────────
// These numbers represent what's in each grid cell.
// We use numbers instead of strings because they're faster to compare.
export const CELL_EMPTY = 0;   // Nothing here — enemies can walk through, player can build
export const CELL_BUNKER = 1;  // A bunker is placed here — blocks enemy movement
export const CELL_SPAWN = 2;   // Top row — where enemies appear
export const CELL_EXIT = 3;    // Bottom row — where enemies escape

/**
 * The Grid class stores the entire game board.
 *
 * @param {number} cols — How many columns wide the grid is
 * @param {number} rows — How many rows tall the grid is
 */
export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;

    // Create a 2D array to store cell types.
    // this.cells[row][col] gives us the cell type at that position.
    // Example: this.cells[3][5] is row 3, column 5.
    this.cells = [];

    for (let r = 0; r < rows; r++) {
      this.cells[r] = []; // Create a new row (an empty array)
      for (let c = 0; c < cols; c++) {
        // Top row = spawn zone, bottom row = exit zone, everything else = empty
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

  /**
   * Get what type of cell is at a specific position.
   * Returns -1 if the position is outside the grid (out of bounds).
   */
  getCell(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return this.cells[row][col];
  }

  /**
   * Set a cell to a specific type.
   * Returns false if the position is out of bounds.
   */
  setCell(col, row, value) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    this.cells[row][col] = value;
    return true;
  }

  /**
   * Check if a bunker CAN be placed here (cell must be empty).
   * This doesn't check if it would block the path — that's tryPlace().
   */
  canPlace(col, row) {
    return this.getCell(col, row) === CELL_EMPTY;
  }

  /**
   * Try to place a bunker at this position.
   *
   * This is the key function for maze building:
   * 1. Temporarily places the bunker
   * 2. Checks if enemies can still reach the exit (using A* pathfinding)
   * 3. If yes → keeps the bunker, returns true
   * 4. If no → removes the bunker, returns false
   *
   * This prevents the player from completely walling off the path.
   */
  tryPlace(col, row) {
    if (!this.canPlace(col, row)) return false;

    // Step 1: Temporarily place the bunker
    this.cells[row][col] = CELL_BUNKER;

    // Step 2: Check if a valid path still exists
    const pathExists = this.hasValidPath();

    if (!pathExists) {
      // Step 3a: No path! Undo the placement.
      this.cells[row][col] = CELL_EMPTY;
      return false;
    }

    // Step 3b: Path exists — bunker stays.
    return true;
  }

  /**
   * Check if at least one path exists from ANY spawn cell to ANY exit cell.
   * We only need one valid path for the game to work.
   */
  hasValidPath() {
    // Try finding a path from each column in the spawn row
    for (let c = 0; c < this.cols; c++) {
      if (this.findPath(c, 0, null) !== null) {
        return true; // Found at least one valid path — that's enough
      }
    }
    return false; // No path from any spawn point
  }

  /**
   * A* PATHFINDING — The core algorithm that finds the shortest path.
   *
   * A* (pronounced "A star") is a famous algorithm used in games to find
   * the best path between two points while avoiding obstacles.
   *
   * How it works:
   * 1. Start at the beginning point
   * 2. Look at all neighboring cells (up, down, left, right)
   * 3. For each neighbor, calculate a "score" = (distance traveled so far) + (estimated distance to goal)
   * 4. Always explore the cell with the lowest score first
   * 5. Repeat until we reach the goal or run out of cells to explore
   *
   * The "estimated distance to goal" (called the heuristic) is what makes A*
   * smart — it prioritizes cells that are closer to the exit.
   *
   * @param {number} startCol — Starting column (where the enemy is)
   * @param {number} startRow — Starting row
   * @param {number|null} targetExitCol — Preferred exit column (null = any exit)
   * @returns {Array|null} — Array of {col, row} waypoints, or null if no path exists
   */
  findPath(startCol, startRow, targetExitCol) {
    // The "open set" is a list of cells we haven't fully explored yet.
    // We always pick the one with the lowest f-score to explore next.
    const openSet = [];

    // The "closed set" tracks cells we've already fully explored.
    // We use a Set for fast lookups (checking "have we been here?" is instant).
    const closedSet = new Set();

    // "cameFrom" remembers how we got to each cell, so we can
    // reconstruct the full path once we reach the goal.
    const cameFrom = {};

    const exitRow = this.rows - 1; // The bottom row is the exit

    /**
     * The heuristic function estimates how far a cell is from the exit.
     * We use "Manhattan distance" — just add up the horizontal and vertical distance.
     * (Named because it's like counting blocks in Manhattan's grid street layout.)
     */
    const heuristic = (col, row) => {
      if (targetExitCol !== null && targetExitCol !== undefined) {
        return Math.abs(col - targetExitCol) + Math.abs(row - exitRow);
      }
      return Math.abs(row - exitRow); // Just vertical distance if no specific exit column
    };

    // Helper: convert col,row to a string key for use in objects/sets
    // Example: column 3, row 7 becomes "3,7"
    const key = (col, row) => `${col},${row}`;

    const startKey = key(startCol, startRow);

    // Add the starting cell to the open set
    openSet.push({
      col: startCol,
      row: startRow,
      g: 0,                                    // g = actual distance from start (0 because we're at the start)
      f: heuristic(startCol, startRow),         // f = g + heuristic estimate to goal
    });

    // Track the best known distance to each cell
    const gScore = {};
    gScore[startKey] = 0;

    // Main loop: keep exploring until we find the exit or run out of options
    while (openSet.length > 0) {
      // Pick the cell with the lowest f-score (most promising path)
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift(); // Remove and return the first (lowest f) element
      const currentKey = key(current.col, current.row);

      // Did we reach the exit row? We found a path!
      if (current.row === exitRow) {
        // Reconstruct the path by following "cameFrom" links backwards
        const path = [];
        let k = currentKey;
        while (k) {
          const [cc, cr] = k.split(',').map(Number); // Convert "3,7" back to [3, 7]
          path.unshift({ col: cc, row: cr });         // Add to front of array (we're going backwards)
          k = cameFrom[k];                             // Move to the previous cell
        }
        return path; // Return the complete path from start to exit
      }

      // Mark this cell as fully explored
      closedSet.add(currentKey);

      // Check all 4 neighbors (up, down, left, right)
      const neighbors = [
        { col: current.col, row: current.row - 1 }, // Up
        { col: current.col, row: current.row + 1 }, // Down
        { col: current.col - 1, row: current.row }, // Left
        { col: current.col + 1, row: current.row }, // Right
      ];

      for (const n of neighbors) {
        const nKey = key(n.col, n.row);

        // Skip if we already fully explored this cell
        if (closedSet.has(nKey)) continue;

        // Check if this cell is walkable
        const cell = this.getCell(n.col, n.row);
        if (cell === -1 || cell === CELL_BUNKER) continue; // Out of bounds or blocked by bunker

        // Calculate the distance to this neighbor through the current path
        const tentativeG = gScore[currentKey] + 1; // Each step costs 1

        // Is this a better path to this neighbor than we've found before?
        if (tentativeG < (gScore[nKey] ?? Infinity)) {
          // Yes! Update our records.
          gScore[nKey] = tentativeG;
          cameFrom[nKey] = currentKey; // Remember: we got here from current
          const f = tentativeG + heuristic(n.col, n.row);

          // Add to open set (or update if already there)
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

    // We explored everything and never reached the exit — no path exists
    return null;
  }

  /**
   * Get a representative path for display purposes.
   * Finds a path from the center of the spawn row to the exit.
   */
  getCurrentPath() {
    const centerCol = Math.floor(this.cols / 2);
    return this.findPath(centerCol, 0, centerCol);
  }
}
