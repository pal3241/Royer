import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RobloxBot } from "../src/index.js";
import { autoReconnect } from "../src/plugins/auto-reconnect.js";
import { commands } from "../src/plugins/commands.js";
import { macros } from "../src/plugins/macros.js";
import { settings } from "../src/plugins/settings.js";
import { entities } from "../src/plugins/entities.js";
import { inventory } from "../src/plugins/inventory.js";

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
    userId: 1,
    username: "TestBot",
    spawned: true,
    alive: true,
    reset: () => {},
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
  };
  bot.movement = {
    walk: vi.fn().mockResolvedValue({ success: true }),
    jump: vi.fn().mockResolvedValue({ success: true }),
    position: { x: 0, y: 0, z: 0 },
  };
  bot.chat = async (message) => {
    const result = await bot.chatInstance.say(message);
    bot.emit("message", { message, to: "all", ...result });
    return result;
  };
  bot.chatInstance = {
    say: vi.fn().mockResolvedValue({ sent: true }),
    whisper: vi.fn().mockResolvedValue({ sent: true }),
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
  bot.emit = vi.fn();
  return bot;
}

describe("autoReconnect plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.autoReconnect", () => {
    const bot = makeBot();
    bot.use(autoReconnect);
    expect(bot.autoReconnect).toBeDefined();
    expect(bot.autoReconnect.name).toBe("autoReconnect");
    expect(bot.autoReconnect.maxAttempts).toBe(10);
  });

  it("custom maxAttempts works", () => {
    const bot = makeBot();
    bot.use(autoReconnect, { maxAttempts: 3 });
    expect(bot.autoReconnect.maxAttempts).toBe(3);
  });

  it("stop and start work", () => {
    const bot = makeBot();
    bot.use(autoReconnect);
    bot.autoReconnect.stop();
    expect(bot.autoReconnect.isReconnecting()).toBe(false);
  });
});

describe("commands plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.commands", () => {
    const bot = makeBot();
    bot.use(commands);
    expect(bot.commands).toBeDefined();
    expect(bot.commands.prefix).toBe("!");
  });

  it("register and get a command", () => {
    const bot = makeBot();
    bot.use(commands);
    const handler = vi.fn();
    bot.commands.register("ping", handler);
    expect(bot.commands.get("ping")).toBeDefined();
    expect(bot.commands.commands()).toContain("ping");
  });

  it("unregister a command", () => {
    const bot = makeBot();
    bot.use(commands);
    bot.commands.register("test", vi.fn());
    bot.commands.unregister("test");
    expect(bot.commands.get("test")).toBeUndefined();
  });

  it("alias works", () => {
    const bot = makeBot();
    bot.use(commands);
    const handler = vi.fn();
    bot.commands.register("hello", handler, { alias: "hi" });
    expect(bot.commands.get("hi")).toBeDefined();
    bot.commands.unregister("hello");
    expect(bot.commands.get("hi")).toBeUndefined();
  });

  it("parse returns null for non-prefixed messages", () => {
    const bot = makeBot();
    bot.use(commands);
    expect(bot.commands.parse("hello world")).toBeNull();
  });

  it("parse returns command and args", () => {
    const bot = makeBot();
    bot.use(commands);
    const parsed = bot.commands.parse("!ping foo bar");
    expect(parsed).toEqual({ name: "ping", args: ["foo", "bar"], raw: "ping foo bar" });
  });

  it("custom prefix works", () => {
    const bot = makeBot();
    bot.use(commands, { prefix: "/" });
    expect(bot.commands.prefix).toBe("/");
  });
});

describe("macros plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.macros", () => {
    const bot = makeBot();
    bot.use(macros);
    expect(bot.macros).toBeDefined();
    expect(bot.macros.isRecording()).toBe(false);
  });

  it("record, play, remove, list", async () => {
    const bot = makeBot();
    bot.use(macros);

    bot.macros.record("testMacro");
    await bot.walkForward(1);
    await bot.jump(1, 0);
    await bot.chat("hi");
    bot.macros.stop();

    expect(bot.macros.list()).toContain("testMacro");
    expect(bot.macros.isRecording()).toBe(false);

    await bot.macros.play("testMacro");
    expect(bot.movement.walk).toHaveBeenCalled();
    expect(bot.movement.jump).toHaveBeenCalled();
    expect(bot.chatInstance.say).toHaveBeenCalledWith("hi");
  });

  it("play throws when macro not found", async () => {
    const bot = makeBot();
    bot.use(macros);
    await expect(bot.macros.play("nonexistent")).rejects.toThrow(/not found/);
  });

  it("remove a macro", async () => {
    const bot = makeBot();
    bot.use(macros);
    bot.macros.record("temp");
    bot.macros.stop();
    bot.macros.remove("temp");
    expect(bot.macros.list()).not.toContain("temp");
  });
});

describe("settings plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.settings", () => {
    const bot = makeBot();
    bot.use(settings);
    expect(bot.settings).toBeDefined();
  });

  it("get/set/has/del", () => {
    const bot = makeBot();
    bot.use(settings);

    bot.settings.set("walkspeed", 16);
    expect(bot.settings.get("walkspeed")).toBe(16);
    expect(bot.settings.has("walkspeed")).toBe(true);
    expect(bot.settings.get("missing", "fallback")).toBe("fallback");

    bot.settings.del("walkspeed");
    expect(bot.settings.has("walkspeed")).toBe(false);
  });

  it("defaults work", () => {
    const bot = makeBot();
    bot.use(settings, { defaults: { theme: "dark" } });
    expect(bot.settings.get("theme")).toBe("dark");
  });

  it("reset restores defaults", () => {
    const bot = makeBot();
    bot.use(settings, { defaults: { theme: "dark" } });
    bot.settings.set("theme", "light");
    bot.settings.reset();
    expect(bot.settings.get("theme")).toBe("dark");
  });
});

describe("entities plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.entities", () => {
    const bot = makeBot();
    bot.use(entities);
    expect(bot.entities).toBeDefined();
  });

  it("add/get/getAll/count", () => {
    const bot = makeBot();
    bot.use(entities);

    bot.entities.add({ userId: 2, username: "Player2", position: { x: 1, y: 0, z: 0 } });
    expect(bot.entities.count()).toBeGreaterThan(0);

    const p2 = bot.entities.get(2);
    expect(p2.username).toBe("Player2");

    const all = bot.entities.getAll();
    expect(all.length).toBeGreaterThan(0);
  });

  it("remove an entity", () => {
    const bot = makeBot();
    bot.use(entities);
    bot.entities.add({ userId: 3, username: "Player3" });
    bot.entities.remove(3);
    expect(bot.entities.get(3)).toBeNull();
  });
});

describe("inventory plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads via bot.use() and attaches bot.inventory", () => {
    const bot = makeBot();
    bot.use(inventory);
    expect(bot.inventory).toBeDefined();
  });

  it("add/get/getAll/equip/unequip", () => {
    const bot = makeBot();
    bot.use(inventory);

    bot.inventory.add({ id: "sword", name: "Iron Sword", type: "weapon", amount: 1 });
    expect(bot.inventory.count()).toBe(1);

    const sword = bot.inventory.get("sword");
    expect(sword.name).toBe("Iron Sword");

    bot.inventory.equip("sword");
    expect(bot.inventory.equipped().length).toBe(1);
    expect(sword.equipped).toBe(true);

    bot.inventory.unequip("sword");
    expect(sword.equipped).toBe(false);
  });

  it("remove an item", () => {
    const bot = makeBot();
    bot.use(inventory);
    bot.inventory.add({ id: "potion", name: "Health Potion" });
    bot.inventory.remove("potion");
    expect(bot.inventory.get("potion")).toBeNull();
  });
});
