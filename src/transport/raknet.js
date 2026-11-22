/**
 * RakNet headless transport for Roblox.
 *
 * Implements UDP socket, RakNet handshake, and basic framing.
 * Packet structures in src/constants/packets.js are placeholders —
 * fill them in by capturing/decoding real Roblox traffic.
 *
 * References:
 * - RakNet protocol spec (RakNet 4.x, used by Roblox)
 * - Roblox protocol reverse-engineering community docs
 */

import { Transport } from "./base.js";
import { NotImplementedError, TransportError } from "../exceptions.js";
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

// RakNet built-in message IDs (0x00–0x1F reserved)
const RAKNET = {
  ID_CONNECTED_PONG: 0x00,
  ID_UNCONNECTED_PING: 0x01,
  ID_UNCONNECTED_PONG: 0x1C,
  ID_CONNECTION_REQUEST: 0x09,
  ID_CONNECTION_REQUEST_ACCEPTED: 0x10,
  ID_NEW_INCOMING_CONNECTION: 0x13,
  ID_DISCONNECTION_NOTIFICATION: 0x15,
  ID_CONNECTION_LOST: 0x16,
  ID_CONNECTED_PING: 0x03,
  ID_GAME_PACKET: 0xFE, // user packets start here (Roblox uses 0x80+)
};

// Reliability types
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
 * Write a 3-byte (24-bit) unsigned integer (little-endian).
 */
function writeU24(view, offset, value) {
  view.setUint8(offset, value & 0xFF);
  view.setUint8(offset + 1, (value >> 8) & 0xFF);
  view.setUint8(offset + 2, (value >> 16) & 0xFF);
}

/**
 * Read a 3-byte (24-bit) unsigned integer (little-endian).
 */
function readU24(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

/**
 * Build a RakNet frame from a raw payload.
 * Returns ArrayBuffer ready to send over UDP.
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
  } = options;

  const headerSize = 1 + 3 + (reliability >= RELIABILITY.RELIABLE ? 4 : 0) +
    (reliability >= RELIABILITY.UNRELIABLE_SEQUENCED ? 4 : 0) +
    (isSplit ? 12 : 0);

  const buffer = new ArrayBuffer(headerSize + payload.byteLength);
  const view = new DataView(buffer);
  let offset = 0;

  // Message ID (0xFE for game packets)
  view.setUint8(offset, RAKNET.ID_GAME_PACKET);
  offset += 1;

  // Frame flags: reliability (3 bits) + hasSplit (1 bit) + reserved (4 bits)
  const flags = (reliability & 0x07) | (isSplit ? 0x80 : 0);
  view.setUint8(offset, flags);
  offset += 1;

  // Message length (24-bit, bytes of payload only)
  writeU24(view, offset, payload.byteLength);
  offset += 3;

  // Reliable/sequenced: message sequence number (32-bit)
  if (reliability >= RELIABILITY.RELIABLE) {
    view.setUint32(offset, sequenceNumber, true);
    offset += 4;
  }

  // Sequenced: ordering channel + ordering index
  if (reliability >= RELIABILITY.UNRELIABLE_SEQUENCED) {
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
 * Returns { frameType, payload, reliable?, sequenced?, split? } or null if not a game packet.
 */
function parseRakNetFrame(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  if (buffer.byteLength < 2) return null;

  const messageId = view.getUint8(offset);
  offset += 1;

  // Only handle game packets (0xFE) and built-in RakNet messages we care about
  if (messageId === RAKNET.ID_GAME_PACKET) {
    const flags = view.getUint8(offset);
    offset += 1;

    const reliability = flags & 0x07;
    const isSplit = (flags & 0x80) !== 0;

    const length = readU24(view, offset);
    offset += 3;

    let reliableSeq = null;
    let orderedSeq = null;

    if (reliability >= RELIABILITY.RELIABLE) {
      reliableSeq = view.getUint32(offset, true);
      offset += 4;
    }
    if (reliability >= RELIABILITY.UNRELIABLE_SEQUENCED) {
      orderedSeq = {
        channel: view.getUint8(offset),
        index: view.getUint32(offset + 1, true),
      };
      offset += 5;
    }

    let splitInfo = null;
    if (isSplit) {
      splitInfo = {
        count: view.getUint32(offset, true),
        id: view.getUint32(offset + 4, true),
        index: view.getUint32(offset + 8, true),
      };
      offset += 12;
    }

    const payload = buffer.slice(offset, offset + length);
    return {
      frameType: "game",
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

// ─── RakNetTransport Class ───────────────────────────────────────────

class RakNetTransport extends Transport {
  constructor(options = {}) {
    super();
    this.options = options;
    this._host = options.host || "roblox.com";
    this._port = options.port || 5222;
    this._connected = false;
    this._socket = null;
    this._receiveLoop = null;
    this._guid = BigInt("0x" + crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""));
    this._remoteGuid = null;
    this._mtu = 1400;
    this._sendSeq = 0;
    this._recvSeq = 0;
    this._orderingIndices = new Array(256).fill(0);
    this._pendingAcks = new Map(); // seq -> { frame, retries, timeout }
    this._ackInterval = null;
    this._pingInterval = null;
    this._lastRecv = Date.now();
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

  /**
   * Connect to Roblox game server via RakNet UDP.
   * Performs handshake: unconnected ping → connection request → accepted.
   */
  async connect(options = {}) {
    const host = options.host || this._host;
    const port = options.port || this._port;

    // Resolve hostname
    const addrs = await this._resolveHost(host);
    if (addrs.length === 0) {
      throw new TransportError(`Failed to resolve ${host}`);
    }
    this._remoteAddr = addrs[0];
    this._remotePort = port;

    // Create UDP socket
    this._socket = this._createSocket();

    // Start receive loop
    this._startReceiveLoop();

    // Step 1: Unconnected ping (get server GUID, MTU, etc.)
    const pong = await this._sendUnconnectedPing();
    this._remoteGuid = pong.serverGuid;
    this._mtu = pong.mtu || 1400;

    // Step 2: Connection request
    await this._sendConnectionRequest();

    // Step 3: Wait for connection accepted
    await this._waitForConnectionAccepted();

    this._connected = true;
    this._startAckLoop();
    this._startPingLoop();

    this.emit("connect", { host, port, guid: this._remoteGuid });
    return { host, port, guid: this._remoteGuid };
  }

  /**
   * Disconnect and cleanup.
   */
  async disconnect() {
    if (this._connected && this._socket) {
      // Send disconnection notification
      const buf = new ArrayBuffer(1);
      new DataView(buf).setUint8(0, RAKNET.ID_DISCONNECTION_NOTIFICATION);
      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    }

    this._connected = false;
    if (this._socket) {
      try { this._socket.close(); } catch { /* ignore */ }
      this._socket = null;
    }
    if (this._receiveLoop) { clearInterval(this._receiveLoop); this._receiveLoop = null; }
    if (this._ackInterval) { clearInterval(this._ackInterval); this._ackInterval = null; }
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    this._pendingAcks.clear();

    this.emit("disconnect", {});
  }

  /**
   * Send a Roblox game packet (opcode 0x80+).
   * Handles RakNet framing, reliability, sequencing, and splitting.
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
    // Node.js dgram socket (UDP)
    const dgram = require("node:dgram");
    const socket = dgram.createSocket("udp4");

    socket.on("message", (msg, rinfo) => {
      this._handleMessage(msg, rinfo);
    });

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

  _startReceiveLoop() {
    // Handled by socket.on("message") event
  }

  _handleMessage(buffer, rinfo) {
    // Verify source
    if (rinfo.address !== this._remoteAddr || rinfo.port !== this._remotePort) return;

    this._lastRecv = Date.now();

    const frame = parseRakNetFrame(buffer);
    if (!frame) return;

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
    // Handle ACKs for reliable packets we sent
    if (frame.reliability >= RELIABILITY.RELIABLE && frame.reliableSeq !== null) {
      this._handleAck(frame.reliableSeq);
    }

    // Send ACK for reliable packets we received
    if (frame.reliability >= RELIABILITY.RELIABLE) {
      this._sendAck(frame.reliableSeq);
    }

    // Decode and emit Roblox packet
    if (frame.payload && frame.payload.byteLength > 0) {
      this._emitPacket(frame.payload);
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
        this._connected = false;
        this.emit("disconnect", { reason: frame.name });
        break;
    }
  }

  // ─── Internal: Handshake Steps ──────────────────────────────────────

  _sendUnconnectedPing() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new TransportError("Unconnected ping timeout")), 5000);

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
          });
        }
      };

      const onMessage = (msg, rinfo) => {
        const frame = parseRakNetFrame(msg);
        if (frame) onPong(frame);
      };

      this._socket.on("message", onMessage);

      // Build unconnected ping
      const buf = new ArrayBuffer(1 + 8 + 8 + 1); // ID + clientGuid + timestamp + magic
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_UNCONNECTED_PING);
      // Write client GUID (8 bytes)
      const guidBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) guidBytes[i] = (this._guid >> (8 * i)) & 0xFF;
      new Uint8Array(buf).set(guidBytes, 1);
      // Timestamp
      view.setBigUint64(9, BigInt(Date.now()), true);
      // Magic (RakNet offline message ID)
      const magic = new Uint8Array([0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE, 0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78]);
      new Uint8Array(buf).set(magic, 17);

      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    });
  }

  _sendConnectionRequest() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new TransportError("Connection request timeout")), 5000);

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

      // Build connection request (simplified)
      const buf = new ArrayBuffer(1 + 8 + 8 + 4 + 4 + 16); // ID + clientGuid + timestamp + useSecurity + mtu + offlineMessageId
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_CONNECTION_REQUEST);
      // Client GUID
      const guidBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) guidBytes[i] = (this._guid >> (8 * i)) & 0xFF;
      new Uint8Array(buf).set(guidBytes, 1);
      // Timestamp
      view.setBigUint64(9, BigInt(Date.now()), true);
      // Use security (0 = none)
      view.setUint32(17, 0, true);
      // MTU
      view.setUint32(21, this._mtu, true);
      // Offline message ID (magic)
      const magic = new Uint8Array([0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE, 0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78]);
      new Uint8Array(buf).set(magic, 25);

      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    });
  }

  _waitForConnectionAccepted() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new TransportError("Connection accepted timeout")), 10000);

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
    });
  }

  _handleConnectionAccepted(payload) {
    // Extract server GUID, MTU, etc.
    if (payload.byteLength >= 8) {
      this._remoteGuid = BigInt("0x" + Array.from(new Uint8Array(payload.slice(0, 8))).map(b => b.toString(16).padStart(2, "0")).join(""));
    }
    if (payload.byteLength >= 10) {
      this._mtu = new DataView(payload.slice(8, 10)).getUint16(0, true);
    }
  }

  _handleNewConnection(payload) {
    // Server confirms connection
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
      const now = Date.now();
      for (const [seq, entry] of this._pendingAcks) {
        // Resend if no ACK after 100ms, max 5 retries
        if (now - entry.sentAt > 100 && entry.retries < 5) {
          this._socket.send(entry.frame, 0, entry.frame.byteLength, this._remotePort, this._remoteAddr);
          entry.retries++;
          entry.sentAt = now;
        } else if (entry.retries >= 5) {
          // Give up
          this._pendingAcks.delete(seq);
          this.emit("error", new TransportError(`Packet ${seq} failed after 5 retries`));
        }
      }
    }, 50);
  }

  _sendAck(seq) {
    const buf = new ArrayBuffer(1 + 4);
    const view = new DataView(buf);
    view.setUint8(0, 0xC0); // ACK packet type (custom)
    view.setUint32(1, seq, true);
    this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
  }

  _handleAck(seq) {
    this._pendingAcks.delete(seq);
  }

  // ─── Internal: Ping/Pong ────────────────────────────────────────────

  _startPingLoop() {
    this._pingInterval = setInterval(() => {
      if (Date.now() - this._lastRecv > 10000) {
        this.emit("error", new TransportError("Connection timeout"));
        this.disconnect();
        return;
      }

      // Send connected ping
      const buf = new ArrayBuffer(1 + 8);
      const view = new DataView(buf);
      view.setUint8(0, RAKNET.ID_CONNECTED_PING);
      view.setBigUint64(1, BigInt(Date.now()), true);
      this._socket.send(buf, 0, buf.byteLength, this._remotePort, this._remoteAddr);
    }, 5000);
  }

  // ─── Internal: DNS Resolution ──────────────────────────────────────

  async _resolveHost(host) {
    const dns = require("node:dns/promises");
    try {
      const records = await dns.resolve4(host);
      return records;
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

export { encodePacket, decodePacket, isPacketDefined, RakNetTransport };
export default RakNetTransport;