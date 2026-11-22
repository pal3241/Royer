/**
 * Movement actions — routed through the active transport.
 *
 * When RakNet isn't implemented (the common case today), movement still
 * updates the bot's local character state so position tracking works.
 * Set `simulationMode: true` in bot options to skip transport entirely
 * and run purely locally (useful for testing on Termux without RakNet).
 */

export class Movement {
  constructor(transport, character, options = {}) {
    this.transport = transport;
    this.character = character;
    this.simulationMode = options.simulationMode || false;
    this._position = { x: 0, y: 0, z: 0 };
    this._velocity = { x: 0, y: 0, z: 0 };

    // Approximate studs per second for each direction (Roblox default walkspeed ~16 studs/s)
    this._studsPerSecond = 16;
  }

  async walk(direction, duration = 1) {
    const dir = String(direction).toLowerCase().trim();
    if (!["f", "b", "l", "r", "forward", "back", "left", "right"].includes(dir)) {
      throw new Error(`Invalid walk direction: ${direction}`);
    }

    const dirMap = {
      f: { x: 0, z: -1 },
      b: { x: 0, z: 1 },
      l: { x: -1, z: 0 },
      r: { x: 1, z: 0 },
      forward: { x: 0, z: -1 },
      back: { x: 0, z: 1 },
      left: { x: -1, z: 0 },
      right: { x: 1, z: 0 },
    };

    const move = dirMap[dir];
    const distance = this._studsPerSecond * duration;

    // Try to send via transport if connected and not in simulation mode
    if (!this.simulationMode && this.transport && this.transport.connected && this.transport.send) {
      try {
        // Send movement update packet (ROBLOX_MOVEMENT_UPDATE = 0x88)
        await this.transport.send({
          opcode: 0x88,
          userId: this.character.userId || 0,
          characterId: this.character.userId || 0,
          position: { x: this._position.x, y: this._position.y, z: this._position.z },
          velocity: { x: this._velocity.x, y: this._velocity.y, z: this._velocity.z },
          cframe: {
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          moveDirection: { x: move.x, y: 0, z: move.z },
          isGrounded: true,
          isJumping: false,
          walkSpeed: this._studsPerSecond,
        });
      } catch (err) {
        if (err.name === "NotImplementedError") {
          // RakNet not implemented — fall back to local simulation
          console.warn("[robloxbot] walk() falling back to local simulation: RakNet not implemented.");
        } else {
          throw err;
        }
      }
    } else if (!this.simulationMode) {
      console.warn("[robloxbot] walk() running in local simulation: no active transport.");
    }

    // Update local character state (works with or without RakNet)
    this._position.x += move.x * distance;
    this._position.z += move.z * distance;
    this.character.position = { ...this._position };
    this.character.alive = true;

    return {
      direction: dir,
      duration,
      distance,
      position: { ...this._position },
      sent: !this.simulationMode && this.transport ? this.transport.connected : false,
      simulated: this.simulationMode || !this.transport?.connected,
    };
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
    if (!this.simulationMode && this.transport && this.transport.connected && this.transport.send) {
      try {
        // Send movement update with jump state
        for (let i = 0; i < count; i++) {
          await this.transport.send({
            opcode: 0x88,
            userId: this.character.userId || 0,
            characterId: this.character.userId || 0,
            position: { x: this._position.x, y: this._position.y + 5, z: this._position.z },
            velocity: { x: 0, y: 20, z: 0 },
            cframe: {
              position: { x: this._position.x, y: this._position.y + 5, z: this._position.z },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            moveDirection: { x: 0, y: 0, z: 0 },
            isGrounded: false,
            isJumping: true,
            walkSpeed: this._studsPerSecond,
          });
          if (i < count - 1 && interval > 0) {
            await new Promise((resolve) => setTimeout(resolve, interval * 1000));
          }
        }
      } catch (err) {
        if (err.name === "NotImplementedError") {
          console.warn("[robloxbot] jump() falling back to local simulation: RakNet not implemented.");
        } else {
          throw err;
        }
      }
    } else if (!this.simulationMode) {
      console.warn("[robloxbot] jump() running in local simulation: no active transport.");
    }

    // Local jump simulation: briefly raise Y position then return
    const jumpHeight = 5; // studs
    for (let i = 0; i < count; i++) {
      this._position.y += jumpHeight;
      this.character.position = { ...this._position };
      if (i < count - 1 && interval > 0) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
      this._position.y -= jumpHeight;
      this.character.position = { ...this._position };
    }
    this.character.alive = true;

    return { count, interval, position: { ...this._position }, simulated: this.simulationMode || !this.transport?.connected };
  }

  get position() {
    return { ...this._position };
  }

  setPosition(x, y, z) {
    this._position = { x, y, z };
    this.character.position = { ...this._position };
  }

  reset() {
    this._position = { x: 0, y: 0, z: 0 };
    this.character.position = { ...this._position };
  }
}

export default Movement;
