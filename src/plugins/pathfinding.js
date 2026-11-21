/**
 * Pathfinding plugin for robloxbot — mineflayer-pathfinder style.
 *
 * Provides grid-based A* pathfinding. The bot can find paths between
 * walkable grid cells and execute them step-by-step using bot.walk().
 *
 * World data is not connected to RakNet yet (that transport is stubbed),
 * so the grid must be populated manually or via your own map source.
 *
 * Usage:
 *   import { pathfinding } from "robloxbot-pathfinding"; // separate npm package
 *   bot.use(pathfinding, { gridSize: 16 });
 *
 *   bot.pathfinder.setGrid(grid2d); // 0 = walkable, 1 = blocked
 *   bot.pathfinder.setStart({ x: 0, z: 0 });
 *   bot.pathfinder.setGoal({ x: 10, z: 5 });
 *   const path = bot.pathfinder.findPath();
 *   await bot.pathfinder.followPath(); // walks each step
 */

export class PathfindingPlugin {
  constructor() {
    this.name = "pathfinding";
  }

  apply(bot, options = {}) {
    const {
      gridSize = 16,
      walkSpeed = 1, // seconds per cell
      diagonalMovement = false,
    } = options;

    let grid = []; // grid[z][x] = 0|1
    let start = { x: 0, z: 0 };
    let goal = { x: 0, z: 0 };
    let width = gridSize;
    let height = gridSize;

    const neighbors = (x, z) => {
      const dirs = diagonalMovement
        ? [
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 },
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 1, dz: 1 },
            { dx: 1, dz: -1 },
            { dx: -1, dz: 1 },
            { dx: -1, dz: -1 },
          ]
        : [
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 },
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
          ];
      const result = [];
      for (const { dx, dz } of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nx < width && nz >= 0 && nz < height && grid[nz][nx] === 0) {
          result.push({ x: nx, z: nz });
        }
      }
      return result;
    };

    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

    const findPath = (startNode, goalNode) => {
      const openSet = [];
      const closedSet = new Set();
      const gScore = {};
      const fScore = {};
      const cameFrom = {};

      const key = (p) => `${p.x},${p.z}`;
      gScore[key(startNode)] = 0;
      fScore[key(startNode)] = heuristic(startNode, goalNode);
      openSet.push(startNode);

      while (openSet.length > 0) {
        // Pick lowest fScore
        openSet.sort((a, b) => fScore[key(a)] - fScore[key(b)]);
        const current = openSet.shift();

        if (current.x === goalNode.x && current.z === goalNode.z) {
          // Reconstruct path
          const path = [];
          let node = current;
          while (node) {
            path.push({ x: node.x, z: node.z });
            node = cameFrom[key(node)];
          }
          return path.reverse();
        }

        closedSet.add(key(current));

        for (const neighbor of neighbors(current.x, current.z)) {
          if (closedSet.has(key(neighbor))) continue;

          const tentativeG = gScore[key(current)] + 1;

          const neighborKey = key(neighbor);
          if (!gScore[neighborKey] || tentativeG < gScore[neighborKey]) {
            cameFrom[neighborKey] = current;
            gScore[neighborKey] = tentativeG;
            fScore[neighborKey] = tentativeG + heuristic(neighbor, goalNode);

            if (!openSet.some((n) => n.x === neighbor.x && n.z === neighbor.z)) {
              openSet.push(neighbor);
            }
          }
        }
      }

      return null; // No path found
    };

    const pathfinder = {
      name: "pathfinding",
      gridSize,
      width,
      height,
      grid,
      start: { ...start },
      goal: { ...goal },

      setGrid(newGrid, w, h) {
        width = w || newGrid[0].length;
        height = h || newGrid.length;
        grid = newGrid;
      },

      setStart(x, z) {
        start = { x, z };
      },

      setGoal(x, z) {
        goal = { x, z };
      },

      isWalkable(x, z) {
        return grid[z] && grid[z][x] === 0;
      },

      setWalkable(x, z, walkable) {
        if (!grid[z]) grid[z] = [];
        grid[z][x] = walkable ? 0 : 1;
      },

      findPath(s = start, g = goal) {
        return findPath(s, g);
      },

      async followPath(path, options = {}) {
        const {
          onStep,
          onComplete,
          walkDuration = walkSpeed,
          stopOnUnreachable = true,
        } = options;

        if (!path || path.length === 0) {
          if (onComplete) onComplete({ success: true, steps: 0 });
          return { success: true, steps: 0 };
        }

        let steps = 0;
        for (let i = 1; i < path.length; i++) {
          const cell = path[i];
          const dx = cell.x - path[i - 1].x;
          const dz = cell.z - path[i - 1].z;

          if (onStep) onStep({ cell, index: i, step: steps });

          // Convert grid cell to a walk direction
          let direction = "f";
          if (dx === 1) direction = "r";
          else if (dx === -1) direction = "l";
          else if (dz === 1) direction = "b";
          else if (dz === -1) direction = "f";

          try {
            await bot.walk(direction, walkDuration);
            steps++;
          } catch (err) {
            bot.emit("error", err);
            if (stopOnUnreachable) {
              if (onComplete) onComplete({ success: false, steps });
              return { success: false, steps };
            }
          }
        }

        if (onComplete) onComplete({ success: true, steps });
        return { success: true, steps };
      },

      async goTo(targetX, targetZ, options = {}) {
        pathfinder.setGoal(targetX, targetZ);
        const path = pathfinder.findPath(start, goal);
        if (!path) {
          if (options.onComplete) options.onComplete({ success: false, reason: "no_path" });
          return { success: false, reason: "no_path" };
        }
        return pathfinder.followPath(path, options);
      },
    };

    bot.pathfinder = pathfinder;

    bot.emit("plugin:loaded", { plugin: "pathfinding" });
  }

  unload(bot) {
    delete bot.pathfinder;
    bot.emit("plugin:unloaded", { plugin: "pathfinding" });
  }
}

export const pathfinding = new PathfindingPlugin();

export default PathfindingPlugin;
