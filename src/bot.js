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
import { createVisionService } from "./vision/index.js";
import { PluginManager } from "./plugin.js";

export class RobloxBot extends RobloxEventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.client = options.client || null;
    this._ownsClient = false;
    this.vision = options.vision || null;

    this.character = new Character();
    this.movement = null;
    this.chat = null;
    this.game = null;
    this.plugins = new PluginManager(this);
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

    this.movement = new Movement(this.client.transport, this.character, {
      simulationMode: this.options.simulationMode,
    });
    this.chat = new Chat(this.client.transport, this, {
      simulationMode: this.options.simulationMode,
    });
    this.game = new GameJoin(this.client.transport);

    // Auto-create vision service and wire map fetch to the transport.
    if (!this.vision) {
      this.vision = createVisionService(this.options.vision || {});
    }
    if (this.vision.map && this.client.transport.fetch) {
      this.vision.map.setFetch(this.client.transport.fetch.bind(this.client.transport));
    }

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
    // Handle new packet format from RakNet transport: { opcode, opcodeName, fields }
    if (packet.opcode !== undefined && packet.fields) {
      this._handleRakNetPacket(packet);
      return;
    }
    // Legacy format (for web transport or backwards compat)
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

  _handleRakNetPacket(packet) {
    const { opcodeName, fields } = packet;
    switch (opcodeName) {
      case "ROBLOX_CHARACTER_SPAWN":
        this.character.update({
          userId: fields.userId,
          username: fields.username,
          position: fields.position,
          health: fields.health,
          maxHealth: fields.maxHealth,
          spawned: true,
          alive: true,
        });
        this.emit("spawn", this.character);
        break;
      case "ROBLOX_CHAT_MESSAGE":
        this.emit("chat", {
          player: fields.username,
          message: fields.message,
        });
        break;
      case "ROBLOX_PLAYER_JOIN":
        this.emit("playerJoin", {
          userId: fields.userId,
          username: fields.username,
          displayName: fields.displayName,
        });
        break;
      case "ROBLOX_PLAYER_LEAVE":
        this.emit("playerLeave", {
          userId: fields.userId,
          reason: fields.reason,
        });
        break;
      case "ROBLOX_MOVEMENT_UPDATE":
        // Update character position if it's our own character
        if (fields.userId === this.character.userId) {
          this.character.position = fields.position;
        }
        this.emit("movement", fields);
        break;
      default:
        // Emit raw packet for plugins to handle
        this.emit("packet:raw", packet);
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
    return this.chat.say(message);
  }

  async whisper(player, message) {
    if (!this.chat) throw new Error("Bot not started. Call start() first.");
    return this.chat.whisper(player, message);
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

  /**
   * Load a plugin into the bot (mineflayer-style bot.use()).
   * @param {Function|Object} plugin - Plugin function or { apply(bot, options) }
   * @param {Object} options - Plugin options
   */
  use(plugin, options = {}) {
    return this.plugins.use(plugin, options);
  }

  /**
   * Unload a plugin by name.
   */
  unuse(name) {
    return this.plugins.unload(name);
  }

  /**
   * Check if a plugin is loaded.
   */
  hasPlugin(name) {
    return this.plugins.has(name);
  }

  /**
   * Get a loaded plugin by name.
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  get loadedPlugins() {
    return this.plugins.names;
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
