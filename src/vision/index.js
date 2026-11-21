/**
 * Vision plugins — opt-in, HTTP-backed.
 *
 * Termux cannot reliably compile native Node vision modules (onnxruntime, sharp),
 * so detection/VLM calls go to an external Python/HTTP vision service.
 * Set VISION_SERVICE_URL in .env to use them.
 */

export class VisionDetector {
  constructor(options = {}) {
    this.serviceUrl = options.serviceUrl || process.env.VISION_SERVICE_URL || null;
    this.defaultLabel = options.defaultLabel || "player";
  }

  async detect(imageBuffer, options = {}) {
    if (!this.serviceUrl) {
      throw new Error(
        "VISION_SERVICE_URL not set. Start a Python vision service and point VISION_SERVICE_URL at it."
      );
    }

    const { fetch } = await import("node:fetch");
    const label = options.label || this.defaultLabel;

    const form = new FormData();
    form.append("image", new Blob([imageBuffer]), "frame.jpg");
    form.append("label", label);

    const res = await fetch(`${this.serviceUrl}/detect`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Vision detect failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }
}

export class VLM {
  constructor(options = {}) {
    this.serviceUrl = options.serviceUrl || process.env.VISION_SERVICE_URL || null;
  }

  async describe(imageBuffer, options = {}) {
    if (!this.serviceUrl) {
      throw new Error(
        "VISION_SERVICE_URL not set for VLM.describe."
      );
    }
    const { fetch } = await import("node:fetch");
    const form = new FormData();
    form.append("image", new Blob([imageBuffer]), "frame.jpg");
    const res = await fetch(`${this.serviceUrl}/describe`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`VLM describe failed: ${res.status}`);
    const data = await res.json();
    return data.description || data.text || "";
  }

  async ask(prompt, context = {}) {
    if (!this.serviceUrl) {
      throw new Error("VISION_SERVICE_URL not set for VLM.ask.");
    }
    const { fetch } = await import("node:fetch");
    const res = await fetch(`${this.serviceUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context }),
    });
    if (!res.ok) throw new Error(`VLM ask failed: ${res.status}`);
    const data = await res.json();
    return data.response || data.text || "";
  }
}

/**
 * Map detection — headless alternative to client-side script injection.
 *
 * Ceiling / why this is not "real" map injection:
 *   A headless RakNet client has no Roblox client process to inject Lua into,
 *   so client-side script injection for map detection is impossible here.
 *
 * What this class does instead:
 *   Uses the Roblox web API (place info, asset details, universe data) to
 *   gather static map metadata without being in-game. This is NOT real-time
 *   geometry — it's useful for knowing what place/assets a game uses, not for
 *   live obstacle detection.
 *
 * Options for live map data:
 *   1. Fetch place/asset metadata via Roblox web API (this class).
 *   2. Relay observations from a real Roblox client on a companion device.
 *   3. Parse place files (.rbxlx/.rbxl) downloaded via the web API.
 */

export class MapInject {
  constructor(options = {}) {
    this.options = options;
    this.enabled = false;
    // An authenticated fetch-like function: (url, init) => Promise<Response>
    this._fetch = options.fetch || null;
  }

  /**
   * Inject an authenticated fetch function so MapInject can call Roblox APIs.
   * Pass WebTransport's fetch-compatible method or a wrapper around fetch.
   */
  setFetch(fetchFn) {
    this._fetch = fetchFn;
  }

  async enable() {
    if (!this._fetch) {
      throw new Error(
        "MapInject needs an authenticated fetch function. Call map.setFetch(transport.fetch) " +
          "or pass fetch when creating the vision service."
      );
    }
    this.enabled = true;
  }

  async disable() {
    this.enabled = false;
  }

  /**
   * Fetch static metadata for a place (game) via the Roblox web API.
   * Returns place name, description, creator, universe id, etc.
   */
  async scan(placeId) {
    if (!this.enabled) {
      throw new Error("MapInject not enabled. Call enable() first.");
    }
    if (!this._fetch) {
      throw new Error("No fetch function configured. Call setFetch() first.");
    }

    const id = Number(placeId);
    const urls = [
      `https://games.roblox.com/v1/games/${id}`,
      `https://api.roblox.com/universes/get-universe-containing-place?placeid=${id}`,
    ];

    const results = {};
    for (const url of urls) {
      try {
        const res = await this._fetch(url);
        if (res.ok) {
          results[url] = await res.json();
        } else {
          results[url] = { error: `HTTP ${res.status}` };
        }
      } catch (err) {
        results[url] = { error: err.message };
      }
    }

    return { placeId: id, enabled: true, data: results, scannedAt: Date.now() };
  }

  /**
   * Fetch asset metadata for an asset ID (e.g. a mesh, texture, or model used in a map).
   */
  async scanAsset(assetId) {
    if (!this.enabled) {
      throw new Error("MapInject not enabled. Call enable() first.");
    }
    if (!this._fetch) {
      throw new Error("No fetch function configured. Call setFetch() first.");
    }

    const id = Number(assetId);
    const url = `https://assetdelivery.roblox.com/v1/asset/?id=${id}`;
    try {
      const res = await this._fetch(url);
      if (res.ok) {
        const data = await res.json();
        return { assetId: id, data };
      }
      return { assetId: id, error: `HTTP ${res.status}` };
    } catch (err) {
      return { assetId: id, error: err.message };
    }
  }
}

export { VisionDetector, VLM, MapInject };

export function createVisionService(options = {}) {
  return {
    detector: new VisionDetector(options),
    vlm: new VLM(options),
    map: new MapInject(options),
  };
}

