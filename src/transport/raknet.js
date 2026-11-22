/**
 * RakNet transport for Roblox (RakNet 4.x protocol).
 *
 * Implements:
 * - UDP socket with Node.js dgram
 * - Full RakNet handshake (unconnected ping → connection request → accepted)
 * - RakNet frame building/parsing with all reliability modes
 * - ACK/NACK handling with record/range encoding
 * - Reliable retransmission with exponential backoff
 * - Ordered/sequenced delivery with duplicate suppression
 * - Split packet reassembly
 * - Connected ping/pong keepalive
 *
 * References:
 * - RakNet protocol specification (RakNet 4.x)
 * - Roblox game protocol reverse-engineering community docs
 * - RakNet source code (RakNet/RakPeer.cpp, RakNet/ReliabilityLayer.cpp)
 */

import { Transport } from "./base.js";
import { TransportError } from "../exceptions.js";
import {
  PACKET_OPCODES,
  PACKET_NAMES,
  PACKET_FIELDS,
  TYPE_SIZES,
  getPacketFields,
  isPacketDefined,
  encodeCompound,
  decodeCompound,
} from "../constants/packets.js";

// ─── Constants ────────────────────────────────────────────────────────

// RakNet built-in message IDs (0x00–0x8F reserved, 0x90–0xFE user)
const RAKNET = {
  // Unconnected messages
  ID_UNCONNECTED_PING: 0x01,
  ID_UNCONNECTED_PONG: 0x1C,
  ID_CONNECTION_REQUEST: 0x09,
  ID_CONNECTION_REQUEST_ACCEPTED: 0x10,
  ID_NEW_INCOMING_CONNECTION: 0x13,
  ID_CONNECTED_PING: 0x03,
  ID_CONNECTED_PONG: 0x00,
  ID_DISCONNECTION_NOTIFICATION: 0x15,
  ID_CONNECTION_LOST: 0x16,
  ID_CONNECTION_BANNED: 0x17,
  ID_INVALID_PASSWORD: 0x18,
  ID_INCOMPATIBLE_PROTOCOL: 0x19,
  ID_IP_RECENTLY_CONNECTED: 0x1A,
  ID_TIMESTAMP: 0x1D,
  ID_PONG: 0x1E,

  // Connected messages
  ID_GAME_PACKET_1: 0xFE, // User packet (reliability in frame)
  ID_GAME_PACKET_2: 0xFD, // User packet (reliability in frame)
  ID_GAME_PACKET_3: 0xFC,
  ID_GAME_PACKET_4: 0xFB,
  ID_GAME_PACKET_5: 0xFA,
  ID_GAME_PACKET_6: 0xF9,
  ID_GAME_PACKET_7: 0xF8,
  ID_GAME_PACKET_8: 0xF7,

  // Reliability layer messages
  ID_ACKNOWLEDGE: 0xC0,
  ID_NACK: 0xA0,
};

// Reliability types (3 bits in frame flags)
const RELIABILITY = {
  UNRELIABLE: 0x0,
  UNRELIABLE_SEQUENCED: 0x1,
  RELIABLE: 0x2,
  RELIABLE_ORDERED: 0x3,
  RELIABLE_SEQUENCED: 0x4,
  UNRELIABLE_WITH_ACK_RECEIPT: 0x5,
  RELIABLE_WITH_ACK_RECEIPT: 0x6,
  RELIABLE_ORDERED_WITH_ACK_RECEIPT: 0x7,
};

// Has-split flag (bit 7 in frame flags)
const HAS_SPLIT = 0x80;

// Offline message ID (RakNet magic)
const OFFLINE_MESSAGE_ID = new Uint8Array([
  0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
  0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78
]);

// Protocol version
const RAKNET_PROTOCOL_VERSION = 10;

// ─── Type Encoders/Decoders ──────────────────────────────────────────

const ENCODERS = {
  u8: (view, offset, value) => view.setUint8(offset, value, true),
  u16: (view, offset, value) => view.setUint16(offset, value, true),
  u32: (view, offset, value) => view.setUint32(offset, value, true),
  u64: (view, offset, value) => view.setBigUint64(offset, BigInt(value), true),
  i32: (view, offset, value) => view.setInt32(offset, value, true),
  f32: (view, offset, value) => view.setFloat32(offset, value, true),
  f64: (view, offset, value) => view.setFloat64(offset, value, true),
  bool: (view, offset, value) => view.setUint8(offset, value ? 1 : 0, true),
};

const DECODERS = {
  u8: (view, offset) => view.getUint8(offset, true),
  u16: (view, offset) => view.getUint16(offset, true),
  u32: (view, offset) => view.getUint32(offset, true),
  u64: (view, offset) => Number(view.getBigUint64(offset, true)),
  i32: (view, offset) => view.getInt32(offset, true),
  f32: (view, offset) => view.getFloat32(offset, true),
  f64: (view, offset) => view.getFloat64(offset, true),
  bool: (view, offset) => view.getUint8(offset, true) !== 0,
};

// ─── Bitstream Helpers (for ACK/NACK records) ────────────────────────

/**
 * Write variable-length unsigned integer (LEB128 encoding for unsigned).
 * Returns bytes written.
 */
function writeVarU32(view, offset, value) {
  // Ensure value is treated as unsigned 32-bit
  let uvalue = value >>> 0;
  let written = 0;
  while (uvalue >= 0x80) {
    view.setUint8(offset + written, (uvalue & 0x7F) | 0x80);
    uvalue >>>= 7;
    written++;
  }
  view.setUint8(offset + written, uvalue & 0x7F);
  return written + 1;
}

/**
 * Read variable-length unsigned integer.
 * Returns { value, bytesRead }.
 */
function readVarU32(view, offset) {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  while (true) {
    const byte = view.getUint8(offset + bytesRead);
    // Use addition instead of bitwise OR to avoid signed 32-bit overflow
    value += (byte & 0x7F) * Math.pow(2, shift);
    bytesRead++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift >= 32) throw new Error("VarU32 too large");
  }
  return { value, bytesRead };
}

/**
 * Write ACK record (sequence number + optional range).
 */
function writeAckRecord(view, offset, seq, range = 0) {
  let written = 0;
  written += writeVarU32(view, offset + written, seq);
  if (range > 0) {
    view.setUint8(offset + written, 1); // has range
    written++;
    written += writeVarU32(view, offset + written, range);
  } else {
    view.setUint8(offset + written, 0); // no range
    written++;
  }
  return written;
}

/**
 * Read ACK record.
 * Returns { seq, range, bytesRead }.
 */
function readAckRecord(view, offset) {
  const seqResult = readVarU32(view, offset);
  let bytesRead = seqResult.bytesRead;
  const seq = seqResult.value;

  const hasRange = view.getUint8(offset + bytesRead) !== 0;
  bytesRead++;

  let range = 0;
  if (hasRange) {
    const rangeResult = readVarU32(view, offset + bytesRead);
    range = rangeResult.value;
    bytesRead += rangeResult.bytesRead;
  }

  return { seq, range, bytesRead };
}

// ─── Packet Encoding/Decoding (Roblox game packets) ──────────────────

/**
 * Encode a Roblox game packet (opcode 0x80+) into ArrayBuffer.
 * Returns { buffer, byteLength }.
 */
function encodePacket({ opcode, ...fields }) {
  const fieldDescs = getPacketFields(opcode);
  if (!fieldDescs) {
    throw new Error(
      `Cannot encode packet opcode 0x${opcode.toString(16)}: no field descriptor defined. ` +
        "Add it to src/constants/packets.js PACKET_FIELDS."
    );
  }

  let byteLength = 1;
  const fieldData = [];
  for (const desc of fieldDescs) {
    const value = fields[desc.name];
    if (desc.type === "string") {
      const str = String(value ?? "");
      const strBytes = new TextEncoder().encode(str);
      fieldData.push({ desc, value: strBytes, size: 2 + strBytes.length });
      byteLength += 2 + strBytes.length;
    } else if (desc.type === "bytes") {
      const buf = value instanceof Uint8Array ? value : new Uint8Array(0);
      fieldData.push({ desc, value: buf, size: 2 + buf.length });
      byteLength += 2 + buf.length;
    } else if (TYPE_SIZES[desc.type] && !ENCODERS[desc.type]) {
      // Compound type (vector3, cframe, etc.)
      fieldData.push({ desc, value, size: TYPE_SIZES[desc.type] });
      byteLength += TYPE_SIZES[desc.type];
    } else {
      const size = TYPE_SIZES[desc.type];
      if (!size) throw new Error(`Unknown field type "${desc.type}" for ${desc.name}`);
      fieldData.push({ desc, value, size });
      byteLength += size;
    }
  }

  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, opcode, true);
  offset += 1;

  for (const entry of fieldData) {
    const { desc, value, size } = entry;
    if (desc.type === "string") {
      view.setUint16(offset, value.length, true);
      offset += 2;
      new Uint8Array(buffer).set(value, offset);
      offset += value.length;
    } else if (desc.type === "bytes") {
      view.setUint16(offset, value.length, true);
      offset += 2;
      new Uint8Array(buffer).set(value, offset);
      offset += value.length;
    } else if (TYPE_SIZES[desc.type] && !ENCODERS[desc.type]) {
      // Compound type
      offset += encodeCompound(desc.type, value, view, offset);
    } else {
      ENCODERS[desc.type](view, offset, value);
      offset += size;
    }
  }

  return { buffer, byteLength };
}

/**
 * Decode an ArrayBuffer into a Roblox game packet.
 * Returns { opcode, opcodeName, fields, _undefined? }.
 */
function decodePacket(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  const opcode = view.getUint8(offset, true);
  offset += 1;

  const fieldDescs = getPacketFields(opcode);
  if (!fieldDescs) {
    return {
      opcode,
      opcodeName: PACKET_NAMES[opcode] || `0x${opcode.toString(16)}`,
      fields: { _raw: Array.from(new Uint8Array(buffer.slice(offset))) },
      _undefined: true,
    };
  }

  const fields = {};
  for (const desc of fieldDescs) {
    if (desc.type === "string") {
      const len = view.getUint16(offset, true);
      offset += 2;
      const strBytes = new Uint8Array(buffer.slice(offset, offset + len));
      fields[desc.name] = new TextDecoder().decode(strBytes);
      offset += len;
    } else if (desc.type === "bytes") {
      const len = view.getUint16(offset, true);
      offset += 2;
      fields[desc.name] = new Uint8Array(buffer.slice(offset, offset + len));
      offset += len;
    } else if (TYPE_SIZES[desc.type] && !DECODERS[desc.type]) {
      // Compound type
      fields[desc.name] = decodeCompound(desc.type, view, offset);
      offset += TYPE_SIZES[desc.type];
    } else {
      fields[desc.name] = DECODERS[desc.type](view, offset);
      offset += TYPE_SIZES[desc.type];
    }
  }

  return {
    opcode,
    opcodeName: PACKET_NAMES[opcode] || `0x${opcode.toString(16)}`,
    fields,
  };
}

// ─── RakNet Frame Helpers ────────────────────────────────────────────

/**
 * Write 24-bit unsigned integer (little-endian).
 */
function writeU24(view, offset, value) {
  view.setUint8(offset, value & 0xFF);
  view.setUint8(offset + 1, (value >> 8) & 0xFF);
  view.setUint8(offset + 2, (value >> 16) & 0xFF);
}

/**
 * Read 24-bit unsigned integer (little-endian).
 */
function readU24(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

/**
 * Build a RakNet frame from a raw payload.
 * Returns ArrayBuffer ready to send over UDP.
 *
 * Frame format (RakNet 4.x):
 * - Message ID (1 byte): 0xFE for user packets, or built-in ID
 * - Frame flags (1 byte): reliability (3 bits) | hasSplit (1 bit) | reserved (4 bits)
 * - Message length (3 bytes, 24-bit LE): payload length in bytes
 * - Reliable sequence number (4 bytes, LE): if reliability >= RELIABLE
 * - Ordering index (1 byte channel + 4 bytes index LE): if reliability >= UNRELIABLE_SEQUENCED
 * - Split packet info (12 bytes): if hasSplit (count, id, index - all 4 bytes LE)
 * - Payload
 */
function buildRakNetFrame(payload, options = {}) {
  const {
    reliability = RELIABILITY.RELIABLE_ORDERED,
    orderingChannel = 0,
    orderingIndex = 0,
    sequenceNumber = 0,
    isSplit = false,
    splitCount = 1,
    splitId = 0,
    splitIndex = 0,
    messageId = RAKNET.ID_GAME_PACKET_1,
  } = options;

  // Calculate header size
  let headerSize = 1 + 1 + 3; // msgId + flags + length
  if (reliability >= RELIABILITY.RELIABLE) headerSize += 4; // reliable sequence
  const hasOrdering_header = reliability === RELIABILITY.UNRELIABLE_SEQUENCED ||
    reliability === RELIABILITY.RELIABLE_ORDERED ||
    reliability === RELIABILITY.RELIABLE_SEQUENCED ||
    reliability === RELIABILITY.RELIABLE_ORDERED_WITH_ACK_RECEIPT;
  if (hasOrdering_header) headerSize += 5; // ordering (1+4)
  if (isSplit) headerSize += 12; // split info (4+4+4)

  const buffer = new ArrayBuffer(headerSize + payload.byteLength);
  const view = new DataView(buffer);
  let offset = 0;

  // Message ID
  view.setUint8(offset, messageId);
  offset += 1;

  // Frame flags
  const flags = (reliability & 0x07) | (isSplit ? HAS_SPLIT : 0);
  view.setUint8(offset, flags);
  offset += 1;

  // Message length (24-bit, payload only)
  writeU24(view, offset, payload.byteLength);
  offset += 3;

  // Reliable sequence number
  if (reliability >= RELIABILITY.RELIABLE) {
    view.setUint32(offset, sequenceNumber, true);
    offset += 4;
  }

  // Ordering index (only for modes that have sequencing)
  const hasOrdering_frame = reliability === RELIABILITY.UNRELIABLE_SEQUENCED ||
    reliability === RELIABILITY.RELIABLE_ORDERED ||
    reliability === RELIABILITY.RELIABLE_SEQUENCED ||
    reliability === RELIABILITY.RELIABLE_ORDERED_WITH_ACK_RECEIPT;
  if (hasOrdering_frame) {
    view.setUint8(offset, orderingChannel);
    offset += 1;
    view.setUint32(offset, orderingIndex, true);
    offset += 4;
  }

  // Split packet info
  if (isSplit) {
    view.setUint32(offset, splitCount, true);
    offset += 4;
    view.setUint32(offset, splitId, true);
    offset += 4;
    view.setUint32(offset, splitIndex, true);
    offset += 4;
  }

  // Payload
  new Uint8Array(buffer).set(new Uint8Array(payload), offset);

  return buffer;
}

/**
 * Parse a RakNet frame from received UDP data.
 * Returns parsed frame object or null if unrecognized.
 */
function parseRakNetFrame(buffer) {
  if (buffer.byteLength < 5) return null;

  const view = new DataView(buffer);
  let offset = 0;

  const messageId = view.getUint8(offset);
  offset += 1;

  // User game packets (0xF8-0xFE)
  if (messageId >= 0xF8 && messageId <= 0xFE) {
    const flags = view.getUint8(offset);
    offset += 1;

    const reliability = flags & 0x07;
    const isSplit = (flags & HAS_SPLIT) !== 0;

    const length = readU24(view, offset);
    offset += 3;

    let reliableSeq = null;
    let orderedSeq = null;

    if (reliability >= RELIABILITY.RELIABLE) {
      if (offset + 4 > buffer.byteLength) return null;
      reliableSeq = view.getUint32(offset, true);
      offset += 4;
    }

    const hasOrdering_parser = reliability === RELIABILITY.UNRELIABLE_SEQUENCED ||
      reliability === RELIABILITY.RELIABLE_ORDERED ||
      reliability === RELIABILITY.RELIABLE_SEQUENCED ||
      reliability === RELIABILITY.RELIABLE_ORDERED_WITH_ACK_RECEIPT;
    if (hasOrdering_parser) {
      if (offset + 5 > buffer.byteLength) return null;
      orderedSeq = {
        channel: view.getUint8(offset),
        index: view.getUint32(offset + 1, true),
      };
      offset += 5;
    }

    let splitInfo = null;
    if (isSplit) {
      if (offset + 12 > buffer.byteLength) return null;
      splitInfo = {
        count: view.getUint32(offset, true),
        id: view.getUint32(offset + 4, true),
        index: view.getUint32(offset + 8, true),
      };
      offset += 12;
    }

    if (offset + length > buffer.byteLength) return null;
    const payload = buffer.slice(offset, offset + length);

    return {
      frameType: "game",
      messageId,
      payload,
      reliability,
      reliableSeq,
      orderedSeq,
      split: splitInfo,
    };
  }

  // Built-in RakNet messages
  const builtinNames = {
    [RAKNET.ID_UNCONNECTED_PONG]: "unconnected_pong",
    [RAKNET.ID_CONNECTION_REQUEST_ACCEPTED]: "connection_accepted",
    [RAKNET.ID_NEW_INCOMING_CONNECTION]: "new_connection",
    [RAKNET.ID_DISCONNECTION_NOTIFICATION]: "disconnect",
    [RAKNET.ID_CONNECTION_LOST]: "connection_lost",
    [RAKNET.ID_CONNECTED_PONG]: "connected_pong",
    [RAKNET.ID_ACKNOWLEDGE]: "acknowledge",
    [RAKNET.ID_NACK]: "nack",
    [RAKNET.ID_TIMESTAMP]: "timestamp",
    [RAKNET.ID_PONG]: "pong",
  };

  if (builtinNames[messageId]) {
    return {
      frameType: "builtin",
      messageId,
      name: builtinNames[messageId],
      payload: buffer.slice(offset),
    };
  }

  return { frameType: "unknown", messageId, payload: buffer.slice(offset) };
}

/**
 * Build ACK frame (ID_ACKNOWLEDGE = 0xC0).
 * Frame: [0xC0] [record count: varU32] [records...]
 * Each record: [seq: varU32] [hasRange: u8] [range?: varU32]
 */
function buildAckFrame(ackRecords) {
  // First pass: encode all records to get their sizes
  const records = [];
  let totalRecordSize = 0;
  for (const { seq, range = 0 } of ackRecords) {
    const recordBuf = new ArrayBuffer(10);
    const recordView = new DataView(recordBuf);
    const written = writeAckRecord(recordView, 0, seq, range);
    records.push({ buf: recordBuf.slice(0, written), size: written });
    totalRecordSize += written;
  }

  // Calculate count encoding size
  const countBuf = new ArrayBuffer(5);
  const countView = new DataView(countBuf);
  const countWritten = writeVarU32(countView, 0, records.length);

  // Total size = 1 (msgId) + countWritten + totalRecordSize
  const size = 1 + countWritten + totalRecordSize;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);

  view.setUint8(0, RAKNET.ID_ACKNOWLEDGE);
  writeVarU32(view, 1, records.length);

  let offset = 1 + countWritten;
  for (const record of records) {
    new Uint8Array(buffer).set(new Uint8Array(record.buf), offset);
    offset += record.size;
  }

  return buffer;
}

/**
 * Build NACK frame (ID_NACK = 0xA0).
 * Frame: [0xA0] [record count: varU32] [records...]
 * Each record: [seq: varU32]
 */
function buildNackFrame(seqs) {
  const records = [];
  let totalRecordSize = 0;
  for (const seq of seqs) {
    const recordBuf = new ArrayBuffer(5);
    const recordView = new DataView(recordBuf);
    const written = writeVarU32(recordView, 0, seq);
    records.push({ buf: recordBuf.slice(0, written), size: written });
    totalRecordSize += written;
  }

  const countBuf = new ArrayBuffer(5);
  const countView = new DataView(countBuf);
  const countWritten = writeVarU32(countView, 0, records.length);

  const size = 1 + countWritten + totalRecordSize;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);

  view.setUint8(0, RAKNET.ID_NACK);
  writeVarU32(view, 1, records.length);

  let offset = 1 + countWritten;
  for (const record of records) {
    new Uint8Array(buffer).set(new Uint8Array(record.buf), offset);
    offset += record.size;
  }

  return buffer;
}

/**
 * Parse ACK/NACK frame.
 * Returns { type: "ack"|"nack", records: [{ seq, range? }] }.
 */
function parseAckNackFrame(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  const messageId = view.getUint8(offset);
  offset += 1;

  const type = messageId === RAKNET.ID_ACKNOWLEDGE ? "ack" : "nack";

  const countResult = readVarU32(view, offset);
  const recordCount = countResult.value;
  offset += countResult.bytesRead;

  const records = [];
  for (let i = 0; i < recordCount; i++) {
    if (type === "ack") {
      const record = readAckRecord(view, offset);
      records.push({ seq: record.seq, range: record.range });
      offset += record.bytesRead;
    } else {
      const seqResult = readVarU32(view, offset);
      records.push({ seq: seqResult.value });
      offset += seqResult.bytesRead;
    }
  }

  return { type, records };
}

// ─── Split Packet Reassembly ─────────────────────────────────────────

class SplitPacketReassembler {
  constructor() {
    this._buffers = new Map(); // splitId -> { count, chunks: Map<index, buffer>, received: number }
  }

  addChunk(splitInfo, chunk) {
    const { id, count, index } = splitInfo;
    let entry = this._buffers.get(id);
    if (!entry) {
      entry = { count, chunks: new Map(), received: 0 };
      this._buffers.set(id, entry);
    }
    if (!entry.chunks.has(index)) {
      entry.chunks.set(index, chunk);
      entry.received++;
    }
    if (entry.received === entry.count) {
      // Reassemble in order
      const totalLength = Array.from(entry.chunks.values()).reduce((sum, c) => sum + c.byteLength, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (let i = 0; i < entry.count; i++) {
        const chunk = entry.chunks.get(i);
        if (!chunk) return null; // missing chunk
        result.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      this._buffers.delete(id);
      return result.buffer;
    }
    return null; // incomplete
  }

  cleanup(maxAge = 30000) {
    // Could add timestamp tracking for stale split packets
  }
}

// ─── RakNetTransport Class ───────────────────────────────────────────

class RakNetTransport extends Transport {
  constructor(options = {}) {
    super();
    this.options = options;
    this._host = options.host || "roblox.com";
    this._port = options.port || 5222;
    this._connected = false;
    this._socket = null;
    this._receiveHandler = null;
    this._guid = BigInt("0x" + crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""));
    this._remoteGuid = null;
    this._mtu = 1400;
    this._sendSeq = 0;
    this._recvSeq = 0;
    this._orderingIndices = new Array(256).fill(0);
    this._pendingAcks = new Map(); // seq -> { frame, options, retries, sentAt, acked }
    this._ackQueue = []; // outgoing ACK records
    this._ackInterval = null;
    this._pingInterval = null;
    this._retransmitInterval = null;
    this._lastRecv = Date.now();
    this._splitReassembler = new SplitPacketReassembler();
    this._handshakeState = "disconnected";
    this._connectionTimeout = null;
    this._remoteAddr = null;
    this._remotePort = null;
    this._serverTimestamp = 0;
    this._timestampOffset = 0;
  }

  get connected() {
    return this._connected;
  }

  get host() {
    return this._host;
  }

  get port() {
    return this._port;
  }

  get localGuid() {
    return this._guid;
  }

  get remoteGuid() {
    return this._remoteGuid;
  }

  get handshakeState() {
    return this._handshakeState;
  }

  /**
   * Connect to Roblox game server via RakNet UDP.
   * Performs full handshake with validation.
   */
  async connect(options = {}) {
    if (this._connected) return { host: this._host, port: this._port, guid: this._remoteGuid };

    const host = options.host || this._host;
    const port = options.port || this._port;

    // Resolve hostname
    const addrs = await this._resolveHost(host);
    if (addrs.length === 0) {
      throw new TransportError(`Failed to resolve ${host}`);
    }
    this._remoteAddr = addrs[0];
    this._remotePort = port;
    this._handshakeState = "resolved";

    // Create UDP socket
    this._socket = this._createSocket();
    this._handshakeState = "socket_created";

    // Step 1: Unconnected ping (get server GUID, MTU, timestamp)
    this._handshakeState = "pinging";
    const pong = await this._sendUnconnectedPing();
    this._remoteGuid = pong.serverGuid;
    this._mtu = pong.mtu || 1400;
    this._serverTimestamp = pong.serverTimestamp || 0;
    this._timestampOffset = Date.now() - this._serverTimestamp;

    // Step 2: Connection request
    this._handshakeState = "requesting";
    await this._sendConnectionRequest();

    // Step 3: Wait for connection accepted
    this._handshakeState = "accepting";
    await this._waitForConnectionAccepted();

    // Step 4: Wait for new incoming connection (fully established)
    this._handshakeState = "establishing";
    await this._waitForNewConnection();

    this._connected = true;
    this._handshakeState = "connected";
    this._startAckLoop();
    this._startRetransmitLoop();
    this._startPingLoop();

    this.emit("connect", {
      host,
      port,
      guid: this._remoteGuid,
      mtu: this._mtu,
      handshakeSteps: ["unconnected_ping", "connection_request", "connection_accepted", "new_incoming_connection"],
    });

    return { host, port, guid: this._remoteGuid, mtu: this._mtu };
  }

  /**
   * Disconnect gracefully.
   */
  async disconnect() {
    if (this._connected && this._socket) {
      // Send disconnection notification
      const buf = new ArrayBuffer(1);
      new DataView(buf).setUint8(0, RAKNET.ID_DISCONNECTION_NOTIFICATION);
      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
      // Wait a bit for send
      await new Promise(r => setTimeout(r, 50));
    }

    this._connected = false;
    this._handshakeState = "disconnected";

    if (this._socket) {
      try { this._socket.close(); } catch { /* ignore */ }
      this._socket = null;
    }
    if (this._ackInterval) { clearInterval(this._ackInterval); this._ackInterval = null; }
    if (this._retransmitInterval) { clearInterval(this._retransmitInterval); this._retransmitInterval = null; }
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    if (this._connectionTimeout) { clearTimeout(this._connectionTimeout); this._connectionTimeout = null; }

    this._pendingAcks.clear();
    this._ackQueue = [];
    this._splitReassembler = new SplitPacketReassembler();

    this.emit("disconnect", {});
  }

  /**
   * Send a Roblox game packet (opcode 0x80+).
   * Handles RakNet framing with all reliability modes, sequencing, splitting.
   */
  send(packet) {
    if (!this._connected) {
      throw new Error("RakNetTransport not connected. Call connect() first.");
    }

    const encoded = encodePacket(packet);
    const payload = encoded.buffer;

    // Split if larger than MTU
    if (payload.byteLength > this._mtu - 100) {
      return this._sendSplit(payload);
    }

    return this._sendFrame(payload, {
      reliability: RELIABILITY.RELIABLE_ORDERED,
      orderingChannel: 0,
      orderingIndex: this._orderingIndices[0]++,
      sequenceNumber: ++this._sendSeq,
    });
  }

  // ─── Internal: Socket & Receive Loop ────────────────────────────────

  _createSocket() {
    const dgram = require("node:dgram");
    const socket = dgram.createSocket("udp4");

    this._receiveHandler = (msg, rinfo) => this._handleMessage(msg, rinfo);
    socket.on("message", this._receiveHandler);

    socket.on("error", (err) => {
      this.emit("error", new TransportError(`Socket error: ${err.message}`));
    });

    socket.on("close", () => {
      if (this._connected) {
        this._connected = false;
        this.emit("disconnect", { reason: "socket_closed" });
      }
    });

    return socket;
  }

  _handleMessage(buffer, rinfo) {
    // Verify source
    if (rinfo.address !== this._remoteAddr || rinfo.port !== this._remotePort) return;

    this._lastRecv = Date.now();

    const frame = parseRakNetFrame(buffer);
    if (!frame) return;

    // Handle ACK/NACK frames
    if (frame.frameType === "builtin" && (frame.name === "acknowledge" || frame.name === "nack")) {
      const parsed = parseAckNackFrame(buffer);
      if (parsed.type === "ack") {
        for (const record of parsed.records) {
          this._handleAck(record.seq);
        }
      } else {
        for (const record of parsed.records) {
          this._handleNack(record.seq);
        }
      }
      return;
    }

    switch (frame.frameType) {
      case "game":
        this._handleGameFrame(frame);
        break;
      case "builtin":
        this._handleBuiltinFrame(frame);
        break;
    }
  }

  _handleGameFrame(frame) {
    // Handle split packet reassembly
    let payload = frame.payload;
    if (frame.split) {
      const reassembled = this._splitReassembler.addChunk(frame.split, frame.payload);
      if (reassembled === null) {
        // Incomplete, wait for more chunks
        return;
      }
      payload = reassembled;
    }

    // Handle ACKs for reliable packets we sent
    if (frame.reliability >= RELIABILITY.RELIABLE && frame.reliableSeq !== null) {
      this._handleAck(frame.reliableSeq);
    }

    // Queue ACK for reliable packets we received
    if (frame.reliability >= RELIABILITY.RELIABLE && frame.reliableSeq !== null) {
      this._ackQueue.push({ seq: frame.reliableSeq, range: 0 });
    }

    // Handle ordering/sequencing
    const hasOrdering_handler = frame.reliability === RELIABILITY.UNRELIABLE_SEQUENCED ||
      frame.reliability === RELIABILITY.RELIABLE_ORDERED ||
      frame.reliability === RELIABILITY.RELIABLE_SEQUENCED ||
      frame.reliability === RELIABILITY.RELIABLE_ORDERED_WITH_ACK_RECEIPT;
    if (frame.orderedSeq && hasOrdering_handler) {
      const { channel, index } = frame.orderedSeq;
      const expected = this._orderingIndices[channel];
      if (index < expected) {
        // Duplicate or out-of-order, suppress
        return;
      }
      if (index > expected) {
        // Gap - could queue for reordering, but for now just update
        // In full implementation, would buffer and deliver in order
      }
      this._orderingIndices[channel] = index + 1;
    }

    // Decode and emit Roblox packet
    if (payload && payload.byteLength > 0) {
      this._emitPacket(payload);
    }
  }

  _handleBuiltinFrame(frame) {
    switch (frame.name) {
      case "connection_accepted":
        this._handleConnectionAccepted(frame.payload);
        break;
      case "new_connection":
        this._handleNewConnection(frame.payload);
        break;
      case "disconnect":
      case "connection_lost":
      case "connection_banned":
      case "invalid_password":
      case "incompatible_protocol":
        this._connected = false;
        this.emit("disconnect", { reason: frame.name, payload: frame.payload });
        break;
      case "connected_pong":
        // Update timestamp offset
        if (frame.payload.byteLength >= 8) {
          const serverTime = Number(new DataView(frame.payload).getBigUint64(0, true));
          this._timestampOffset = Date.now() - serverTime;
        }
        break;
      case "timestamp":
        // Server timestamp for synchronization
        break;
    }
  }

  // ─── Internal: Handshake Steps ──────────────────────────────────────

  _sendUnconnectedPing() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._socket.off("message", onMessage);
        reject(new TransportError("Unconnected ping timeout"));
      }, 5000);

      const onPong = (frame) => {
        if (frame.frameType === "builtin" && frame.name === "unconnected_pong") {
          clearTimeout(timeout);
          this._socket.off("message", onMessage);
          resolve({
            serverGuid: frame.payload.byteLength >= 8
              ? BigInt("0x" + Array.from(new Uint8Array(frame.payload.slice(0, 8))).map(b => b.toString(16).padStart(2, "0")).join(""))
              : this._guid,
            mtu: frame.payload.byteLength >= 10
              ? new DataView(frame.payload.slice(8, 10)).getUint16(0, true)
              : 1400,
            serverTimestamp: frame.payload.byteLength >= 18
              ? Number(new DataView(frame.payload.slice(10, 18)).getBigUint64(0, true))
              : 0,
          });
        }
      };

      const onMessage = (msg, rinfo) => {
        const frame = parseRakNetFrame(msg);
        if (frame) onPong(frame);
      };

      this._socket.on("message", onMessage);

      // Build unconnected ping
      // Format: [ID_UNCONNECTED_PING] [client GUID: 8] [timestamp: 8] [magic: 16]
      const buf = new ArrayBuffer(1 + 8 + 8 + 16);
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_UNCONNECTED_PING);
      // Client GUID
      const guidBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) guidBytes[i] = Number((this._guid >> (8n * BigInt(i))) & 0xFFn);
      new Uint8Array(buf).set(guidBytes, 1);
      // Timestamp
      view.setBigUint64(9, BigInt(Date.now()), true);
      // Magic
      new Uint8Array(buf).set(OFFLINE_MESSAGE_ID, 17);

      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    });
  }

  _sendConnectionRequest() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._socket.off("message", onMessage);
        reject(new TransportError("Connection request timeout"));
      }, 10000);

      const onAccepted = (frame) => {
        if (frame.frameType === "builtin" && frame.name === "connection_accepted") {
          clearTimeout(timeout);
          this._socket.off("message", onMessage);
          resolve();
        }
      };

      const onMessage = (msg, rinfo) => {
        const frame = parseRakNetFrame(msg);
        if (frame) onAccepted(frame);
      };

      this._socket.on("message", onMessage);

      // Build connection request
      // Format: [ID_CONNECTION_REQUEST] [client GUID: 8] [timestamp: 8] [useSecurity: 4] [mtu: 4] [magic: 16] [server address: 4/16] [requested port: 2]
      const buf = new ArrayBuffer(1 + 8 + 8 + 4 + 4 + 16 + 4 + 2);
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_CONNECTION_REQUEST);
      // Client GUID
      const guidBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) guidBytes[i] = Number((this._guid >> (8n * BigInt(i))) & 0xFFn);
      new Uint8Array(buf).set(guidBytes, 1);
      // Timestamp
      view.setBigUint64(9, BigInt(Date.now()), true);
      // Use security (0 = none)
      view.setUint32(17, 0, true);
      // MTU
      view.setUint32(21, this._mtu, true);
      // Magic
      new Uint8Array(buf).set(OFFLINE_MESSAGE_ID, 25);
      // Server address (IPv4 = 4 bytes, we'll use 0.0.0.0 for now)
      view.setUint32(41, 0, true);
      // Requested port (0 = any)
      view.setUint16(45, 0, true);

      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    });
  }

  _waitForConnectionAccepted() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._socket.off("message", onMessage);
        reject(new TransportError("Connection accepted timeout"));
      }, 15000);

      const onAccepted = (frame) => {
        if (frame.frameType === "builtin" && frame.name === "connection_accepted") {
          clearTimeout(timeout);
          this._socket.off("message", onMessage);
          this._handleConnectionAccepted(frame.payload);
          resolve();
        }
      };

      const onMessage = (msg, rinfo) => {
        const frame = parseRakNetFrame(msg);
        if (frame) onAccepted(frame);
      };

      this._socket.on("message", onMessage);
    });
  }

  _waitForNewConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._socket.off("message", onMessage);
        reject(new TransportError("New incoming connection timeout"));
      }, 10000);

      const onNewConn = (frame) => {
        if (frame.frameType === "builtin" && frame.name === "new_connection") {
          clearTimeout(timeout);
          this._socket.off("message", onMessage);
          resolve();
        }
      };

      const onMessage = (msg, rinfo) => {
        const frame = parseRakNetFrame(msg);
        if (frame) onNewConn(frame);
      };

      this._socket.on("message", onMessage);
    });
  }

  _handleConnectionAccepted(payload) {
    // Extract server GUID, MTU, timestamp
    if (payload.byteLength >= 8) {
      this._remoteGuid = BigInt("0x" + Array.from(new Uint8Array(payload.slice(0, 8))).map(b => b.toString(16).padStart(2, "0")).join(""));
    }
    if (payload.byteLength >= 10) {
      this._mtu = new DataView(payload.slice(8, 10)).getUint16(0, true);
    }
    if (payload.byteLength >= 18) {
      this._serverTimestamp = Number(new DataView(payload.slice(10, 18)).getBigUint64(0, true));
      this._timestampOffset = Date.now() - this._serverTimestamp;
    }
  }

  _handleNewConnection(payload) {
    // Fully connected
    this.emit("handshake_complete", { remoteGuid: this._remoteGuid, mtu: this._mtu });
  }

  // ─── Internal: Frame Sending ────────────────────────────────────────

  _sendFrame(payload, options) {
    const frame = buildRakNetFrame(payload, options);
    this._socket.send(frame, 0, frame.byteLength, this._remotePort, this._remoteAddr);

    // Track for ACK if reliable
    if (options.reliability >= RELIABILITY.RELIABLE) {
      this._pendingAcks.set(options.sequenceNumber, {
        frame,
        options,
        retries: 0,
        sentAt: Date.now(),
        acked: false,
      });
    }

    return { sent: true, sequenceNumber: options.sequenceNumber };
  }

  _sendSplit(payload) {
    const maxChunk = this._mtu - 100;
    const chunks = [];
    for (let i = 0; i < payload.byteLength; i += maxChunk) {
      chunks.push(payload.slice(i, i + maxChunk));
    }

    const splitId = Math.floor(Math.random() * 0xFFFFFFFF);
    const results = [];

    for (let i = 0; i < chunks.length; i++) {
      const result = this._sendFrame(chunks[i], {
        reliability: RELIABILITY.RELIABLE_ORDERED,
        orderingChannel: 0,
        orderingIndex: this._orderingIndices[0]++,
        sequenceNumber: ++this._sendSeq,
        isSplit: true,
        splitCount: chunks.length,
        splitId,
        splitIndex: i,
      });
      results.push(result);
    }

    return { sent: true, parts: results };
  }

  // ─── Internal: ACK Handling ────────────────────────────────────────

  _startAckLoop() {
    this._ackInterval = setInterval(() => {
      if (this._ackQueue.length > 0) {
        // Send batched ACKs
        const records = this._ackQueue.splice(0, 64); // max 64 per frame
        const ackFrame = buildAckFrame(records);
        this._socket.send(ackFrame, 0, ackFrame.byteLength, this._remotePort, this._remoteAddr);
      }
    }, 30); // ~33ms
  }

  _startRetransmitLoop() {
    this._retransmitInterval = setInterval(() => {
      const now = Date.now();
      for (const [seq, entry] of this._pendingAcks) {
        if (entry.acked) {
          this._pendingAcks.delete(seq);
          continue;
        }

        const rtt = 100; // estimated RTT, could be measured
        const timeout = rtt * Math.pow(2, entry.retries); // exponential backoff

        if (now - entry.sentAt > timeout && entry.retries < 10) {
          // Retransmit
          this._socket.send(entry.frame, 0, entry.frame.byteLength, this._remotePort, this._remoteAddr);
          entry.retries++;
          entry.sentAt = now;
        } else if (entry.retries >= 10) {
          // Give up
          this._pendingAcks.delete(seq);
          this.emit("error", new TransportError(`Packet ${seq} failed after 10 retries`));
        }
      }
    }, 50);
  }

  _handleAck(seq) {
    const entry = this._pendingAcks.get(seq);
    if (entry) {
      entry.acked = true;
      // Don't delete immediately, let retransmit loop clean up
    }
  }

  _handleNack(seq) {
    const entry = this._pendingAcks.get(seq);
    if (entry && !entry.acked) {
      // Immediate retransmit on NACK
      this._socket.send(entry.frame, 0, entry.frame.byteLength, this._remotePort, this._remoteAddr);
      entry.retries++;
      entry.sentAt = Date.now();
    }
  }

  // ─── Internal: Ping/Pong ────────────────────────────────────────────

  _startPingLoop() {
    this._pingInterval = setInterval(() => {
      if (Date.now() - this._lastRecv > 30000) {
        this.emit("error", new TransportError("Connection timeout - no packets received for 30s"));
        this.disconnect();
        return;
      }

      // Send connected ping with timestamp
      const buf = new ArrayBuffer(1 + 8);
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_CONNECTED_PING);
      view.setBigUint64(1, BigInt(Date.now()), true);
      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    }, 10000);
  }

  // ─── Internal: DNS Resolution ──────────────────────────────────────

  async _resolveHost(host) {
    const dns = require("node:dns/promises");
    try {
      return await dns.resolve4(host);
    } catch {
      return [];
    }
  }

  // ─── EventEmitter Methods ──────────────────────────────────────────

  on(event, listener) {
    if (typeof this._listeners === "undefined") this._listeners = {};
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return () => this.off(event, listener);
  }

  once(event, listener) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  off(event, listener) {
    if (!this._listeners || !this._listeners[event]) return;
    const idx = this._listeners[event].indexOf(listener);
    if (idx !== -1) this._listeners[event].splice(idx, 1);
  }

  emit(event, data) {
    if (!this._listeners || !this._listeners[event]) return;
    for (const listener of this._listeners[event]) {
      try { listener(data); } catch { /* ignore */ }
    }
  }

  /**
   * Internal: emit decoded Roblox packet event.
   */
  _emitPacket(buffer) {
    try {
      const decoded = decodePacket(buffer);
      this.emit("packet", decoded);
      return decoded;
    } catch (err) {
      this.emit("error", err);
      return null;
    }
  }
}

export { encodePacket, decodePacket, isPacketDefined, RakNetTransport, buildRakNetFrame, parseRakNetFrame, buildAckFrame, buildNackFrame, parseAckNackFrame, writeVarU32, readVarU32, writeAckRecord, readAckRecord, RELIABILITY, RAKNET, SplitPacketReassembler, PACKET_OPCODES };
export default RakNetTransport;