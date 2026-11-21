import { EventEmitter } from "node:events";

export class RobloxEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

export default RobloxEventEmitter;
