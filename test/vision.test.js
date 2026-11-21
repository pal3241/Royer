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

  it("map.enable throws headlessly", async () => {
    const svc = createVisionService({});
    await expect(svc.map.enable()).rejects.toThrow(/not supported headlessly/);
  });
});
