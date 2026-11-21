/**
 * RobloxClient — owns a Transport and handles authentication.
 *
 * Reads credentials from .env (username/password or ROBLOSECURITY cookie).
 */

import { AuthError } from "./exceptions.js";
import { loadEnv } from "./utils.js";
import { WebTransport } from "./transport/web.js";
import { RakNetTransport } from "./transport/raknet.js";

export class RobloxClient {
  constructor(options = {}) {
    this.options = options;
    this.env = loadEnv(options.envPath || ".env");
    this.cookie =
      options.cookie ||
      this.env.ROBLOSECURITY ||
      process.env.ROBLOSECURITY ||
      null;
    this.username = options.username || this.env.ROBLOX_USERNAME || process.env.ROBLOX_USERNAME || null;
    this.password = options.password || this.env.ROBLOX_PASSWORD || process.env.ROBLOX_PASSWORD || null;

    this.transport = options.transport || null;
    this._autoTransport = null;
  }

  get connected() {
    return this.transport ? this.transport.connected : false;
  }

  async connect() {
    if (this.transport) {
      await this.transport.connect({
        cookie: this.cookie,
        username: this.username,
        password: this.password,
      });
      return this.transport;
    }

    // Default: try RakNet, fall back to web
    const raknet = new RakNetTransport({
      cookie: this.cookie,
      username: this.username,
      password: this.password,
    });
    try {
      await raknet.connect({
        cookie: this.cookie,
        username: this.username,
        password: this.password,
      });
      this.transport = raknet;
      this._autoTransport = raknet;
      return raknet;
    } catch (err) {
      if (err.name === "NotImplementedError") {
        // Fall back to web transport
        const web = new WebTransport({
          cookie: this.cookie,
          username: this.username,
          password: this.password,
        });
        await web.connect({
          cookie: this.cookie,
          username: this.username,
          password: this.password,
        });
        this.transport = web;
        this._autoTransport = web;
        return web;
      }
      throw err;
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.disconnect();
    }
  }
}

export default RobloxClient;
