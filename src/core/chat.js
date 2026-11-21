/**
 * Chat actions — routed through the active transport.
 */

export class Chat {
  constructor(transport) {
    this.transport = transport;
  }

  async say(message) {
    if (!message || typeof message !== "string") {
      throw new Error("Chat message must be a non-empty string.");
    }

    if (this.transport.connected && this.transport.send) {
      try {
        await this.transport.send({
          opcode: 0x83,
          type: "chat",
          message,
        });
      } catch (err) {
        if (err.name === "NotImplementedError") {
          console.warn("[robloxbot] chat() is a stub: RakNet not implemented.");
        } else {
          throw err;
        }
      }
    } else {
      console.warn("[robloxbot] chat() is a stub: no active transport.");
    }

    return { message, sent: this.transport.connected };
  }

  async whisper(player, message) {
    return this.say(`/w ${player} ${message}`);
  }
}

export default Chat;
