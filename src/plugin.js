/**
 * Plugin system for robloxbot — mineflayer-style.
 *
 * A plugin is either:
 *   - A function: (bot, options) => void
 *   - An object with an apply method: { apply(bot, options) => void, name?: string }
 *
 * Plugins are loaded with bot.use(plugin, options). Each plugin can only be
 * loaded once per bot instance (by name).
 */

export class PluginError extends Error {
  constructor(message) {
    super(message);
    this.name = "PluginError";
  }
}

export class PluginManager {
  constructor(bot) {
    this.bot = bot;
    this._plugins = new Map(); // name -> plugin object
  }

  get size() {
    return this._plugins.size;
  }

  get names() {
    return Array.from(this._plugins.keys());
  }

  has(name) {
    return this._plugins.has(name);
  }

  /**
   * Load a plugin into the bot.
   *
   * @param {Function|Object} plugin - Plugin function or { apply(bot, options) }
   * @param {Object} options - Plugin options
   * @returns {Object} The loaded plugin record
   */
  use(plugin, options = {}) {
    const name = this._pluginName(plugin);

    if (this._plugins.has(name)) {
      throw new PluginError(`Plugin "${name}" is already loaded.`);
    }

    const pluginObj =
      typeof plugin === "function"
        ? { name, apply: plugin }
        : {
            ...plugin,
            name,
            apply: plugin.apply ? plugin.apply.bind(plugin) : undefined,
            unload: plugin.unload ? plugin.unload.bind(plugin) : undefined,
          };

    if (typeof pluginObj.apply !== "function") {
      throw new PluginError(
        `Plugin "${name}" must be a function or have an apply(bot, options) method.`
      );
    }

    try {
      pluginObj.apply(this.bot, options);
    } catch (err) {
      throw new PluginError(`Plugin "${name}" failed to load: ${err.message}`);
    }

    this._plugins.set(name, pluginObj);
    return pluginObj;
  }

  /**
   * Unload a plugin by name. Calls plugin.unload(bot) if defined.
   */
  unload(name) {
    const plugin = this._plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin "${name}" is not loaded.`);
    }

    if (typeof plugin.unload === "function") {
      plugin.unload(this.bot);
    }

    this._plugins.delete(name);
  }

  /**
   * Get a loaded plugin by name.
   */
  get(name) {
    return this._plugins.get(name);
  }

  _pluginName(plugin) {
    if (typeof plugin === "function") {
      return plugin.name || plugin.displayName || "anonymous";
    }
    return plugin.name || plugin.displayName || "anonymous";
  }
}

export default PluginManager;
