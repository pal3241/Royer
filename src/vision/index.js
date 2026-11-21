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
 * Map injection plugin interface — STUB.
 *
 * Ceiling / why this is a stub:
 *   A headless RakNet client has no Roblox client process to inject Lua into,
 *   so client-side script injection for map detection is not possible here.
 *
 * Options for the future:
 *   1. Fetch map/asset data via Roblox web API (limited geometry, not real-time).
 *   2. Relay observations from a real Roblox client on a companion device.
 *   3. Parse map data from place files downloaded via the web API.
 *
 * This file defines the plugin interface so callers can wire in their own
 * map-detection strategy without changing bot internals.
 */

export class MapInject {
  constructor(options = {}) {
    this.options = options;
    this.enabled = false;
  }

  async enable() {
    throw new Error(
      "Map injection is not supported headlessly. " +
        "See src/vision/map_inject.js for the ceiling and alternatives."
    );
  }

  async disable() {
    this.enabled = false;
  }

  async scan() {
    throw new Error("Map scan is not implemented headlessly.");
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
