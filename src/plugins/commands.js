/**
 * Command framework plugin for robloxbot — mineflayer commands style.
 *
 * Register commands and handle chat messages that start with a prefix.
 * Supports command aliases, argument parsing, and cooldowns.
 *
 * Usage:
 *   import { commands } from "robloxbot-commands";
 *   bot.use(commands, { prefix: "!" });
 *
 *   bot.commands.register("say", (args, msg) => bot.chat(args.join(" ")));
 *   bot.commands.register("ping", () => bot.chat("pong!"));
 *
 * Then in chat: "!ping" or "!say hello world"
 */

export class CommandsPlugin {
  constructor() {
    this.name = "commands";
  }

  apply(bot, options = {}) {
    const {
      prefix = "!",
      ignoreBot = true,
      cooldownMs = 0,
    } = options;

    const commands = new Map();
    const aliases = new Map();
    const lastUse = new Map();

    const register = (name, handler, opts = {}) => {
      commands.set(name.toLowerCase(), { handler, ...opts });
      if (opts.alias) {
        aliases.set(opts.alias.toLowerCase(), name.toLowerCase());
      }
    };

    const unregister = (name) => {
      const key = name.toLowerCase();
      commands.delete(key);
      for (const [alias, cmdName] of aliases) {
        if (cmdName === key) aliases.delete(alias);
      }
    };

    const get = (name) => {
      const key = name.toLowerCase();
      return commands.get(key) || (aliases.get(key) ? commands.get(aliases.get(key)) : undefined);
    };

    const parse = (message) => {
      if (!message.startsWith(prefix)) return null;
      const withoutPrefix = message.slice(prefix.length).trim();
      if (!withoutPrefix) return null;
      const parts = withoutPrefix.split(/\s+/);
      const name = parts[0].toLowerCase();
      const args = parts.slice(1);
      return { name, args, raw: withoutPrefix };
    };

    const handleChat = (msg) => {
      if (ignoreBot && msg.player === bot.character?.username) return;
      const parsed = parse(msg.message);
      if (!parsed) return;

      const cmd = get(parsed.name);
      if (!cmd) return;

      // Cooldown check
      const now = Date.now();
      const key = parsed.name;
      if (cooldownMs > 0 && lastUse.has(key)) {
        const elapsed = now - lastUse.get(key);
        if (elapsed < cooldownMs) return;
      }
      lastUse.set(key, now);

      try {
        cmd.handler(parsed.args, msg);
      } catch (err) {
        bot.emit("error", err);
      }
    };

    bot.on("chat", handleChat);

    const commandFramework = {
      name: "commands",
      prefix,
      register,
      unregister,
      get,
      parse,
      commands: () => Array.from(commands.keys()),
    };

    bot.commands = commandFramework;
    bot.emit("plugin:loaded", { plugin: "commands" });
  }

  unload(bot) {
    delete bot.commands;
    bot.emit("plugin:unloaded", { plugin: "commands" });
  }
}

export const commands = new CommandsPlugin();

export default CommandsPlugin;
