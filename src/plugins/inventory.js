/**
 * Inventory stub for robloxbot.
 *
 * Ceiling / documented limitation:
 *   Real inventory access requires RakNet or Roblox's inventory web API
 *   to fetch equipped items, tools, and backpack contents.
 *
 *   Without RakNet, this only tracks items you manually add.
 *   To make this real, implement either:
 *     1. RakNet inventory packets, or
 *     2. Roblox inventory web API calls (requires authentication)
 */

export class InventoryItem {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || null;
    this.type = data.type || "unknown";
    this.amount = data.amount || 1;
    this.equipped = data.equipped || false;
  }
}

export class InventoryPlugin {
  constructor() {
    this.name = "inventory";
  }

  apply(bot, options = {}) {
    const items = new Map();

    const add = (data) => {
      const item = new InventoryItem(data);
      items.set(item.id || item.name, item);
      bot.emit("inventoryAdded", item);
      return item;
    };

    const remove = (idOrName) => {
      const item = items.get(idOrName);
      if (item) {
        items.delete(idOrName);
        bot.emit("inventoryRemoved", item);
        return item;
      }
      return null;
    };

    const get = (idOrName) => items.get(idOrName) || null;

    const getAll = () => Array.from(items.values());

    const equip = (idOrName) => {
      // Unequip all first
      for (const item of items.values()) {
        item.equipped = false;
      }
      const item = items.get(idOrName);
      if (item) {
        item.equipped = true;
        bot.emit("inventoryEquipped", item);
      }
      return item;
    };

    const unequip = (idOrName) => {
      const item = items.get(idOrName);
      if (item) {
        item.equipped = false;
        bot.emit("inventoryUnequipped", item);
      }
      return item;
    };

    const equipped = () => Array.from(items.values()).filter((i) => i.equipped);

    const inventoryPlugin = {
      name: "inventory",
      add, remove, get, getAll, equip, unequip, equipped,
      InventoryItem,
      count: () => items.size,
    };

    bot.inventory = inventoryPlugin;
    bot.emit("plugin:loaded", { plugin: "inventory" });
  }

  unload(bot) {
    delete bot.inventory;
    bot.emit("plugin:unloaded", { plugin: "inventory" });
  }
}

export const inventory = new InventoryPlugin();

export default InventoryPlugin;
