/**
 * Transport base class.
 *
 * Defines the interface all transports (RakNet, web fallback) must implement.
 */

export class Transport {
  constructor() {
    this._connected = false;
  }

  get connected() {
    return this._connected;
  }

  async connect(options) {
    throw new NotImplementedError("Transport.connect");
  }

  async disconnect() {
    throw new NotImplementedError("Transport.disconnect");
  }

  send(packet) {
    throw new NotImplementedError("Transport.send");
  }

  on(event, listener) {
    throw new NotImplementedError("Transport.on");
  }

  once(event, listener) {
    throw new NotImplementedError("Transport.once");
  }

  off(event, listener) {
    throw new NotImplementedError("Transport.off");
  }
}

export default Transport;
