/**
 * Vision-guided pathfinding plugin for robloxbot.
 *
 * Uses YOLO detections to build a walkability grid, then runs A* to find
 * the distance and route from the bot to a detected goal while avoiding
 * detected obstacles.
 *
 * How it works (explain-like-I'm-five):
 *   1. YOLO looks at a picture and says "goal is here, wall is there"
 *   2. We turn those picture dots into squares on a grid
 *   3. We count how many squares between the bot and the goal
 *   4. We walk square by square, stepping around walls
 *
 * Usage:
 *   import { visionPathfinding } from "robloxbot-vision-pathfinding";
 *   bot.use(visionPathfinding, {
 *     gridSize: 32,
 *     pixelsPerCell: 50,      // how many picture pixels = 1 grid cell
 *     goalLabels: ["player", "goal"],
 *     obstacleLabels: ["wall", "obstacle", "npc", "object"],
 *   });
 *
 *   const detections = await bot.vision.detector.detect(imageBuffer, imageWidth, imageHeight);
 *   await bot.visionPathfinding.processDetections(detections);
 *   const info = await bot.visionPathfinding.findPathToGoal();
 *   // info = { distance: 5, path: [{x,z},...], found: true }
 */

export class VisionPathfindingPlugin {
  constructor() {
    this.name = "visionPathfinding";
  }

  apply(bot, options = {}) {
    const {
      gridSize = 32,
      pixelsPerCell = 50,
      goalLabels = ["player", "goal"],
      obstacleLabels = ["wall", "obstacle", "npc", "object", "blocked"],
      startX = 0,
      startZ = 0,
    } = options;

    // Grid: grid[z][x] = 0 (walkable) | 1 (blocked)
    let grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    let width = gridSize;
    let height = gridSize;

    // Bot's current position on the grid (updated externally or by processDetections)
    let botPos = { x: startX, z: startZ };
    let goalPos = null;

    // ── Helpers ────────────────────────────────────────────────────────

    const isLabel = (label, list) =>
      list.some((l) => l.toLowerCase() === String(label).toLowerCase());

    // Convert raw image pixels to grid cell index
    const pixelToCell = (px) => Math.round(px / pixelsPerCell);

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

    const neighbors = (x, z) => {
      const dirs = [
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
      ];
      const result = [];
      for (const { dx, dz } of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        if (
          nx >= 0 &&
          nx < width &&
          nz >= 0 &&
          nz < height &&
          grid[nz][nx] === 0
        ) {
          result.push({ x: nx, z: nz });
        }
      }
      return result;
    };

    const reconstructPath = (cameFrom, start, goal) => {
      const path = [];
      let node = goal;
      const key = (p) => `${p.x},${p.z}`;
      while (node && !(node.x === start.x && node.z === start.z)) {
        path.push({ x: node.x, z: node.z });
        node = cameFrom[key(node)];
      }
      path.push({ x: start.x, z: start.z });
      return path.reverse();
    };

    const astar = (start, goal) => {
      const openSet = [start];
      const closedSet = new Set();
      const gScore = {};
      const fScore = {};
      const cameFrom = {};
      const key = (p) => `${p.x},${p.z}`;

      gScore[key(start)] = 0;
      fScore[key(start)] = manhattan(start, goal);

      while (openSet.length > 0) {
        openSet.sort((a, b) => fScore[key(a)] - fScore[key(b)]);
        const current = openSet.shift();

        if (current.x === goal.x && current.z === goal.z) {
          return reconstructPath(cameFrom, start, goal);
        }

        closedSet.add(key(current));

        for (const neighbor of neighbors(current.x, current.z)) {
          if (closedSet.has(key(neighbor))) continue;

          const tentativeG = gScore[key(current)] + 1;
          const nk = key(neighbor);

          if (!gScore[nk] || tentativeG < gScore[nk]) {
            cameFrom[nk] = current;
            gScore[nk] = tentativeG;
            fScore[nk] = tentativeG + manhattan(neighbor, goal);

            if (!openSet.some((n) => n.x === neighbor.x && n.z === neighbor.z)) {
              openSet.push(neighbor);
            }
          }
        }
      }

      return null;
    };

    // ── Public API ─────────────────────────────────────────────────────

    const visionPathfinding = {
      name: "visionPathfinding",
      gridSize,
      pixelsPerCell,
      width,
      height,
      grid,

      /**
       * Set the bot's current grid position.
       */
      setBotPosition(x, z) {
        botPos = { x, z };
      },

      /**
       * Manually set a goal cell.
       */
      setGoal(x, z) {
        goalPos = { x, z };
      },

      /**
       * Clear all obstacles and goals from the grid.
       */
      clearGrid() {
        grid = Array.from({ length: height }, () => Array(width).fill(0));
        goalPos = null;
      },

      /**
       * Mark a specific cell as blocked/walkable.
       */
      setCell(x, z, walkable) {
        if (z >= 0 && z < height && x >= 0 && x < width) {
          grid[z][x] = walkable ? 0 : 1;
        }
      },

      /**
       * Process YOLO detections into the grid.
       *
       * @param {Array} detections - [{ label, box: [x, y, w, h], confidence }]
       * @param {number} imageWidth - width of the image in pixels
       * @param {number} imageHeight - height of the image in pixels
       * @param {Object} options - { botX, botZ } optional bot position override
       */
      processDetections(detections, imageWidth, imageHeight, options = {}) {
        if (!detections || !Array.isArray(detections)) {
          throw new Error("detections must be an array");
        }

        // Reset grid but keep dimensions
        grid = Array.from({ length: height }, () => Array(width).fill(0));
        goalPos = null;

        // Optional bot position override from options
        if (options.botX !== undefined && options.botZ !== undefined) {
          botPos = { x: options.botX, z: options.botZ };
        }

        for (const det of detections) {
          const label = String(det.label || "");
          const box = det.box || [0, 0, 0, 0];
          const [bx, by, bw, bh] = box;

          // Center of the detection box, converted to grid cell
          const cx = pixelToCell(bx + bw / 2);
          const cz = pixelToCell(by + bh / 2);

          const gx = clamp(cx, 0, width - 1);
          const gz = clamp(cz, 0, height - 1);

          // Mark a small area around the detection (not just one cell)
          const radius = Math.max(1, Math.round((bw + bh) / 2 / pixelsPerCell));

          if (isLabel(label, goalLabels)) {
            goalPos = { x: gx, z: gz };
          }

          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = gx + dx;
              const nz = gz + dz;
              if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
                if (isLabel(label, goalLabels)) {
                  grid[nz][nx] = 0; // goal cells stay walkable
                } else if (isLabel(label, obstacleLabels)) {
                  grid[nz][nx] = 1; // blocked
                }
              }
            }
          }
        }

        return { grid, goalPos, botPos, detectionCount: detections.length };
      },

      /**
       * Get the Manhattan distance (in cells) from bot to goal.
       * Returns null if no goal is set.
       */
      getDistanceToGoal() {
        if (!goalPos) return null;
        return manhattan(botPos, goalPos);
      },

      /**
       * Run A* from bot position to goal.
       * Returns { found: boolean, distance: number|null, path: Array|null }.
       */
      findPathToGoal() {
        if (!goalPos) {
          return { found: false, distance: null, path: null, reason: "no_goal" };
        }

        const path = astar(botPos, goalPos);

        if (!path) {
          return { found: false, distance: null, path: null, reason: "no_path" };
        }

        // Distance = steps between cells (exclude start)
        const distance = path.length - 1;

        return { found: true, distance, path };
      },

      /**
       * Find path + follow it step by step using bot.walk().
       * Converts grid-cell steps to walk directions.
       */
      async followPathToGoal(options = {}) {
        const {
          walkDuration = 1,
          onStep,
          onComplete,
          stopOnUnreachable = true,
        } = options;

        const result = this.findPathToGoal();

        if (!result.found) {
          if (onComplete) onComplete(result);
          return result;
        }

        const path = result.path;
        let steps = 0;

        for (let i = 1; i < path.length; i++) {
          const cell = path[i];
          const prev = path[i - 1];
          const dx = cell.x - prev.x;
          const dz = cell.z - prev.z;

          if (onStep) onStep({ cell, index: i, step: steps });

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
              const failResult = { ...result, success: false, steps };
              if (onComplete) onComplete(failResult);
              return failResult;
            }
          }
        }

        const successResult = { ...result, success: true, steps };
        if (onComplete) onComplete(successResult);
        return successResult;
      },

      /**
       * Full pipeline: detect → grid → path → walk.
       * Accepts an image buffer and runs YOLO + pathfinding in one call.
       */
      async navigateFromImage(imageBuffer, imageWidth, imageHeight, options = {}) {
        if (!bot.vision) {
          throw new Error(
            "Vision service not available. Set VISION_SERVICE_URL and use bot.vision."
          );
        }

        const detectResult = await bot.vision.detector.detect(imageBuffer, {
          label: "all",
        });
        const detections = Array.isArray(detectResult)
          ? detectResult
          : detectResult.detections || [];

        this.processDetections(detections, imageWidth, imageHeight, {
          botX: options.botX,
          botZ: options.botZ,
        });

        return this.followPathToGoal(options);
      },
    };

    bot.visionPathfinding = visionPathfinding;

    bot.emit("plugin:loaded", { plugin: "visionPathfinding" });
  }

  unload(bot) {
    delete bot.visionPathfinding;
    bot.emit("plugin:unloaded", { plugin: "visionPathfinding" });
  }
}

export const visionPathfinding = new VisionPathfindingPlugin();

export default VisionPathfindingPlugin;
