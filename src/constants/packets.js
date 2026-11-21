export const PACKET_OPCODES = {
  // RakNet base opcodes
  ID_CONNECTION_REQUEST: 0x01,
  ID_CONNECTION_REQUEST_ACCEPTED: 0x02,
  ID_DISCONNECTION_NOTIFICATION: 0x15,
  ID_CONNECTION_LOST: 0x16,
  // Roblox-specific opcodes (skeleton — fill as protocol is reverse-engineered)
  ROBLOX_PLAYER_JOIN: 0x80,
  ROBLOX_PLAYER_LEAVE: 0x81,
  ROBLOX_CHARACTER_SPAWN: 0x82,
  ROBLOX_CHAT_MESSAGE: 0x83,
  ROBLOX_MOVEMENT_UPDATE: 0x84,
  ROBLOX_VISION_DETECT: 0x85,
};

export const PACKET_NAMES = Object.fromEntries(
  Object.entries(PACKET_OPCODES).map(([k, v]) => [v, k])
);
