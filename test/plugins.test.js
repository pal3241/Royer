import { describe, it, expect, vi } from "vitest";
import { RobloxBot } from "../src/index.js";
import { PluginManager, PluginError } from "../src/plugin.js";
import { pathfinding } from "../src/plugins/pathfinding.js";

// ── Helper: minimal bot without transport ──────────────────────────────

function makeMinimalBot() {
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
  return bot;
}

describe("PluginManager", () => {
  it("loads a function plugin", () => {
    const bot = makeMinimalBot();
    const apply = vi.fn();

    // Use a named function declaration so .name is settable
    function testPlugin(b, opts) {
      apply(b, opts);
      b.testProp = "loaded";
    }

    bot.use(testPlugin, { foo: "bar" });

    expect(apply).toHaveBeenCalledWith(bot, { foo: "bar" });
    expect(bot.testProp).toBe("loaded");
    expect(bot.hasPlugin("testPlugin")).toBe(true);
    expect(bot.loadedPlugins).toContain("testPlugin");
  });

  it("loads an anonymous function plugin", () => {
    const bot = makeMinimalBot();
    const apply = vi.fn();

    const plugin = (b, opts) => {
      apply(b, opts);
    };

    bot.use(plugin);

    expect(apply).toHaveBeenCalledWith(bot, {});
    // Arrow function name is the variable name ("plugin"), not "anonymous"
    expect(bot.hasPlugin("plugin")).toBe(true);
    expect(bot.loadedPlugins.length).toBe(1);
  });

  it("loads an object plugin with apply", () => {
    const bot = makeMinimalBot();
    const apply = vi.fn();
    const plugin = {
      name: "objPlugin",
      apply: apply,
    };

    bot.use(plugin);

    expect(apply).toHaveBeenCalledWith(bot, {});
    expect(bot.hasPlugin("objPlugin")).toBe(true);
  });

  it("throws on duplicate plugin", () => {
    const bot = makeMinimalBot();

    function dup() {}

    bot.use(dup);
    expect(() => bot.use(dup)).toThrow(PluginError);
  });

  it("unloads a plugin", () => {
    const bot = makeMinimalBot();
    const unload = vi.fn();
    const plugin = {
      name: "unloadable",
      apply: () => {},
      unload: unload,
    };

    bot.use(plugin);
    bot.unuse("unloadable");

    expect(unload).toHaveBeenCalledWith(bot);
    expect(bot.hasPlugin("unloadable")).toBe(false);
  });

  it("throws when unloading unknown plugin", () => {
    const bot = makeMinimalBot();
    expect(() => bot.unuse("nonexistent")).toThrow(PluginError);
  });

  it("getPlugin returns loaded plugin", () => {
    const bot = makeMinimalBot();

    function gettable() {}

    bot.use(gettable);
    expect(bot.getPlugin("gettable")).toBeDefined();
    expect(bot.getPlugin("missing")).toBeUndefined();
  });
});

describe("pathfinding plugin", () => {
  it("loads via bot.use() and attaches bot.pathfinder", () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    expect(bot.pathfinder).toBeDefined();
    expect(bot.pathfinder.name).toBe("pathfinding");
    expect(bot.hasPlugin("pathfinding")).toBe(true);
  });

  it("setGrid and isWalkable work", () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    const grid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    bot.pathfinder.setGrid(grid, 3, 3);

    expect(bot.pathfinder.isWalkable(0, 0)).toBe(true);
    expect(bot.pathfinder.isWalkable(1, 1)).toBe(false);
    expect(bot.pathfinder.isWalkable(2, 2)).toBe(true);
  });

  it("findPath returns path around obstacle", () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    const grid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    bot.pathfinder.setGrid(grid, 3, 3);
    bot.pathfinder.setStart(0, 0);
    bot.pathfinder.setGoal(2, 2);

    const path = bot.pathfinder.findPath();
    expect(path).not.toBeNull();
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, z: 2 });

    // Verify no cell in path hits the obstacle at (1,1)
    for (const cell of path) {
      expect(cell.x !== 1 || cell.z !== 1).toBe(true);
    }
  });

  it("findPath returns null when blocked", () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    // Fully blocked grid
    const grid = [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ];
    bot.pathfinder.setGrid(grid, 3, 3);
    bot.pathfinder.setStart(0, 0);
    bot.pathfinder.setGoal(2, 2);

    const path = bot.pathfinder.findPath();
    expect(path).toBeNull();
  });

  it("followPath calls bot.walk for each step", async () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    const path = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ];

    const result = await bot.pathfinder.followPath(path);
    expect(result.success).toBe(true);
    expect(result.steps).toBe(2);
    expect(bot.movement.walk).toHaveBeenCalledTimes(2);
  });

  it("goTo finds path and follows it", async () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);

    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    bot.pathfinder.setGrid(grid, 3, 3);
    bot.pathfinder.setStart(0, 0);

    const result = await bot.pathfinder.goTo(2, 2);
    expect(result.success).toBe(true);
    expect(bot.movement.walk).toHaveBeenCalled();
  });

  it("unload removes bot.pathfinder", () => {
    const bot = makeMinimalBot();
    bot.use(pathfinding);
    expect(bot.pathfinder).toBeDefined();

    bot.unuse("pathfinding");
    expect(bot.pathfinder).toBeUndefined();
    expect(bot.hasPlugin("pathfinding")).toBe(false);
  });
});
