import { describe, it, expect, vi } from "vitest";
import { WebTransport } from "../src/transport/web.js";

describe("WebTransport", () => {
  it("reports connected when cookie set", () => {
    const t = new WebTransport({ cookie: "abc123" });
    expect(t.connected).toBe(true);
  });

  it("reports not connected without cookie", () => {
    const t = new WebTransport({});
    expect(t.connected).toBe(false);
  });

  it("joinGame builds URI", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({}),
    };
    await t.joinGame(999);
    expect(t._client.get).toHaveBeenCalled();
    const uri = t._client.get.mock.calls[0][0];
    expect(uri).toContain("placeId=999");
    expect(uri).toContain("type=InGame");
  });

  it("findServers calls correct endpoint", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({ data: { data: [{ id: "s1" }, { id: "s2" }] } }),
    };
    const ids = await t.findServers(555);
    expect(ids).toEqual(["s1", "s2"]);
    expect(t._client.get).toHaveBeenCalledWith(
      "https://games.roblox.com/v1/games/555/servers/Public",
      expect.objectContaining({ params: expect.any(Object) })
    );
  });

  it("getFriends calls friends API", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({ data: { data: [{ id: 1, username: "Friend1" }] } }),
    };
    const friends = await t.getFriends();
    expect(friends).toEqual([{ id: 1, username: "Friend1" }]);
    expect(t._client.get).toHaveBeenCalledWith("https://friends.roblox.com/v1/user/friends");
  });

  it("getFriendByUsername finds friend case-insensitively", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({ data: { data: [{ id: 1, username: "Friend1" }] } }),
    };
    const friend = await t.getFriendByUsername("friend1");
    expect(friend).toEqual({ id: 1, username: "Friend1" });
  });

  it("getFriendByUsername returns undefined when not found", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    };
    const friend = await t.getFriendByUsername("NoOne");
    expect(friend).toBeUndefined();
  });
});
