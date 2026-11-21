/**
 * RakNet headless transport skeleton.
 *
 * Implements the Transport ABC with packet encoding/decoding helpers
 * and connection-state tracking. The actual socket connection and
 * RakNet framing (frame splitting, reliability, sequencing, ACKs) are
 * NOT implemented — connect()/send() throw NotImplementedError with
 * clear upgrade instructions.
 *
 * To make this transport real:
 *   1. Implement connect() to open a UDP/TCP socket to Roblox's game
 *      servers and complete the RakNet handshake.
 *   2. Implement send() to frame packets per RakNet spec and send them.
 *   3. Implement a receive loop that decodes incoming frames and emits
 *      "packet" events with decoded Roblox packet objects.
 *   4. Fill in real field layouts in src/constants/packets.js as you
 *      reverse-engineer the protocol.
 */

import { Transport } from "./base.js";
import { NotImplementedError } from "../exceptions.js";
import {
  PACKET_OPCODES,
  PACKET_NAMES,
  PACKET_FIELDS,
  TYPE_SIZES,
  getPacketFields,
  isPacketDefined,
} from "../constants/packets.js";

// Fixed-width type encoders/decoders (little-endian).
const ENCODERS = {
  u8: (view, offset, value) => view.setUint8(offset, value, true),
  u16: (view, offset, value) => view.setUint16(offset, value, true),
  u32: (view, offset, value) => view.setUint32(offset, value, true),
  i32: (view, offset, value) => view.setInt32(offset, value, true),
  f32: (view, offset, value) => view.setFloat32(offset, value, true),
  f64: (view, offset, value) => view.setFloat64(offset, value, true),
  bool: (view, offset, value) => view.setUint8(offset, value ? 1 : 0, true),
};

const DECODERS = {
  u8: (view, offset) => view.getUint8(offset, true),
  u16: (view, offset) => view.getUint16(offset, true),
  u32: (view, offset) => view.getUint32(offset, true),
  i32: (view, offset) => view.getInt32(offset, true),
  f32: (view, offset) => view.getFloat32(offset, true),
  f64: (view, offset) => view.getFloat64(offset, true),
  bool: (view, offset) => view.getUint8(offset, true) !== 0,
};

/**
 * Encode a packet object into an ArrayBuffer using the field descriptor
 * for its opcode. Strings are length-prefixed (u16 length + UTF-8 bytes).
 * Returns { buffer, byteLength }.
 */
export function encodePacket({ opcode, ...fields }) {
  const fieldDescs = getPacketFields(opcode);
  if (!fieldDescs) {
    throw new Error(
      `Cannot encode packet opcode 0x${opcode.toString(16)}: no field descriptor defined. ` +
        "Add it to src/constants/packets.js PACKET_FIELDS."
    );
  }

  // First pass: compute total byte length.
  let byteLength = 1; // opcode byte
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
    } else {
      const size = TYPE_SIZES[desc.type];
      if (!size) {
        throw new Error(`Unknown field type "${desc.type}" for field ${desc.name}`);
      }
      fieldData.push({ desc, value, size });
      byteLength += size;
    }
  }

  // Second pass: write into buffer.
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
    } else {
      ENCODERS[desc.type](view, offset, value);
      offset += size;
    }
  }

  return { buffer, byteLength };
}

/**
 * Decode an ArrayBuffer into a packet object using the field descriptor
 * for its opcode. Returns { opcode, fields }.
 */
export function decodePacket(buffer) {
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

export class RakNetTransport extends Transport {
  constructor(options = {}) {
    super();
    this.options = options;
    this._host = options.host || "roblox.com";
    this._port = options.port || 5222;
    this._connected = false;
    this._socket = null; // set by connect() when implemented
    this._receiveLoop = null;
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

  /**
   * Connect to the Roblox game server and complete the RakNet handshake.
   * Not implemented — socket + handshake logic needed.
   */
  async connect(options = {}) {
    const host = options.host || this._host;
    const port = options.port || this._port;

    throw new NotImplementedError(
      `RakNet.connect to ${host}:${port}. ` +
        "To implement: open a UDP socket, send RakNet connection request, " +
        "wait for ID_CONNECTION_REQUEST_ACCEPTED, then start a receive loop " +
        "that decodes incoming frames via decodePacket() and emits 'packet' events."
    );
  }

  /**
   * Disconnect and close the socket.
   */
  async disconnect() {
    this._connected = false;
    if (this._socket) {
      try {
        this._socket.close();
      } catch (_) {
        // ignore close errors
      }
      this._socket = null;
    }
    if (this._receiveLoop) {
      clearInterval(this._receiveLoop);
      this._receiveLoop = null;
    }
    this.emit("disconnect", {});
  }

  /**
   * Send a RakNet-framed packet. Not implemented — framing logic needed.
   * Accepts { opcode, ...fields } and encodes via encodePacket().
   */
  send(packet) {
    if (!this._connected) {
      throw new Error("RakNetTransport not connected. Call connect() first.");
    }

    const encoded = encodePacket(packet);
    throw new NotImplementedError(
      `RakNet.send for packet opcode 0x${packet.opcode.toString(16)} (${
        PACKET_NAMES[packet.opcode] ?? "unknown"
      }). ` +
        "To implement: wrap the encoded buffer in a RakNet frame (reliability, " +
        "sequencing, split size) and write it to the socket."
    );
  }

  /**
   * Register an event listener.
   */
  on(event, listener) {
    if (typeof this._listeners === "undefined") this._listeners = {};
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return () => this.off(event, listener);
  }

  /**
   * Register a one-time listener.
   */
  once(event, listener) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  /**
   * Remove a listener.
   */
  off(event, listener) {
    if (!this._listeners || !this._listeners[event]) return;
    const idx = this._listeners[event].indexOf(listener);
    if (idx !== -1) this._listeners[event].splice(idx, 1);
  }

  /**
   * Emit an event to all registered listeners.
   */
  emit(event, data) {
    if (!this._listeners || !this._listeners[event]) return;
    for (const listener of this._listeners[event]) {
      try {
        listener(data);
      } catch (_) {
        // listener errors shouldn't break the transport
      }
    }
  }

  /**
   * Internal: emit a decoded packet event.
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

export { encodePacket, decodePacket, isPacketDefined };
export default RakNetTransport;
