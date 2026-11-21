/**
 * Web transport — real implementation using the Roblox web API.
 *
 * Works today for authenticating and joining games/servers/users.
 * Falls back gracefully when RakNet is unavailable.
 */

import axios from "axios";
import { Transport } from "./base.js";
import { AuthError, TransportError } from "../exceptions.js";
import { buildRobloxUri } from "../utils.js";

const BASE_URL = "https://www.roblox.com";
const GAMES_API = "https://games.roblox.com/v1";
const FRIENDS_API = "https://friends.roblox.com/v1";

export class WebTransport extends Transport {
  constructor(options = {}) {
    super();
    this.cookie = options.cookie || null;
    this.username = options.username || null;
    this.password = options.password || null;
    this._client = axios.create({
      baseURL: BASE_URL,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) robloxbot/0.1.0",
      },
      withCredentials: true,
    });
  }

  get connected() {
    return !!this.cookie;
  }

  async connect(options = {}) {
    const cookie = options.cookie || this.cookie;
    const username = options.username || this.username;
    const password = options.password || this.password;

    if (cookie) {
      this.cookie = cookie;
      this._client.defaults.headers.common["Cookie"] = `.ROBLOSECURITY=${cookie}`;
      this._connected = true;
      return { authenticated: true, method: "cookie" };
    }

    if (username && password) {
      return this._login(username, password);
    }

    throw new AuthError(
      "No credentials provided. Set ROBLOSECURITY or ROBLOX_USERNAME/ROBLOX_PASSWORD."
    );
  }

  async _login(username, password) {
    try {
      const res = await this._client.post("/api/login", {
        username,
        password,
      });

      const setCookie = res.headers["set-cookie"];
      if (setCookie) {
        const match = setCookie.find((c) => c.startsWith(".ROBLOSECURITY="));
        if (match) {
          this.cookie = match.split(";")[0].split("=")[1];
          this._client.defaults.headers.common[
            "Cookie"
          ] = `.ROBLOSECURITY=${this.cookie}`;
          this._connected = true;
          return { authenticated: true, method: "login" };
        }
      }

      throw new AuthError("Login succeeded but no .ROBLOSECURITY cookie was set.");
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err.response && err.response.status === 403) {
        throw new AuthError(
          "Login failed — CAPTCHA, email verification, or 2FA required. " +
            "Supply ROBLOSECURITY directly in .env as a workaround."
        );
      }
      throw new TransportError(`Login request failed: ${err.message}`);
    }
  }

  async disconnect() {
    this.cookie = null;
    this._connected = false;
  }

  send(packet) {
    throw new NotImplementedError("WebTransport.send — use joinGame/joinServer instead.");
  }

  on(event, listener) {
    // Web transport is request/response, not event-driven.
    return () => {};
  }

  once(event, listener) {
    return this.on(event, listener);
  }

  off(event, listener) {
    return;
  }

  /**
   * Fetch-compatible helper for MapInject and other consumers.
   * Wraps the authenticated axios instance and returns a Response-like object.
   */
  async fetch(url, init = {}) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const method = (init.method || "GET").toUpperCase();
    try {
      let res;
      if (method === "GET") {
        res = await this._client.get(url, {
          params: init.params || undefined,
          headers: init.headers || undefined,
        });
      } else if (method === "POST") {
        res = await this._client.post(url, init.body, {
          headers: init.headers || undefined,
        });
      } else {
        res = await this._client.request({ method, url, ...init });
      }
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        json: async () => res.data,
        text: async () => typeof res.data === "string" ? res.data : JSON.stringify(res.data),
        headers: res.headers || {},
      };
    } catch (err) {
      return {
        ok: false,
        status: err.response ? err.response.status : 0,
        statusText: err.message,
        json: async () => ({ error: err.message }),
        text: async () => err.message,
        headers: {},
      };
    }
  }

  async joinGame(gameId) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const uri = buildRobloxUri({ placeId: gameId, type: "InGame" });
    await this._client.get(uri, { responseType: "text" });
    return { gameId, method: "uri" };
  }

  async joinUser(userId) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const uri = buildRobloxUri({ userId, type: "FollowUser" });
    await this._client.get(uri, { responseType: "text" });
    return { userId, method: "uri" };
  }

  async joinServer(gameId, jobId) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const uri = buildRobloxUri({ placeId: gameId, gameInstanceId: jobId, type: "InGame" });
    await this._client.get(uri, { responseType: "text" });
    return { gameId, jobId, method: "uri" };
  }

  async leaveGame() {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    await this._client.post("/game/end");
    return { left: true };
  }

  async findServers(gameId, options = {}) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const {
      limit = 10,
      descending = true,
      ignoreFullServers = true,
    } = options;
    const url = `${GAMES_API}/games/${gameId}/servers/Public`;
    const res = await this._client.get(url, {
      params: {
        sortOrder: descending ? "Desc" : "Asc",
        excludeFullGames: ignoreFullServers ? "true" : "false",
        limit,
      },
    });
    const data = res.data.data || [];
    return data.map((s) => s.id);
  }

  async getPresence(userIds) {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const res = await this._client.post(`${GAMES_API}/users/presence`, {
      userIds,
    });
    return res.data || [];
  }

  async getFriends() {
    if (!this._connected) {
      throw new TransportError("Not connected. Call connect() first.");
    }
    const res = await this._client.get(`${FRIENDS_API}/user/friends`);
    return res.data.data || [];
  }

  async getFriendByUsername(username) {
    const friends = await this.getFriends();
    return friends.find(
      (f) => f.username?.toLowerCase() === String(username).toLowerCase()
    );
  }
}

export default WebTransport;
