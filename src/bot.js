/**
 * RobloxBot — mineflayer-style high-level bot.
 *
 * Wraps RobloxClient + core modules, emits mineflayer-style events.
 */

import { RobloxEventEmitter } from "./events.js";
import { Character } from "./core/character.js";
import { Movement } from "./core/movement.js";
import { Chat } from "./core/chat.js";
import { GameJoin } from "./core/game_join.js";

export class RobloxBot extends RobloxEventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.client = options.client || null;
    this._ownsClient = false;

    this.character = new Character();
    this.movement = null;
    this.chat = null;
    this.game = null;
    this._started = false;
  }

  async start() {
    if (!this.client) {
      const { RobloxClient } = await import("./client.js");
      this.client = new RobloxClient({
        envPath: this.options.envPath,
        cookie: this.options.cookie,
        username: this.options.username,
        password: this.options.password,
      });
      this._ownsClient = true;
    }

    await this.client.connect();

    this.movement = new Movement(this.client.transport, this.character);
    this.chat = new Chat(this.client.transport);
    this.game = new GameJoin(this.client.transport);

    this._bindTransportEvents();
    this._started = true;

    this.emit("join");
    return this;
  }

  _bindTransportEvents() {
    const t = this.client.transport;
    if (!t || typeof t.on !== "function") return;

    t.on("error", (err) => this.emit("error", err));
    t.on("disconnect", () => {
      this.character.reset();
      this.emit("leave");
    });
    t.on("packet", (packet) => {
      this._handlePacket(packet);
    });
  }

  _handlePacket(packet) {
    switch (packet.type) {
      case "spawn":
        this.character.update({ ...packet.data, spawned: true, alive: true });
        this.emit("spawn", this.character);
        break;
      case "chat":
        this.emit("chat", {
          player: packet.data.player,
          message: packet.data.message,
        });
        break;
      case "playerJoin":
        this.emit("playerJoin", packet.data);
        break;
      case "playerLeave":
        this.emit("playerLeave", packet.data);
        break;
      default:
        break;
    }
  }

  async stop() {
    if (this.client) {
      await this.client.disconnect();
    }
    this._started = false;
    this.emit("end");
  }

  async chat(message) {
    if (!this.chat) throw new Error("Bot not started. Call start() first.");
    const result = await this.chat.say(message);
    this.emit("message", { message, to: "all", ...result });
    return result;
  }

  async whisper(player, message) {
    if (!this.chat) throw new Error("Bot not started. Call start() first.");
    const result = await this.chat.whisper(player, message);
    this.emit("message", { message, to: player, ...result });
    return result;
  }

  async walk(direction, duration = 1) {
    if (!this.movement) throw new Error("Bot not started. Call start() first.");
    return this.movement.walk(direction, duration);
  }

  async walkForward(duration = 1) {
    return this.walk("f", duration);
  }

  async walkBack(duration = 1) {
    return this.walk("b", duration);
  }

  async walkLeft(duration = 1) {
    return this.walk("l", duration);
  }

  async walkRight(duration = 1) {
    return this.walk("r", duration);
  }

  async jump(count = 1, interval = 0) {
    if (!this.movement) throw new Error("Bot not started. Call start() first.");
    return this.movement.jump(count, interval);
  }

  async joinGame(gameId) {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.joinGame(gameId);
  }

  async joinUser(userId) {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.joinUser(userId);
  }

  async joinFriend(username) {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.joinFriend(username);
  }

  async listFriends() {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.listFriends();
  }

  async joinServer(gameId, jobId) {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.joinServer(gameId, jobId);
  }

  async leaveGame() {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.leaveGame();
  }

  async findServers(gameId, options = {}) {
    if (!this.game) throw new Error("Bot not started. Call start() first.");
    return this.game.findServers(gameId, options);
  }

  get isConnected() {
    return this.client ? this.client.connected : false;
  }
}

export default RobloxBot;
