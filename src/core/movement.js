/**
 * Movement actions — routed through the RakNet transport.
 * Requires an active RakNet connection to the Roblox game server.
 */

export class Movement {
  constructor(transport, character) {
    this.transport = transport;
    this.character = character;
    this._position = { x: 0, y: 0, z: 0 };
    this._velocity = { x: 0, y: 0, z: 0 };
    this._studsPerSecond = 16;
  }

  _requireTransport() {
    if (!this.transport || !this.transport.connected) {
      throw new Error("Movement requires an active RakNet transport connection. Call bot.start() first.");
    }
    if (!this.transport.send) {
      throw new Error("Transport does not implement send(). Is RakNet transport active?");
    }
  }

  async walk(direction, duration = 1) {
    this._requireTransport();

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

    // Update local position first (prediction)
    this._position.x += move.x * distance;
    this._position.z += move.z * distance;
    this.character.position = { ...this._position };
    this.character.alive = true;

    // Send movement update packet (ROBLOX_MOVEMENT_UPDATE = 0x88)
    await this.transport.send({
      opcode: 0x88,
      userId: this.character.userId || 0,
      characterId: this.character.userId || 0,
      position: { x: this._position.x, y: this._position.y, z: this._position.z },
      velocity: { x: move.x * this._studsPerSecond, y: this._velocity.y, z: move.z * this._studsPerSecond },
      cframe: {
        position: { x: this._position.x, y: this._position.y, z: this._position.z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      moveDirection: { x: move.x, y: 0, z: move.z },
      isGrounded: true,
      isJumping: false,
      walkSpeed: this._studsPerSecond,
    });

    return {
      direction: dir,
      duration,
      distance,
      position: { ...this._position },
      sent: true,
      simulated: false,
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
    this._requireTransport();

    for (let i = 0; i < count; i++) {
      // Jump up
      this._position.y += 5;
      this._velocity.y = 20;
      this.character.position = { ...this._position };

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
        moveDirection: { x: 0, y: 0, z: 0 },
        isGrounded: false,
        isJumping: true,
        walkSpeed: this._studsPerSecond,
      });

      // Wait at peak
      if (i < count - 1 && interval > 0) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }

      // Land
      this._position.y -= 5;
      this._velocity.y = 0;
      this.character.position = { ...this._position };

      await this.transport.send({
        opcode: 0x88,
        userId: this.character.userId || 0,
        characterId: this.character.userId || 0,
        position: { x: this._position.x, y: this._position.y, z: this._position.z },
        velocity: { x: 0, y: 0, z: 0 },
        cframe: {
          position: { x: this._position.x, y: this._position.y, z: this._position.z },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
        moveDirection: { x: 0, y: 0, z: 0 },
        isGrounded: true,
        isJumping: false,
        walkSpeed: this._studsPerSecond,
      });
    }

    this.character.alive = true;
    return { count, interval, position: { ...this._position }, sent: true, simulated: false };
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