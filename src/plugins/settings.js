/**
 * Settings plugin for robloxbot.
 *
 * Key-value settings with persistence to localStorage (browser) or a file
 * (Node.js via a custom save/load function).
 *
 * Usage:
 *   import { settings } from "robloxbot-settings";
 *   bot.use(settings);
 *
 *   bot.settings.set("walkspeed", 16);
 *   bot.settings.get("walkspeed"); // 16
 *   bot.settings.save();
 *   bot.settings.load();
 */

export class SettingsPlugin {
  constructor() {
    this.name = "settings";
  }

  apply(bot, options = {}) {
    const {
      defaults = {},
      saveFn = null,
      loadFn = null,
    } = options;

    const store = new Map(Object.entries(defaults));

    const get = (key, fallback) => {
      if (store.has(key)) return store.get(key);
      return fallback;
    };

    const set = (key, value) => {
      store.set(key, value);
      return value;
    };

    const has = (key) => store.has(key);

    const del = (key) => store.delete(key);

    const all = () => Object.fromEntries(store);

    const reset = () => {
      store.clear();
      for (const [k, v] of Object.entries(defaults)) {
        store.set(k, v);
      }
    };

    const save = async () => {
      if (saveFn) {
        await saveFn(all());
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem("robloxbot-settings", JSON.stringify(all()));
      }
    };

    const load = async () => {
      let data = {};
      if (loadFn) {
        data = await loadFn();
      } else if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem("robloxbot-settings");
        data = raw ? JSON.parse(raw) : {};
      }
      store.clear();
      for (const [k, v] of Object.entries(data)) {
        store.set(k, v);
      }
    };

    const settings = {
      name: "settings",
      get, set, has, del, all, reset, save, load,
    };

    bot.settings = settings;
    bot.emit("plugin:loaded", { plugin: "settings" });
  }

  unload(bot) {
    delete bot.settings;
    bot.emit("plugin:unloaded", { plugin: "settings" });
  }
}

export const settings = new SettingsPlugin();

export default SettingsPlugin;
