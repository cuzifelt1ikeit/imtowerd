# Impossible Tower Defense

A browser-based tower defense game where you build mazes, garrison bunkers, and try to survive endless waves of increasingly intelligent enemies. You **will** lose — the question is how far can you get.

Inspired by StarCraft custom tower defense maps.

## Play Now

🎮 **[Play in your browser](https://cuzifelt1ikeit.github.io/imtowerd/)**

## How to Play

### Controls
- **Build Mode** — Tap the button at the bottom to toggle building
- **Place Bunkers** — In build mode, tap empty grid cells ($50 each)
- **Add Units** — Outside build mode, tap a bunker to open the garrison panel
- **Upgrade Units** — Tap the ⬆ button next to any unit in the garrison panel
- **Early Send** — Between waves, tap ⚡ to start the next wave early for bonus cash
- **Scroll** — Mouse wheel or touch-drag to scroll the grid vertically

### Core Mechanics
- Enemies spawn across the **top edge** and try to reach the **bottom edge**
- Build bunkers to create a maze — you can never fully block the path
- Garrison bunkers with units to deal damage to passing enemies
- Earn cash from kills, spend it on more bunkers, units, and upgrades
- Each leaked enemy costs you HP based on its type
- Game ends when HP reaches 0

### Unit Types
| Unit | Cost | Range | Fire Rate | Damage | Special |
|------|------|-------|-----------|--------|---------|
| Machine Gun (MG) | $30 | Medium | Fast | Low | Consistent DPS |
| Shotgun (SG) | $45 | Medium | Medium | Medium | Cone splash |
| Flamethrower (FT) | $60 | Short | Sustained | High | AOE + burn DOT |
| Sniper (SN) | $50 | Long | Slow | High | Single target |

### Enemy Types
| Enemy | HP | Speed | Leak Damage | Visual |
|-------|-----|-------|-------------|--------|
| Grunt | Low | Normal | 1 HP | Red circle |
| Runner | Very Low | Fast | 2 HP | Orange, small |
| Tank | High | Slow | 5 HP | Purple, large |
| Swarm | Tiny | Fast | 0.5 HP | Orange, tiny |
| Boss | Massive | Slow | 20 HP | Dark red, huge |

### Enemy Intelligence
Not all enemies are smart. Each wave has a mix of:
- **Pathfinders** (🧭) — follow the optimal A* path through your maze
- **Wanderers** (?) — stumble toward the exit with random detours

Early waves are mostly wanderers (~90%). As waves progress, more enemies become pathfinders (up to 85%). Bosses always know the way.

### Upgrades
Each unit can be upgraded from Tier 1 to Tier 5:
- **Damage** scales up to 3.2x base
- **Fire Rate** scales up to 1.6x base
- **Range** scales up to 1.4x base
- Upgrade cost increases per tier (1x → 1.5x → 2x → 2.5x base unit cost)

### Wave Progression
- **Waves 1-5**: Single enemy type per wave (tutorial)
- **Waves 6-15**: Mixed enemy combinations
- **Waves 16+**: Full chaos, all types, scaling stats
- **Every 10 waves**: Boss wave
- HP, speed, and enemy count all scale over time

## Project Structure
```
imtowerd/
├── index.html      — Page layout, HUD, script loading
├── styles.css      — All visual styling (HUD, buttons, layout)
├── game.js         — Main game loop, input handling, UI logic
├── grid.js         — Grid data structure and A* pathfinding
├── enemies.js      — Enemy classes, wave generation, wanderer AI, visual effects
├── bunkers.js      — Bunker/unit classes, targeting, upgrades, shooting
└── renderer.js     — 2D canvas drawing (grid, enemies, projectiles, effects)
```

## Tech Stack
- **Vanilla JavaScript** (ES Modules)
- **HTML5 Canvas** for all rendering
- **No dependencies** — runs in any modern browser
- Touch-friendly for mobile

## License
Personal project — not yet licensed for distribution.
