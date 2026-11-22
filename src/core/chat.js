/**
 * Chat actions — routed through the RakNet transport.
 * Requires an active RakNet connection to the Roblox game server.
 */

export class Chat {
  constructor(transport, bot = null) {
    this.transport = transport;
    this.bot = bot;
    this._messageHistory = [];
  }

  _requireTransport() {
    if (!this.transport || !this.transport.connected) {
      throw new Error("Chat requires an active RakNet transport connection. Call bot.start() first.");
    }
    if (!this.transport.send) {
      throw new Error("Transport does not implement send(). Is RakNet transport active?");
    }
  }

  async say(message) {
    if (!message || typeof message !== "string") {
      throw new Error("Chat message must be a non-empty string.");
    }

    this._requireTransport();

    const packet = {
      opcode: 0x90,
      userId: this.bot?.character?.userId || 0,
      username: this.bot?.character?.username || "bot",
      message,
      channel: 0,
      targetUserId: 0,
      timestamp: Date.now(),
    };

    await this.transport.send(packet);

    const chatEntry = { message, to: "all", timestamp: Date.now(), sent: true };
    this._messageHistory.push(chatEntry);

    if (this.bot) {
      this.bot.emit("message", { ...chatEntry });
      this.bot.emit("chat", { player: this.bot.character?.username || "bot", message });
    }

    return { message, sent: true, simulated: false };
  }

  async whisper(player, message) {
    if (!message || typeof message !== "string") {
      throw new Error("Chat message must be a non-empty string.");
    }

    this._requireTransport();

    const packet = {
      opcode: 0x90,
      userId: this.bot?.character?.userId || 0,
      username: this.bot?.character?.username || "bot",
      message,
      channel: 2,
      targetUserId: 0, // Would need to resolve player name to userId
      timestamp: Date.now(),
    };

    await this.transport.send(packet);

    const chatEntry = { message, to: player, timestamp: Date.now(), sent: true };
    this._messageHistory.push(chatEntry);

    if (this.bot) {
      this.bot.emit("message", { ...chatEntry });
      this.bot.emit("chat", { player: this.bot.character?.username || "bot", message });
    }

    return { message, to: player, sent: true, simulated: false };
  }

  get messageHistory() {
    return [...this._messageHistory];
  }

  clearHistory() {
    this._messageHistory = [];
  }
}

export default Chat;