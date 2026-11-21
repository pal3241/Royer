/**
 * Character state tracking.
 */

export class Character {
  constructor() {
    this.username = null;
    this.userId = null;
    this.health = 100;
    this.maxHealth = 100;
    this.position = { x: 0, y: 0, z: 0 };
    this.health = 100;
    this.alive = false;
    this.spawned = false;
  }

  update(data = {}) {
    if (data.username !== undefined) this.username = data.username;
    if (data.userId !== undefined) this.userId = data.userId;
    if (data.health !== undefined) this.health = data.health;
    if (data.maxHealth !== undefined) this.maxHealth = data.maxHealth;
    if (data.position !== undefined) this.position = data.position;
    if (data.alive !== undefined) this.alive = data.alive;
    if (data.spawned !== undefined) this.spawned = data.spawned;
  }

  reset() {
    this.username = null;
    this.userId = null;
    this.health = 100;
    this.maxHealth = 100;
    this.position = { x: 0, y: 0, z: 0 };
    this.alive = false;
    this.spawned = false;
  }

  get isSpawned() {
    return this.spawned && this.alive;
  }
}

export default Character;
