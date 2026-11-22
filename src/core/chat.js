/**
 * Chat actions — routed through the active transport.
 *
 * When RakNet isn't implemented, chat still emits local events so the
 * bot can react to its own messages. Set `simulationMode: true` in bot
 * options to skip transport entirely.
 */

export class Chat {
  constructor(transport, bot = null, options = {}) {
    this.transport = transport;
    this.bot = bot;
    this.simulationMode = options.simulationMode || false;
    this._messageHistory = [];
  }

  async say(message) {
    if (!message || typeof message !== "string") {
      throw new Error("Chat message must be a non-empty string.");
    }

    const sent = this._sendViaTransport({
      opcode: 0x90,
      userId: this.bot?.character?.userId || 0,
      username: this.bot?.character?.username || "bot",
      message,
      channel: 0,
      targetUserId: 0,
      timestamp: Date.now(),
    });

    // Local state — always recorded, with or without RakNet
    const chatEntry = { message, to: "all", timestamp: Date.now(), sent };
    this._messageHistory.push(chatEntry);

    // Emit local event so listeners can react
    if (this.bot) {
      this.bot.emit("message", { ...chatEntry });
      this.bot.emit("chat", { player: this.bot.character?.username || "bot", message });
    }

    return { message, sent, simulated: !sent };
  }

  async whisper(player, message) {
    // Whisper uses channel 2 with targetUserId
    const sent = this._sendViaTransport({
      opcode: 0x90,
      userId: this.bot?.character?.userId || 0,
      username: this.bot?.character?.username || "bot",
      message,
      channel: 2,
      targetUserId: 0, // Would need to resolve player name to userId
      timestamp: Date.now(),
    });

    const chatEntry = { message, to: player, timestamp: Date.now(), sent };
    this._messageHistory.push(chatEntry);

    if (this.bot) {
      this.bot.emit("message", { ...chatEntry });
      this.bot.emit("chat", { player: this.bot.character?.username || "bot", message });
    }

    return { message, to: player, sent, simulated: !sent };
  }

  _sendViaTransport(packet) {
    if (this.simulationMode) return false;
    if (!this.transport || !this.transport.connected || !this.transport.send) return false;

    try {
      this.transport.send(packet);
      return true;
    } catch (err) {
      if (err.name === "NotImplementedError") {
        return false;
      }
      throw err;
    }
  }

  get messageHistory() {
    return [...this._messageHistory];
  }

  clearHistory() {
    this._messageHistory = [];
  }
}

export default Chat;
