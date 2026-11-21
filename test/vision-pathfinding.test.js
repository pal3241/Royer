import { describe, it, expect, vi } from "vitest";
import { RobloxBot } from "../src/index.js";
import { visionPathfinding } from "../src/plugins/vision-pathfinding.js";

function makeBot() {
  const bot = new RobloxBot({
    client: {
      transport: { connected: true },
      connected: true,
      disconnect: async () => {},
    },
  });
  bot._started = true;
  bot.character = {
    username: "TestBot",
    spawned: true,
    alive: true,
    reset: () => {},
    position: { x: 0, y: 0, z: 0 },
  };
  bot.movement = {
    walk: vi.fn().mockResolvedValue({}),
  };
  bot.chat = {
    say: vi.fn().mockResolvedValue({}),
    whisper: vi.fn().mockResolvedValue({}),
  };
  bot.game = {
    joinGame: vi.fn().mockResolvedValue({}),
    joinUser: vi.fn().mockResolvedValue({}),
    joinServer: vi.fn().mockResolvedValue({}),
    leaveGame: vi.fn().mockResolvedValue({}),
    findServers: vi.fn().mockResolvedValue([]),
    joinFriend: vi.fn().mockResolvedValue({}),
    listFriends: vi.fn().mockResolvedValue([]),
  };
  bot.vision = {
    detector: {
      detect: vi.fn().mockResolvedValue({ detections: [], count: 0 }),
    },
  };
  return bot;
}

describe("visionPathfinding plugin", () => {
  it("loads via bot.use() and attaches bot.visionPathfinding", () => {
    const bot = makeBot();
    bot.use(visionPathfinding);

    expect(bot.visionPathfinding).toBeDefined();
    expect(bot.visionPathfinding.name).toBe("visionPathfinding");
  });

  it("processDetections marks obstacles and goal on grid", () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 10, pixelsPerCell: 10 });

    const detections = [
      { label: "wall", box: [20, 20, 10, 10], confidence: 0.9 },
      { label: "player", box: [70, 70, 10, 10], confidence: 0.9 },
    ];

    const result = bot.visionPathfinding.processDetections(
      detections,
      100, // imageWidth
      100  // imageHeight
    );

    // wall at center (25,25) -> cell (2,2) area blocked
    expect(result.grid[2][2]).toBe(1);
    // player at (85,85) -> cell (8,8) is goal
    expect(result.goalPos).toEqual({ x: 8, z: 8 });
    expect(result.grid[8][8]).toBe(0);
  });

  it("getDistanceToGoal returns Manhattan distance", () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 10, pixelsPerCell: 10 });
    bot.visionPathfinding.setBotPosition(0, 0);
    bot.visionPathfinding.setGoal(3, 4);

    expect(bot.visionPathfinding.getDistanceToGoal()).toBe(7);
  });

  it("getDistanceToGoal returns null when no goal", () => {
    const bot = makeBot();
    bot.use(visionPathfinding);

    expect(bot.visionPathfinding.getDistanceToGoal()).toBeNull();
  });

  it("findPathToGoal finds path around obstacle", () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 5, pixelsPerCell: 10 });

    // Manually set up a grid with a wall in the middle
    bot.visionPathfinding.clearGrid();
    bot.visionPathfinding.setBotPosition(0, 0);
    bot.visionPathfinding.setGoal(4, 4);
    // Block the direct diagonal-ish path
    bot.visionPathfinding.setCell(2, 2, false);

    const result = bot.visionPathfinding.findPathToGoal();

    expect(result.found).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.path[0]).toEqual({ x: 0, z: 0 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 4, z: 4 });
  });

  it("findPathToGoal returns not found when goal is blocked in", () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 3, pixelsPerCell: 10 });

    bot.visionPathfinding.clearGrid();
    bot.visionPathfinding.setBotPosition(0, 0);
    bot.visionPathfinding.setGoal(2, 2);
    // Surround goal with walls
    bot.visionPathfinding.setCell(1, 2, false);
    bot.visionPathfinding.setCell(2, 1, false);

    const result = bot.visionPathfinding.findPathToGoal();

    expect(result.found).toBe(false);
    expect(result.reason).toBe("no_path");
  });

  it("findPathToGoal returns no goal when none set", () => {
    const bot = makeBot();
    bot.use(visionPathfinding);

    const result = bot.visionPathfinding.findPathToGoal();
    expect(result.found).toBe(false);
    expect(result.reason).toBe("no_goal");
  });

  it("followPathToGoal calls bot.walk for each step", async () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 5, pixelsPerCell: 10 });

    bot.visionPathfinding.clearGrid();
    bot.visionPathfinding.setBotPosition(0, 0);
    bot.visionPathfinding.setGoal(2, 0);

    const result = await bot.visionPathfinding.followPathToGoal();

    expect(result.success).toBe(true);
    expect(result.steps).toBe(2);
    expect(bot.movement.walk).toHaveBeenCalledTimes(2);
    // First step should be right (x increases)
    expect(bot.movement.walk.mock.calls[0][0]).toBe("r");
  });

  it("setBotPosition updates bot location", () => {
    const bot = makeBot();
    bot.use(visionPathfinding);

    bot.visionPathfinding.setBotPosition(5, 5);
    bot.visionPathfinding.setGoal(10, 10);

    expect(bot.visionPathfinding.getDistanceToGoal()).toBe(10);
  });

  it("unload removes bot.visionPathfinding", () => {
    const bot = makeBot();
    bot.use(visionPathfinding);
    expect(bot.visionPathfinding).toBeDefined();

    bot.unuse("visionPathfinding");
    expect(bot.visionPathfinding).toBeUndefined();
  });

  it("navigateFromImage calls detect then followPath", async () => {
    const bot = makeBot();
    bot.use(visionPathfinding, { gridSize: 5, pixelsPerCell: 10 });

    // Mock detect to return a player at bottom-right (goal)
    bot.vision.detector.detect = vi.fn().mockResolvedValue({
      detections: [
        { label: "player", box: [40, 40, 10, 10], confidence: 0.9 },
      ],
      count: 1,
    });

    // Mock image as 50x50 pixels, so cell (4,4) is goal, bot at (0,0)
    const imageBuffer = new Uint8Array([1, 2, 3]);
    const result = await bot.visionPathfinding.navigateFromImage(
      imageBuffer,
      50,
      50,
      { botX: 0, botZ: 0 }
    );

    expect(bot.vision.detector.detect).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(bot.movement.walk).toHaveBeenCalled();
  });
});
