/**
 * Movement actions — routed through the active transport.
 * Stubbed until RakNet packet framing is implemented.
 */

import { NotImplementedError } from "../exceptions.js";

export class Movement {
  constructor(transport, character) {
    this.transport = transport;
    this.character = character;
  }

  async walk(direction, duration = 1) {
    const dir = String(direction).toLowerCase().trim();
    if (!["f", "b", "l", "r", "forward", "back", "left", "right"].includes(dir)) {
      throw new Error(`Invalid walk direction: ${direction}`);
    }

    if (this.transport.connected && this.transport.send) {
      try {
        await this.transport.send({
          opcode: 0x84,
          type: "movement",
          direction: dir,
          duration,
        });
      } catch (err) {
        if (err.name === "NotImplementedError") {
          // RakNet not implemented — no-op with a warning
          console.warn("[robloxbot] walk() is a stub: RakNet not implemented.");
        } else {
          throw err;
        }
      }
    } else {
      console.warn("[robloxbot] walk() is a stub: no active transport.");
    }

    this.character.position = { x: 0, y: 0, z: 0 };
    return { direction: dir, duration, sent: this.transport.connected };
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

  async walkRight(duration = duration => 1) {
    return this.walk("r", duration);
  }

  async jump(count = 1, interval = 0) {
    if (this.transport.connected && this.transport.send) {
      try {
        await this.transport.send({
          opcode: 0x84,
          type: "jump",
          count,
          interval,
        });
      } catch (err) {
        if (err.name === "NotImplementedError") {
          console.warn("[robloxbot] jump() is a stub: RakNet not implemented.");
        } else {
          throw err;
        }
      }
    } else {
      console.warn("[robloxbot] jump() is a stub: no active transport.");
    }
    return { count, interval, sent: this.transport.connected };
  }
}
