/**
 * RakNet / Roblox packet opcode and structure definitions.
 *
 * This is a reverse-engineering skeleton. Roblox's game protocol is
 * undocumented and changes between client versions. The opcodes and
 * field layouts below are placeholders — fill them in as you
 * reverse-engineer the real protocol.
 *
 * Each opcode maps to a { name, fields } descriptor where fields are
 * { name, type } pairs. Supported types: "u8", "u16", "u32", "u64",
 * "i32", "f32", "f64", "string", "bytes", "bool".
 */

export const PACKET_OPCODES = {
  // ── RakNet base (0x00–0x1F) ──────────────────────────────────────
  ID_CONNECTION_REQUEST: 0x01,
  ID_CONNECTION_REQUEST_ACCEPTED: 0x02,
  ID_NEW_INCOMING_CONNECTION: 0x03,
  ID_DISCONNECTION_NOTIFICATION: 0x15,
  ID_CONNECTION_LOST: 0x16,

  // ── Roblox game packets (0x80–0xFF) ──────────────────────────────
  ROBLOX_PLAYER_JOIN: 0x80,
  ROBLOX_PLAYER_LEAVE: 0x81,
  ROBLOX_CHARACTER_SPAWN: 0x82,
  ROBLOX_CHAT_MESSAGE: 0x83,
  ROBLOX_MOVEMENT_UPDATE: 0x84,
  ROBLOX_VISION_DETECT: 0x85,
};

// Map opcode number → name for logging/debugging.
export const PACKET_NAMES = Object.fromEntries(
  Object.entries(PACKET_OPCODES).map(([k, v]) => [v, k])
);

/**
 * Packet structure descriptors. Each field is { name, type }.
 *
 * These layouts are NOT verified against real Roblox traffic. They are
 * educated guesses to serve as a starting point. Update them as you
 * capture and decode actual packets.
 */
export const PACKET_FIELDS = {
  [PACKET_OPCODES.ROBLOX_PLAYER_JOIN]: [
    { name: "userId", type: "u32" },
    { name: "username", type: "string" },
    { name: "placeId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_PLAYER_LEAVE]: [
    { name: "userId", type: "u32" },
    { name: "reason", type: "u8" },
  ],
  [PACKET_OPCODES.ROBLOX_CHARACTER_SPAWN]: [
    { name: "userId", type: "u32" },
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "z", type: "f32" },
    { name: "health", type: "u16" },
  ],
  [PACKET_OPCODES.ROBLOX_CHAT_MESSAGE]: [
    { name: "userId", type: "u32" },
    { name: "username", type: "string" },
    { name: "message", type: "string" },
    { name: "channel", type: "u8" },
  ],
  [PACKET_OPCODES.ROBLOX_MOVEMENT_UPDATE]: [
    { name: "userId", type: "u32" },
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "z", type: "f32" },
    { name: "velocityX", type: "f32" },
    { name: "velocityY", type: "f32" },
    { name: "velocityZ", type: "f32" },
  ],
  [PACKET_OPCODES.ROBLOX_VISION_DETECT]: [
    { name: "label", type: "string" },
    { name: "confidence", type: "f32" },
    { name: "boxX", type: "f32" },
    { name: "boxY", type: "f32" },
    { name: "boxW", type: "f32" },
    { name: "boxH", type: "f32" },
  ],
};

// Type → byte size for fixed-width primitives.
export const TYPE_SIZES = {
  u8: 1,
  u16: 2,
  u32: 4,
  u64: 8,
  i32: 4,
  f32: 4,
  f64: 8,
  bool: 1,
};

/**
 * Get the field descriptor for a given opcode.
 * Returns undefined if the opcode isn't described yet.
 */
export function getPacketFields(opcode) {
  return PACKET_FIELDS[opcode];
}

/**
 * Check whether a packet structure is fully defined for the given opcode.
 */
export function isPacketDefined(opcode) {
  return !!PACKET_FIELDS[opcode];
}
