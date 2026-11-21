/**
 * Auto-reconnect plugin for robloxbot — mineflayer auto-reconnect style.
 *
 * Automatically reconnects when the bot gets disconnected or encounters
 * a connection error. Respects maxAttempts and delay between retries.
 *
 * Usage:
 *   import { autoReconnect } from "robloxbot-auto-reconnect";
 *   bot.use(autoReconnect, {
 *     maxAttempts: 10,
 *     minDelay: 5000,   // ms between retries
 *     maxDelay: 60000,  // ms max between retries
 *   });
 */

export class AutoReconnectPlugin {
  constructor() {
    this.name = "autoReconnect";
  }

  apply(bot, options = {}) {
    const {
      maxAttempts = 10,
      minDelay = 5000,
      maxDelay = 60000,
      onReconnect = null,
    } = options;

    let attempts = 0;
    let timer = null;
    let reconnecting = false;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const nextDelay = () => Math.min(minDelay * Math.pow(2, attempts), maxDelay);

    const startTimer = () => {
      if (timer) clearTimeout(timer);
      reconnecting = true;
      const d = nextDelay();
      timer = setTimeout(async () => {
        timer = null;
        attempts++;
        bot.emit("reconnecting", { attempt: attempts, maxAttempts });
        try {
          await bot.start();
          attempts = 0;
          reconnecting = false;
          bot.emit("reconnected", {});
          if (onReconnect) onReconnect(bot);
        } catch (err) {
          bot.emit("reconnect-error", { error: err, attempt: attempts });
          if (attempts >= maxAttempts) {
            reconnecting = false;
            bot.emit("reconnect-failed", {});
            bot.emit("error", err);
            return;
          }
          startTimer();
        }
      }, d);
    };

    const stopTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      reconnecting = false;
    };

    // Listen for disconnect and errors
    bot.on("disconnect", () => {
      if (!reconnecting) startTimer();
    });

    bot.on("leave", () => {
      if (!reconnecting) startTimer();
    });

    bot.on("error", (err) => {
      if (err.name === "TransportError" && !reconnecting) {
        startTimer();
      }
    });

    bot.on("end", () => {
      stopTimer();
    });

    const autoReconnect = {
      name: "autoReconnect",
      maxAttempts,
      attempts: () => attempts,
      isReconnecting: () => reconnecting,
      stop: stopTimer,
      start: startTimer,
    };

    bot.autoReconnect = autoReconnect;
    bot.emit("plugin:loaded", { plugin: "autoReconnect" });
  }

  unload(bot) {
    delete bot.autoReconnect;
    bot.emit("plugin:unloaded", { plugin: "autoReconnect" });
  }
}

export const autoReconnect = new AutoReconnectPlugin();

export default AutoReconnectPlugin;
