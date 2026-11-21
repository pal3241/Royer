/**
 * Entity tracking stub for robloxbot.
 *
 * Ceiling / documented limitation:
 *   Real entity tracking requires RakNet to receive server position updates
 *   for other players. Without RakNet, this only tracks the bot itself.
 *
 *   To make this real, implement RakNet packet handling for player join,
 *   player leave, and character movement packets, then populate entities
 *   from those packets.
 */

export class Entity {
  constructor(data = {}) {
    this.userId = data.userId || null;
    this.username = data.username || null;
    this.position = data.position || { x: 0, y: 0, z: 0 };
    this.health = data.health || 100;
    this.maxHealth = data.maxHealth || 100;
    this.alive = data.alive || false;
    this.spawned = data.spawned || false;
  }
}

export class EntitiesPlugin {
  constructor() {
    this.name = "entities";
  }

  apply(bot, options = {}) {
    const entities = new Map();

    const add = (data) => {
      const entity = new Entity(data);
      entities.set(entity.userId || entity.username, entity);
      bot.emit("entityAdded", entity);
      return entity;
    };

    const remove = (userIdOrUsername) => {
      const entity = entities.get(userIdOrUsername);
      if (entity) {
        entities.delete(userIdOrUsername);
        bot.emit("entityRemoved", entity);
        return entity;
      }
      return null;
    };

    const get = (userIdOrUsername) => entities.get(userIdOrUsername) || null;

    const getAll = () => Array.from(entities.values());

    const updatePosition = (userIdOrUsername, position) => {
      const entity = entities.get(userIdOrUsername);
      if (entity) {
        entity.position = { ...position };
        bot.emit("entityMoved", entity);
      }
    };

    // Track the bot itself as an entity
    add({
      userId: bot.character?.userId,
      username: bot.character?.username,
      position: bot.character.position,
      health: bot.character.health,
      maxHealth: bot.character.maxHealth,
      alive: bot.character.alive,
      spawned: bot.character.spawned,
    });

    bot.on("spawn", (char) => {
      add({
        userId: char.userId,
        username: char.username,
        position: char.position,
        health: char.health,
        maxHealth: char.maxHealth,
        alive: char.alive,
        spawned: char.spawned,
      });
    });

    bot.on("playerJoin", (data) => {
      add({
        userId: data.userId,
        username: data.username,
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        maxHealth: 100,
        alive: true,
        spawned: true,
      });
    });

    bot.on("playerLeave", (data) => {
      remove(data.userId || data.username);
    });

    const entitiesPlugin = {
      name: "entities",
      add, remove, get, getAll,
      Entity,
      count: () => entities.size,
    };

    bot.entities = entitiesPlugin;
    bot.emit("plugin:loaded", { plugin: "entities" });
  }

  unload(bot) {
    delete bot.entities;
    bot.emit("plugin:unloaded", { plugin: "entities" });
  }
}

export const entities = new EntitiesPlugin();

export default EntitiesPlugin;
