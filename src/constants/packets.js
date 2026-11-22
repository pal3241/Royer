/**
 * RakNet / Roblox packet opcode and structure definitions.
 *
 * Based on community reverse-engineering of Roblox protocol.
 * OpCodes 0x80-0xFF are Roblox game packets.
 * These structures are educated guesses — validate against real captures.
 *
 * Reference: Roblox protocol uses a custom bitstream format on top of RakNet.
 * Each packet starts with a 1-byte opcode, followed by serialized data.
 */

export const PACKET_OPCODES = {
  // ── RakNet base (0x00–0x1F) ──────────────────────────────────────
  ID_CONNECTION_REQUEST: 0x01,
  ID_CONNECTION_REQUEST_ACCEPTED: 0x02,
  ID_NEW_INCOMING_CONNECTION: 0x03,
  ID_DISCONNECTION_NOTIFICATION: 0x15,
  ID_CONNECTION_LOST: 0x16,
  ID_CONNECTED_PING: 0x03,
  ID_CONNECTED_PONG: 0x00,
  ID_UNCONNECTED_PING: 0x01,
  ID_UNCONNECTED_PONG: 0x1C,

  // ── Roblox game packets (0x80–0xFF) ──────────────────────────────
  // Connection / Replication
  ROBLOX_CLIENT_REPLICATE: 0x80,      // Client → Server: replication data
  ROBLOX_SERVER_REPLICATE: 0x81,      // Server → Client: replication data
  ROBLOX_PROPERTY_CHANGE: 0x82,       // Property change replication
  ROBLOX_INSTANCE_CREATE: 0x83,       // New instance created
  ROBLOX_INSTANCE_DESTROY: 0x84,      // Instance destroyed
  ROBLOX_INSTANCE_PARENT: 0x85,       // Parent changed

  // Character / Physics
  ROBLOX_CHARACTER_SPAWN: 0x86,       // Character spawned
  ROBLOX_CHARACTER_DESPAWN: 0x87,     // Character despawned
  ROBLOX_MOVEMENT_UPDATE: 0x88,       // Position/velocity update
  ROBLOX_ANIMATION_PLAY: 0x89,        // Animation started
  ROBLOX_ANIMATION_STOP: 0x8A,        // Animation stopped
  ROBLOX_TOOL_EQUIP: 0x8B,            // Tool equipped
  ROBLOX_TOOL_UNEQUIP: 0x8C,          // Tool unequipped
  ROBLOX_TOOL_ACTIVATE: 0x8D,         // Tool activated
  ROBLOX_TOOL_DEACTIVATE: 0x8E,       // Tool deactivated

  // Chat / Social
  ROBLOX_CHAT_MESSAGE: 0x90,          // Chat message
  ROBLOX_CHAT_HISTORY: 0x91,          // Chat history request/response
  ROBLOX_PLAYER_JOIN: 0x92,           // Player joined
  ROBLOX_PLAYER_LEAVE: 0x93,          // Player left
  ROBLOX_FRIEND_REQUEST: 0x94,        // Friend request
  ROBLOX_FRIEND_ACCEPT: 0x95,         // Friend accepted
  ROBLOX_BLOCK_PLAYER: 0x96,          // Player blocked

  // Game / Place
  ROBLOX_PLACE_INFO: 0xA0,            // Place info (name, description, etc.)
  ROBLOX_TELEPORT_REQUEST: 0xA1,      // Teleport to place
  ROBLOX_TELEPORT_FAILED: 0xA2,       // Teleport failed
  ROBLOX_SERVER_INFO: 0xA3,           // Server info (jobId, player count, etc.)

  // UI / Input
  ROBLOX_KEY_PRESS: 0xB0,             // Key pressed
  ROBLOX_KEY_RELEASE: 0xB1,           // Key released
  ROBLOX_MOUSE_MOVE: 0xB2,            // Mouse moved
  ROBLOX_MOUSE_CLICK: 0xB3,           // Mouse clicked
  ROBLOX_UI_INTERACTION: 0xB4,        // UI button clicked, etc.

  // Physics / Assembly
  ROBLOX_ASSEMBLY_MOVE: 0xC0,         // Assembly (character, vehicle) moved
  ROBLOX_ASSEMBLY_ROTATE: 0xC1,       // Assembly rotated
  ROBLOX_JOINT_CREATE: 0xC2,          // Joint created (weld, motor, etc.)
  ROBLOX_JOINT_DESTROY: 0xC3,         // Joint destroyed

  // Voice / Audio
  ROBLOX_VOICE_DATA: 0xD0,            // Voice chat data
  ROBLOX_VOICE_STATE: 0xD1,           // Voice state (muted, etc.)

  // Custom / Vision
  ROBLOX_VISION_DETECT: 0xE0,         // Vision detection result
  ROBLOX_CUSTOM_EVENT: 0xFF,          // Custom game event
};

// Map opcode number → name for logging/debugging.
export const PACKET_NAMES = Object.fromEntries(
  Object.entries(PACKET_OPCODES).map(([k, v]) => [v, k])
);

/**
 * Packet structure descriptors. Each field is { name, type }.
 *
 * Types: "u8", "u16", "u32", "u64", "i32", "f32", "f64", "bool", "string", "bytes", "vector3", "cframe", "color3", "udim2"
 * Compound types (vector3, cframe, etc.) are serialized as their component primitives.
 *
 * NOTE: These are BEST GUESSES. Roblox uses a custom bitstream with variable-length integers,
 * optional fields, and compression. Update as you capture real traffic.
 */
export const PACKET_FIELDS = {
  // ── Connection / Replication ─────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_CLIENT_REPLICATE]: [
    { name: "replicatorId", type: "u32" },
    { name: "entries", type: "bytes" }, // Serialized replication entries
  ],
  [PACKET_OPCODES.ROBLOX_SERVER_REPLICATE]: [
    { name: "replicatorId", type: "u32" },
    { name: "entries", type: "bytes" },
  ],
  [PACKET_OPCODES.ROBLOX_PROPERTY_CHANGE]: [
    { name: "instanceId", type: "u32" },
    { name: "propertyName", type: "string" },
    { name: "valueType", type: "u8" }, // Roblox type enum
    { name: "valueData", type: "bytes" },
  ],
  [PACKET_OPCODES.ROBLOX_INSTANCE_CREATE]: [
    { name: "instanceId", type: "u32" },
    { name: "className", type: "string" },
    { name: "parentId", type: "u32" },
    { name: "properties", type: "bytes" }, // Serialized properties
  ],
  [PACKET_OPCODES.ROBLOX_INSTANCE_DESTROY]: [
    { name: "instanceId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_INSTANCE_PARENT]: [
    { name: "instanceId", type: "u32" },
    { name: "newParentId", type: "u32" },
  ],

  // ── Character / Physics ──────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_CHARACTER_SPAWN]: [
    { name: "userId", type: "u32" },
    { name: "characterId", type: "u32" },
    { name: "position", type: "vector3" }, // x, y, z as f32 each
    { name: "health", type: "f32" },
    { name: "maxHealth", type: "f32" },
    { name: "walkSpeed", type: "f32" },
    { name: "jumpPower", type: "f32" },
  ],
  [PACKET_OPCODES.ROBLOX_CHARACTER_DESPAWN]: [
    { name: "userId", type: "u32" },
    { name: "characterId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_MOVEMENT_UPDATE]: [
    { name: "userId", type: "u32" },
    { name: "characterId", type: "u32" },
    { name: "position", type: "vector3" },
    { name: "velocity", type: "vector3" },
    { name: "cframe", type: "cframe" }, // Full CFrame (position + rotation)
    { name: "moveDirection", type: "vector3" },
    { name: "isGrounded", type: "bool" },
    { name: "isJumping", type: "bool" },
    { name: "walkSpeed", type: "f32" },
  ],
  [PACKET_OPCODES.ROBLOX_ANIMATION_PLAY]: [
    { name: "userId", type: "u32" },
    { name: "animationId", type: "u64" }, // Roblox asset ID
    { name: "priority", type: "u8" },
    { name: "speed", type: "f32" },
    { name: "looped", type: "bool" },
    { name: "timePosition", type: "f32" },
  ],
  [PACKET_OPCODES.ROBLOX_ANIMATION_STOP]: [
    { name: "userId", type: "u32" },
    { name: "animationId", type: "u64" },
  ],
  [PACKET_OPCODES.ROBLOX_TOOL_EQUIP]: [
    { name: "userId", type: "u32" },
    { name: "toolId", type: "u32" },
    { name: "toolName", type: "string" },
  ],
  [PACKET_OPCODES.ROBLOX_TOOL_UNEQUIP]: [
    { name: "userId", type: "u32" },
    { name: "toolId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_TOOL_ACTIVATE]: [
    { name: "userId", type: "u32" },
    { name: "toolId", type: "u32" },
    { name: "mousePosition", type: "vector3" }, // World position
  ],
  [PACKET_OPCODES.ROBLOX_TOOL_DEACTIVATE]: [
    { name: "userId", type: "u32" },
    { name: "toolId", type: "u32" },
  ],

  // ── Chat / Social ────────────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_CHAT_MESSAGE]: [
    { name: "userId", type: "u32" },
    { name: "username", type: "string" },
    { name: "message", type: "string" },
    { name: "channel", type: "u8" }, // 0=All, 1=Team, 2=Whisper, etc.
    { name: "targetUserId", type: "u32" }, // For whispers
    { name: "timestamp", type: "u64" }, // Unix ms
  ],
  [PACKET_OPCODES.ROBLOX_CHAT_HISTORY]: [
    { name: "requestId", type: "u32" },
    { name: "messages", type: "bytes" }, // Array of chat messages
  ],
  [PACKET_OPCODES.ROBLOX_PLAYER_JOIN]: [
    { name: "userId", type: "u32" },
    { name: "username", type: "string" },
    { name: "displayName", type: "string" },
    { name: "placeId", type: "u32" },
    { name: "accountAge", type: "u32" },
    { name: "isFriend", type: "bool" },
  ],
  [PACKET_OPCODES.ROBLOX_PLAYER_LEAVE]: [
    { name: "userId", type: "u32" },
    { name: "reason", type: "u8" }, // 0=Left, 1=Kicked, 2=Banned, 3=Disconnected
  ],
  [PACKET_OPCODES.ROBLOX_FRIEND_REQUEST]: [
    { name: "fromUserId", type: "u32" },
    { name: "fromUsername", type: "string" },
    { name: "toUserId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_FRIEND_ACCEPT]: [
    { name: "userId", type: "u32" },
    { name: "friendUserId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_BLOCK_PLAYER]: [
    { name: "userId", type: "u32" },
    { name: "targetUserId", type: "u32" },
    { name: "blocked", type: "bool" },
  ],

  // ── Game / Place ─────────────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_PLACE_INFO]: [
    { name: "placeId", type: "u32" },
    { name: "name", type: "string" },
    { name: "description", type: "string" },
    { name: "creatorId", type: "u32" },
    { name: "creatorType", type: "u8" }, // 0=User, 1=Group
    { name: "maxPlayers", type: "u32" },
    { name: "universeId", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_TELEPORT_REQUEST]: [
    { name: "placeId", type: "u32" },
    { name: "jobId", type: "string" }, // Specific server, or empty for any
    { name: "teleportData", type: "bytes" }, // Custom teleport data
  ],
  [PACKET_OPCODES.ROBLOX_TELEPORT_FAILED]: [
    { name: "errorCode", type: "u32" },
    { name: "errorMessage", type: "string" },
  ],
  [PACKET_OPCODES.ROBLOX_SERVER_INFO]: [
    { name: "jobId", type: "string" },
    { name: "playerCount", type: "u32" },
    { name: "maxPlayers", type: "u32" },
    { name: "ping", type: "u32" },
    { name: "region", type: "string" },
  ],

  // ── UI / Input ───────────────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_KEY_PRESS]: [
    { name: "keyCode", type: "u32" }, // Roblox KeyCode enum
    { name: "isRepeat", type: "bool" },
  ],
  [PACKET_OPCODES.ROBLOX_KEY_RELEASE]: [
    { name: "keyCode", type: "u32" },
  ],
  [PACKET_OPCODES.ROBLOX_MOUSE_MOVE]: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "deltaX", type: "f32" },
    { name: "deltaY", type: "f32" },
  ],
  [PACKET_OPCODES.ROBLOX_MOUSE_CLICK]: [
    { name: "button", type: "u8" }, // 0=Left, 1=Right, 2=Middle
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "isDown", type: "bool" },
  ],
  [PACKET_OPCODES.ROBLOX_UI_INTERACTION]: [
    { name: "elementId", type: "u32" },
    { name: "action", type: "string" }, // "click", "hover", "input", etc.
    { name: "data", type: "bytes" },
  ],

  // ── Physics / Assembly ───────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_ASSEMBLY_MOVE]: [
    { name: "assemblyId", type: "u32" },
    { name: "position", type: "vector3" },
    { name: "velocity", type: "vector3" },
  ],
  [PACKET_OPCODES.ROBLOX_ASSEMBLY_ROTATE]: [
    { name: "assemblyId", type: "u32" },
    { name: "cframe", type: "cframe" },
    { name: "angularVelocity", type: "vector3" },
  ],
  [PACKET_OPCODES.ROBLOX_JOINT_CREATE]: [
    { name: "jointId", type: "u32" },
    { name: "jointType", type: "u8" }, // Weld, Motor, Hinge, etc.
    { name: "part0Id", type: "u32" },
    { name: "part1Id", type: "u32" },
    { name: "c0", type: "cframe" },
    { name: "c1", type: "cframe" },
  ],
  [PACKET_OPCODES.ROBLOX_JOINT_DESTROY]: [
    { name: "jointId", type: "u32" },
  ],

  // ── Voice / Audio ────────────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_VOICE_DATA]: [
    { name: "userId", type: "u32" },
    { name: "audioData", type: "bytes" }, // Opus encoded
    { name: "sequence", type: "u16" },
    { name: "timestamp", type: "u64" },
  ],
  [PACKET_OPCODES.ROBLOX_VOICE_STATE]: [
    { name: "userId", type: "u32" },
    { name: "muted", type: "bool" },
    { name: "volume", type: "f32" },
  ],

  // ── Vision / Custom ──────────────────────────────────────────────
  [PACKET_OPCODES.ROBLOX_VISION_DETECT]: [
    { name: "label", type: "string" },
    { name: "confidence", type: "f32" },
    { name: "boxX", type: "f32" },
    { name: "boxY", type: "f32" },
    { name: "boxW", type: "f32" },
    { name: "boxH", type: "f32" },
    { name: "imageWidth", type: "u16" },
    { name: "imageHeight", type: "u16" },
  ],
  [PACKET_OPCODES.ROBLOX_CUSTOM_EVENT]: [
    { name: "eventName", type: "string" },
    { name: "eventData", type: "bytes" },
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
  // Compound types (serialized as components)
  vector3: 12,  // 3 * f32
  cframe: 48,   // 12 * f32 (4x4 matrix, or pos+rot)
  color3: 12,   // 3 * f32
  udim2: 16,    // 4 * f32 (xScale, xOffset, yScale, yOffset)
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

/**
 * Encode compound types (vector3, cframe, etc.) to bytes.
 * Used by encodePacket in raknet.js.
 */
export function encodeCompound(type, value, view, offset) {
  switch (type) {
    case "vector3":
      view.setFloat32(offset, value.x, true);
      view.setFloat32(offset + 4, value.y, true);
      view.setFloat32(offset + 8, value.z, true);
      return 12;
    case "cframe":
      // Assume value is { position: {x,y,z}, rotation: {x,y,z,w} } or 4x4 matrix
      if (value.position) {
        view.setFloat32(offset, value.position.x, true);
        view.setFloat32(offset + 4, value.position.y, true);
        view.setFloat32(offset + 8, value.position.z, true);
        // Rotation as quaternion (x,y,z,w)
        if (value.rotation) {
          view.setFloat32(offset + 12, value.rotation.x, true);
          view.setFloat32(offset + 16, value.rotation.y, true);
          view.setFloat32(offset + 20, value.rotation.z, true);
          view.setFloat32(offset + 24, value.rotation.w, true);
        }
        // Fill rest with identity
        for (let i = 28; i < 48; i += 4) view.setFloat32(offset + i, i === 28 || i === 40 ? 1 : 0, true);
      }
      return 48;
    case "color3":
      view.setFloat32(offset, value.r, true);
      view.setFloat32(offset + 4, value.g, true);
      view.setFloat32(offset + 8, value.b, true);
      return 12;
    case "udim2":
      view.setFloat32(offset, value.xScale, true);
      view.setFloat32(offset + 4, value.xOffset, true);
      view.setFloat32(offset + 8, value.yScale, true);
      view.setFloat32(offset + 12, value.yOffset, true);
      return 16;
    default:
      throw new Error(`Unknown compound type: ${type}`);
  }
}

/**
 * Decode compound types from bytes.
 */
export function decodeCompound(type, view, offset) {
  switch (type) {
    case "vector3":
      return {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
      };
    case "cframe":
      return {
        position: {
          x: view.getFloat32(offset, true),
          y: view.getFloat32(offset + 4, true),
          z: view.getFloat32(offset + 8, true),
        },
        rotation: {
          x: view.getFloat32(offset + 12, true),
          y: view.getFloat32(offset + 16, true),
          z: view.getFloat32(offset + 20, true),
          w: view.getFloat32(offset + 24, true),
        },
      };
    case "color3":
      return {
        r: view.getFloat32(offset, true),
        g: view.getFloat32(offset + 4, true),
        b: view.getFloat32(offset + 8, true),
      };
    case "udim2":
      return {
        xScale: view.getFloat32(offset, true),
        xOffset: view.getFloat32(offset + 4, true),
        yScale: view.getFloat32(offset + 8, true),
        yOffset: view.getFloat32(offset + 12, true),
      };
    default:
      throw new Error(`Unknown compound type: ${type}`);
  }
}