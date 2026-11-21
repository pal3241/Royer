import { describe, it, expect } from "vitest";
import { createVisionService } from "../src/vision/index.js";

describe("Vision service", () => {
  it("createVisionService returns detector, vlm, map", () => {
    const svc = createVisionService({ serviceUrl: "http://localhost:8000" });
    expect(svc.detector).toBeDefined();
    expect(svc.vlm).toBeDefined();
    expect(svc.map).toBeDefined();
  });

  it("detect throws without serviceUrl", async () => {
    const svc = createVisionService({});
    await expect(svc.detector.detect(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /VISION_SERVICE_URL/
    );
  });

  it("vlm.ask throws without serviceUrl", async () => {
    const svc = createVisionService({});
    await expect(svc.vlm.ask("hi")).rejects.toThrow(/VISION_SERVICE_URL/);
  });

  it("map.enable throws without fetch configured", async () => {
    const svc = createVisionService({});
    await expect(svc.map.enable()).rejects.toThrow(/authenticated fetch/);
  });

  it("map.enable succeeds when fetch is configured", async () => {
    const svc = createVisionService({});
    svc.map.setFetch(async (url) => ({ ok: true, status: 200, json: async () => ({}) }));
    await expect(svc.map.enable()).resolves.toBeUndefined();
    expect(svc.map.enabled).toBe(true);
  });

  it("map.scan throws when not enabled", async () => {
    const svc = createVisionService({});
    await expect(svc.map.scan(12345)).rejects.toThrow(/not enabled/);
  });
});
