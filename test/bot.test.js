import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RobloxBot } from "../src/index.js";

class MockTransport {
  constructor() {
    this.connected = true;
    this.sent = [];
    this.listeners = {};
  }
  async connect(opts) {
    this.connected = true;
    return { authenticated: true, method: "mock" };
  }
  async disconnect() {
    this.connected = false;
  }
  send(packet) {
    this.sent.push(packet);
    return Promise.resolve();
  }
  on(event, listener) {
    this.listeners[event] = listener;
    return () => {};
  }
  once(event, listener) {
    this.listeners[event] = listener;
    return () => {};
  }
  off() {}
  emit(event, data) {
    if (this.listeners[event]) this.listeners[event](data);
  }
  async getFriendByUsername(username) {
    return this._friends?.find(
      (f) => f.username?.toLowerCase() === String(username).toLowerCase()
    );
  }
  async getFriends() {
    return this._friends || [];
  }
  async joinUser(userId) {
    return { userId, method: "uri" };
  }
}

function makeBot() {
  const transport = new MockTransport();
  const client = {
    transport,
    connected: true,
    disconnect: async () => {},
  };
  const bot = new RobloxBot({ client });
  bot.client = client;
  bot._started = true;
  bot.character = { username: "TestBot", spawned: true, alive: true, reset: () => {} };
  bot.movement = {
    walk: vi.fn().mockResolvedValue({}),
    jump: vi.fn().mockResolvedValue({}),
  };
  bot.chat = {
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

  transport._friends = [
    { id: 1, username: "FriendOne" },
    { id: 2, username: "FriendTwo" },
  ];
  return { bot, transport };
}

describe("RobloxBot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits join event", () => {
    const { bot } = makeBot();
    const spy = vi.fn();
    bot.on("join", spy);
    bot.emit("join");
    expect(spy).toHaveBeenCalled();
  });

  it("chat delegates to chat.say", async () => {
    const { bot } = makeBot();
    await bot.chat.say("hello");
    expect(bot.chat.say).toHaveBeenCalledWith("hello");
  });

  it("walk delegates to movement.walk", async () => {
    const { bot } = makeBot();
    await bot.walk("f", 2);
    expect(bot.movement.walk).toHaveBeenCalledWith("f", 2);
  });

  it("walkForward calls walk with f", async () => {
    const { bot } = makeBot();
    await bot.walkForward(2);
    expect(bot.movement.walk).toHaveBeenCalledWith("f", 2);
  });

  it("walkBack calls walk with b", async () => {
    const { bot } = makeBot();
    await bot.walkBack(2);
    expect(bot.movement.walk).toHaveBeenCalledWith("b", 2);
  });

  it("walkLeft calls walk with l", async () => {
    const { bot } = makeBot();
    await bot.walkLeft(2);
    expect(bot.movement.walk).toHaveBeenCalledWith("l", 2);
  });

  it("walkRight calls walk with r", async () => {
    const { bot } = makeBot();
    await bot.walkRight(2);
    expect(bot.movement.walk).toHaveBeenCalledWith("r", 2);
  });

  it("jump delegates to movement.jump", async () => {
    const { bot } = makeBot();
    await bot.jump(3, 0.5);
    expect(bot.movement.jump).toHaveBeenCalledWith(3, 0.5);
  });

  it("joinGame delegates to game.joinGame", async () => {
    const { bot } = makeBot();
    await bot.joinGame(12345);
    expect(bot.game.joinGame).toHaveBeenCalledWith(12345);
  });

  it("joinUser delegates to game.joinUser", async () => {
    const { bot } = makeBot();
    await bot.joinUser(67890);
    expect(bot.game.joinUser).toHaveBeenCalledWith(67890);
  });

  it("joinServer delegates to game.joinServer", async () => {
    const { bot } = makeBot();
    await bot.joinServer(12345, "job-1");
    expect(bot.game.joinServer).toHaveBeenCalledWith(12345, "job-1");
  });

  it("leaveGame delegates to game.leaveGame", async () => {
    const { bot } = makeBot();
    await bot.leaveGame();
    expect(bot.game.leaveGame).toHaveBeenCalled();
  });

  it("findServers delegates to game.findServers", async () => {
    const { bot } = makeBot();
    await bot.findServers(12345);
    expect(bot.game.findServers).toHaveBeenCalledWith(12345, {});
  });

  it("joinFriend delegates to game.joinFriend", async () => {
    const { bot } = makeBot();
    await bot.joinFriend("FriendOne");
    expect(bot.game.joinFriend).toHaveBeenCalledWith("FriendOne");
  });

  it("listFriends delegates to game.listFriends", async () => {
    const { bot } = makeBot();
    await bot.listFriends();
    expect(bot.game.listFriends).toHaveBeenCalled();
  });
});
