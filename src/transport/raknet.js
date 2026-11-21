/**
 * RakNet headless transport stub.
 *
 * Implements the Transport ABC but raises NotImplementedError until the
 * Roblox RakNet packet spec is reverse-engineered and wired in.
 */

import { Transport } from "./base.js";
import { NotImplementedError } from "../exceptions.js";
import { PACKET_OPCODES } from "../constants/packets.js";

export class RakNetTransport extends Transport {
  constructor(options = {}) {
    super();
    this.options = options;
    this._host = options.host || "roblox.com";
    this._port = options.port || 5222;
  }

  get connected() {
    return this._connected;
  }

  async connect(options) {
    throw new NotImplementedError(
      `RakNet.connect to ${this._host}:${this._port}. ` +
        "Implement RakNet handshake + Roblox packet opcodes " +
        JSON.stringify(PACKET_OPCODES) +
        " or fall back to the web transport."
    );
  }

  async disconnect() {
    if (!this._connected) return;
    this._connected = false;
  }

  send(packet) {
    throw new NotImplementedError(
      `RakNet.send for packet opcode ${packet.opcode ?? "unknown"}. ` +
        "Implement RakNet framing or use web transport."
    );
  }

  on(event, listener) {
    throw new NotImplementedError("RakNet.on");
  }

  once(event, listener) {
    throw new NotImplementedError("RakNet.once");
  }

  off(event, listener) {
    throw new NotImplementedError("RakNet.off");
  }
}

export default RakNetTransport;
