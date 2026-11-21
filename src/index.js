/**
 * Public API exports.
 */

export { RobloxBot } from "./bot.js";
export { RobloxClient } from "./client.js";
export { Transport } from "./transport/base.js";
export { WebTransport } from "./transport/web.js";
export {
  RakNetTransport,
  encodePacket,
  decodePacket,
  isPacketDefined,
} from "./transport/raknet.js";
export { Character } from "./core/character.js";
export { Movement } from "./core/movement.js";
export { Chat } from "./core/chat.js";
export { GameJoin } from "./core/game_join.js";
export {
  VisionDetector,
  VLM,
  MapInject,
  createVisionService,
} from "./vision/index.js";
export {
  RobloxError,
  AuthError,
  TransportError,
  NotImplementedError,
} from "./exceptions.js";

export { PluginManager, PluginError } from "./plugin.js";
export { pathfinding, PathfindingPlugin } from "./plugins/pathfinding.js";
export { visionPathfinding, VisionPathfindingPlugin } from "./plugins/vision-pathfinding.js";
export { autoReconnect, AutoReconnectPlugin } from "./plugins/auto-reconnect.js";
export { commands, CommandsPlugin } from "./plugins/commands.js";
export { macros, MacrosPlugin } from "./plugins/macros.js";
export { settings, SettingsPlugin } from "./plugins/settings.js";
export { entities, EntitiesPlugin, Entity } from "./plugins/entities.js";
export { inventory, InventoryPlugin, InventoryItem } from "./plugins/inventory.js";
