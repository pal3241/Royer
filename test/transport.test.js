import { describe, it, expect, vi } from "vitest";
import { WebTransport } from "../src/transport/web.js";
import { encodePacket, decodePacket, isPacketDefined, RakNetTransport } from "../src/transport/raknet.js";
import { PACKET_OPCODES } from "../src/constants/packets.js";

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

  it("fetch returns Response-like object", async () => {
    const t = new WebTransport({ cookie: "abc" });
    t._connected = true;
    t._client = {
      get: vi.fn().mockResolvedValue({ data: { id: 1, name: "TestPlace" }, status: 200, statusText: "OK", headers: {} }),
    };
    const res = await t.fetch("https://games.roblox.com/v1/games/123");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: 1, name: "TestPlace" });
  });
});

describe("RakNet packet encoding", () => {
  it("isPacketDefined returns true for known opcodes", () => {
    expect(isPacketDefined(PACKET_OPCODES.ROBLOX_CHAT_MESSAGE)).toBe(true);
    expect(isPacketDefined(0x99)).toBe(false);
  });

  it("encodePacket and decodePacket round-trip a chat message", () => {
    const encoded = encodePacket({
      opcode: PACKET_OPCODES.ROBLOX_CHAT_MESSAGE,
      userId: 42,
      username: "TestPlayer",
      message: "Hello world",
      channel: 0,
    });
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(encoded.byteLength).toBeGreaterThan(0);

    const decoded = decodePacket(encoded.buffer);
    expect(decoded.opcode).toBe(PACKET_OPCODES.ROBLOX_CHAT_MESSAGE);
    expect(decoded.opcodeName).toBe("ROBLOX_CHAT_MESSAGE");
    expect(decoded.fields.userId).toBe(42);
    expect(decoded.fields.username).toBe("TestPlayer");
    expect(decoded.fields.message).toBe("Hello world");
    expect(decoded.fields.channel).toBe(0);
  });

  it("decodePacket returns _undefined for unknown opcodes", () => {
    const buf = new Uint8Array([0x99, 0x01, 0x02, 0x03]).buffer;
    const decoded = decodePacket(buf);
    expect(decoded._undefined).toBe(true);
    expect(decoded.opcode).toBe(0x99);
  });

  it("RakNetTransport connect throws NotImplementedError", async () => {
    const t = new RakNetTransport({ host: "roblox.com", port: 5222 });
    const err = await t.connect().then(
      () => { throw new Error("should have thrown"); },
      (e) => e
    );
    expect(err.name).toBe("NotImplementedError");
    expect(t.connected).toBe(false);
  });

  it("RakNetTransport send throws NotImplementedError", async () => {
    const t = new RakNetTransport({});
    t._connected = true;
    let err = null;
    try {
      t.send({ opcode: PACKET_OPCODES.ROBLOX_CHAT_MESSAGE, message: "hi" });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.name).toBe("NotImplementedError");
  });
});
