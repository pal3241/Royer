/**
 * Macro/sequence plugin for robloxbot.
 *
 * Record and play back sequences of actions (walk, jump, chat, wait).
 * Useful for repetitive tasks.
 *
 * Usage:
 *   import { macros } from "robloxbot-macros";
 *   bot.use(macros);
 *
 *   bot.macros.record("greeting");
 *   await bot.walkForward(2);
 *   await bot.chat("Hello!");
 *   await bot.jump();
 *   bot.macros.stop();
 *
 *   await bot.macros.play("greeting");
 */

export class MacrosPlugin {
  constructor() {
    this.name = "macros";
  }

  apply(bot, options = {}) {
    const {
      maxMacros = 100,
    } = options;

    const macros = new Map();
    let recording = null;

    const record = (name) => {
      if (macros.size >= maxMacros && !macros.has(name)) {
        throw new Error(`Max macros (${maxMacros}) reached.`);
      }
      recording = { name, steps: [], startTime: Date.now() };
    };

    const stop = () => {
      if (!recording) return null;
      const macro = recording;
      recording = null;
      macros.set(macro.name, macro);
      return macro;
    };

    const play = async (name, options = {}) => {
      const macro = macros.get(name);
      if (!macro) throw new Error(`Macro not found: ${name}`);

      const { repeat = 1 } = options;

      for (let r = 0; r < repeat; r++) {
        for (const step of macro.steps) {
          switch (step.action) {
            case "walk":
              await bot.walk(step.direction, step.duration);
              break;
            case "walkForward":
              await bot.walkForward(step.duration);
              break;
            case "walkBack":
              await bot.walkBack(step.duration);
              break;
            case "walkLeft":
              await bot.walkLeft(step.duration);
              break;
            case "walkRight":
              await bot.walkRight(step.duration);
              break;
            case "jump":
              await bot.jump(step.count, step.interval);
              break;
            case "chat":
              await bot.chat(step.message);
              break;
            case "whisper":
              await bot.whisper(step.player, step.message);
              break;
            case "wait":
              await new Promise((resolve) => setTimeout(resolve, step.duration * 1000));
              break;
            default:
              bot.emit("error", new Error(`Unknown macro action: ${step.action}`));
          }
        }
      }
    };

    const remove = (name) => macros.delete(name);

    const list = () => Array.from(macros.keys());

    const get = (name) => macros.get(name);

    // Hook into bot actions to record while recording
    const _safeWrap = (obj, methodName, recordAction, recordFields) => {
      const original = obj[methodName];
      if (typeof original !== "function") return;
      obj[methodName] = async (...args) => {
        const result = await original.apply(obj, args);
        if (recording) {
          recording.steps.push({
            action: recordAction,
            ...recordFields(...args),
            timestamp: Date.now(),
          });
        }
        return result;
      };
    };

    _safeWrap(bot, "walk", "walk", (direction, duration) => ({ direction, duration }));
    _safeWrap(bot, "jump", "jump", (count, interval) => ({ count, interval }));
    _safeWrap(bot, "walkForward", "walkForward", (duration) => ({ duration }));
    _safeWrap(bot, "walkBack", "walkBack", (duration) => ({ duration }));
    _safeWrap(bot, "walkLeft", "walkLeft", (duration) => ({ duration }));
    _safeWrap(bot, "walkRight", "walkRight", (duration) => ({ duration }));

    // Chat may be a function (bot.chat) or an object (bot.chat.say / bot.chat.whisper)
    if (typeof bot.chat === "function") {
      _safeWrap(bot, "chat", "chat", (message) => ({ message }));
    } else if (bot.chat && typeof bot.chat.say === "function") {
      _safeWrap(bot.chat, "say", "chat", (message) => ({ message }));
    }
    if (bot.chat && typeof bot.chat.whisper === "function") {
      _safeWrap(bot.chat, "whisper", "whisper", (player, message) => ({ player, message }));
    }

    const macrosPlugin = {
      name: "macros",
      record,
      stop,
      play,
      remove,
      list,
      get,
      isRecording: () => recording !== null,
    };

    bot.macros = macrosPlugin;
    bot.emit("plugin:loaded", { plugin: "macros" });
  }

  unload(bot) {
    // Restore original methods if they exist
    delete bot.macros;
    bot.emit("plugin:unloaded", { plugin: "macros" });
  }
}

export const macros = new MacrosPlugin();

export default MacrosPlugin;
