# Royer

> A mineflayer-style headless Roblox bot library for Node.js / Termux (Android).

Control a Roblox character through the headless RakNet protocol with a working web-transport fallback for joining games, users, servers, and friends — today.

[![npm version](https://img.shields.io/npm/v/@xx_amaba_xx/robloxbot)](https://www.npmjs.com/package/@xx_amaba_xx/robloxbot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
- [API Reference](#api-reference)
  - [`new RobloxBot(options)`](#new-robloxbotoptions)
  - [Bot lifecycle](#bot-lifecycle)
  - [Joining games](#joining-games)
  - [Friends](#friends)
  - [Movement](#movement)
  - [Chat](#chat)
  - [Events](#events)
  - [Vision (VLM/LLM + YOLO)](#vision-vllm--yolo)
  - [Map detection](#map-detection)
- [Transport layer](#transport-layer)
- [Examples](#examples)
- [Configuration (.env)](#configuration-env)
- [Architecture](#architecture)
- [Roadmap / Known ceilings](#roadmap-known-ceilings)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Feature | Status |
|---------|--------|
| Join game by ID | ✅ Web transport |
| Join user by ID | ✅ Web transport |
| **Join friend by username** | ✅ Web transport |
| Join specific server (game + job ID) | ✅ Web transport |
| Leave game | ✅ Web transport |
| Find public servers | ✅ Web transport |
| List friends | ✅ Web transport |
| Walk / jump | ⚠️ Stubbed (RakNet not implemented) |
| Chat / whisper | ⚠️ Stubbed (RakNet not implemented) |
| Character state (spawn, health, position) | ⚠️ Stubbed |
| VLM/LLM image understanding | ✅ HTTP service |
| YOLO object/player detection | ✅ HTTP service |
| Headless (no Roblox client needed) | ✅ RakNet transport stub |
| Termux / Android compatible | ✅ No native Node modules |

---

## Installation

```bash
npm install @xx_amaba_xx/robloxbot
```

Requires **Node.js ≥ 18**. Works on Linux, Windows, macOS, and **Termux (Android)**.

---

## Authentication

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then fill in your credentials:

```
# Required — your Roblox account credentials
ROBLOX_USERNAME=your_username
ROBLOX_PASSWORD=your_password

# Optional escape hatch — if login hits CAPTCHA / 2FA / email verification,
# supply your .ROBLOSECURITY cookie directly instead of username/password
ROBLOSECURITY=your_cookie_here

# Optional — URL of your external Python vision service (YOLO + VLM)
VISION_SERVICE_URL=http://localhost:8000
```

### How auth works

1. If `ROBLOSECURITY` is set, it is used directly as the session cookie.
2. Otherwise, the bot logs in with `ROBLOX_USERNAME` / `ROBLOX_PASSWORD`.
3. If login returns `403` (CAPTCHA, email verification, or 2FA required), an `AuthError` is thrown — supply `ROBLOSECURITY` directly in `.env` as a workaround.

> ⚠️ Roblox frequently requires CAPTCHA or 2FA on programmatic logins. If you get an `AuthError`, use the `ROBLOSECURITY` cookie escape hatch.

---

## API Reference

### `new RobloxBot(options)`

```js
import { RobloxBot } from "@xx_amaba_xx/robloxbot";

const bot = new RobloxBot({
  username: process.env.ROBLOX_USERNAME,
  password: process.env.ROBLOX_PASSWORD,
  // cookie: process.env.ROBLOSECURITY,  // alternative to username/password
  // envPath: ".env",                     // path to .env file (default)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `username` | `string` | Roblox username (falls back to env) |
| `password` | `string` | Roblox password (falls back to env) |
| `cookie` | `string` | `.ROBLOSECURITY` cookie (falls back to env) |
| `envPath` | `string` | Path to `.env` file (default: `".env"`) |

### Bot lifecycle

```js
await bot.start();      // Connect, authenticate, initialize core modules
await bot.stop();       // Disconnect and clean up
```

| Property | Type | Description |
|----------|------|-------------|
| `bot.isConnected` | `boolean` | Whether the transport is connected |
| `bot.character` | `Character` | Character state (username, health, position, alive, spawned) |

### Joining games

```js
// Join a game by place ID
await bot.joinGame(12345678);

// Join a specific server by game ID + job ID
await bot.joinServer(12345678, "JobId-1234-5678");

// Leave the current game
await bot.leaveGame();

// Find public servers for a game
const serverIds = await bot.findServers(12345678, {
  limit: 10,               // 10, 25, 50, or 100
  descending: true,        // true = fuller servers first
  ignoreFullServers: true, // skip full servers
});
```

### Friends

```js
// List your friends
const friends = await bot.listFriends();
// → [{ id: 1, username: "FriendOne", ... }, ...]

// Join a friend's game by their username
await bot.joinFriend("FriendOne");
```

`joinFriend` looks up the username in your friends list (case-insensitive) and joins them via the Roblox `FollowUser` protocol. Throws if the username isn't in your friends list.

### Movement (stubbed)

```js
await bot.walk("f", 2);    // walk forward 2 seconds
await bot.walkForward(2);
await bot.walkBack(2);
await bot.walkLeft(2);
await bot.walkRight(2);
await bot.jump(3, 0.5);    // jump 3 times, 0.5s between
```

> ⚠️ These are stubs. They log a warning and return a result object without sending anything, because the RakNet packet spec isn't implemented yet. See [Roadmap](#roadmap-known-ceilings).

### Chat (stubbed)

```js
await bot.chat("Hello world!");
await bot.whisper("FriendOne", "Hey there!");
```

> ⚠️ Stubbed — same limitation as movement.

### Events

`RobloxBot` extends `EventEmitter`. Listen with `bot.on(event, handler)`:

| Event | Payload | Description |
|-------|---------|-------------|
| `join` | — | Bot connected and authenticated |
| `leave` | — | Bot disconnected |
| `spawn` | `Character` | Character spawned in-game |
| `chat` | `{ player, message }` | Chat message received |
| `message` | `{ message, to }` | Bot sent a message |
| `playerJoin` | `object` | A player joined |
| `playerLeave` | `object` | A player left |
| `error` | `Error` | Transport or auth error |
| `end` | — | Bot stopped |
| `vision:detected` | `array` | YOLO detections |
| `vlm:response` | `string` | VLM/LLM response |

```js
bot.on("spawn", (char) => console.log("Spawned as", char.username));
bot.on("chat", (msg) => console.log(`${msg.player}: ${msg.message}`));
bot.on("error", (err) => console.error("Bot error:", err.message));
```

### Vision (VLM/LLM + YOLO)

Vision is opt-in and calls an external Python/HTTP service (native Node vision modules don't compile reliably on Termux). Set `VISION_SERVICE_URL` in `.env`.

The vision service lives in `vision-service/` — a FastAPI backend with YOLO detection and VLM/LLM understanding.

```js
import { createVisionService } from "./src/index.js";

// Auto-created when you start the bot: bot.vision
// Or standalone:
const vision = createVisionService();

// YOLO detection
const detections = await vision.detector.detect(imageBuffer);
// → [{ label: "player", box: [x, y, w, h], confidence: 0.95 }, ...]

// VLM image understanding
const description = await vision.vlm.describe(imageBuffer);
// → "A Roblox character standing near a tree"

// VLM question/answer
const answer = await vision.vlm.ask("What is the player doing?");
// → "The player is walking toward the spawn point."
```

The `detector.defaultLabel` is `"player"` — configurable via `createVisionService({ defaultLabel: "object" })`.

Start the service:

```bash
cd vision-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then point robloxbot at it:

```
VISION_SERVICE_URL=http://<host>:8000
```

See `vision-service/README.md` for full setup (including Termux notes).

> **Note:** The vision service is a separate Python/FastAPI project. It's not included in the npm package — clone the repo if you need it.

### Map detection

`vision.map` provides a headless alternative to client-side script injection. A headless RakNet client has no Roblox client process to inject Lua into, so live map injection is impossible. Instead, `MapInject` fetches static place/asset metadata via the Roblox web API:

```js
const vision = createVisionService();

// Wire the map to the bot's authenticated transport (auto-wired when using bot.vision)
vision.map.setFetch(bot.client.transport.fetch.bind(bot.client.transport));
await vision.map.enable();

// Fetch static metadata for a place (game)
const info = await vision.map.scan(12345678);
// → { placeId: 12345678, enabled: true, data: {...}, scannedAt: ... }

// Fetch metadata for a specific asset (mesh, texture, model)
const asset = await vision.map.scanAsset(987654321);
// → { assetId: 987654321, data: {...} }
```

This is **static metadata only** — not real-time geometry. For live map data, relay observations from a real Roblox client on a companion device, or parse downloaded place files (`.rbxlx`).

---

## Plugin System

robloxbot has a mineflayer-style plugin system. Plugins are JavaScript modules that extend the bot with new capabilities. Load them with `bot.use(plugin, options)`.

### Using a plugin

```js
import { RobloxBot, pathfinding } from "@xx_amaba_xx/robloxbot";

const bot = new RobloxBot({ username, password });
await bot.start();

// Load the built-in pathfinding plugin
bot.use(pathfinding, { gridSize: 32 });

bot.pathfinder.setGrid(myGrid);
bot.pathfinder.setGoal(10, 5);
await bot.pathfinder.goTo(10, 5);

await bot.stop();
```

### Plugin API

A plugin is either:

- **A function:** `(bot, options) => void`
- **An object:** `{ name, apply(bot, options), unload?(bot) }`

```js
// Example: a simple chat-logger plugin
function chatLogger(bot, options) {
  const prefix = options.prefix || "[LOG]";
  bot.on("chat", (msg) => {
    console.log(`${prefix} ${msg.player}: ${msg.message}`);
  });
}
chatLogger.name = "chatLogger";

bot.use(chatLogger, { prefix: "[BOT]" });

// Unload later
bot.unuse("chatLogger");
```

Bot methods for plugins:

| Method | Description |
|--------|-------------|
| `bot.use(plugin, options)` | Load a plugin |
| `bot.unuse(name)` | Unload a plugin by name |
| `bot.hasPlugin(name)` | Check if a plugin is loaded |
| `bot.getPlugin(name)` | Get a loaded plugin instance |
| `bot.loadedPlugins` | Array of loaded plugin names |

### Building third-party plugins

Publish your plugin as a separate npm package (e.g. `robloxbot-myplugin`). Users install it with:

```bash
# NOTE: npm does not have "npm plugin add". Use npm install:
npm install robloxbot-myplugin
```

Then import and use it:

```js
import { RobloxBot } from "@xx_amaba_xx/robloxbot";
import myPlugin from "robloxbot-myplugin";

const bot = new RobloxBot({ username, password });
bot.use(myPlugin, { /* options */ });
```

A plugin package should export a function or object with `apply(bot, options)`. See `src/plugins/pathfinding.js` for a reference implementation.

### Built-in: pathfinding

`src/plugins/pathfinding.js` — grid-based A* pathfinding.

```js
import { pathfinding } from "@xx_amaba_xx/robloxbot";

bot.use(pathfinding, { gridSize: 16, diagonalMovement: false });

// Set up the walkable grid (0 = walkable, 1 = blocked)
bot.pathfinder.setGrid(grid2d, width, height);

// Mark individual cells
bot.pathfinder.setWalkable(x, z, true);

// Find a path
const path = bot.pathfinder.findPath({ x: 0, z: 0 }, { x: 10, z: 5 });

// Follow it (walks each step via bot.walk())
await bot.pathfinder.followPath(path);

// Or combine find + follow
await bot.pathfinder.goTo(10, 5);
```

Pathfinding methods:

| Method | Description |
|--------|-------------|
| `setGrid(grid, w, h)` | Set the 2D walkability grid |
| `setStart(x, z)` | Set start cell |
| `setGoal(x, z)` | Set goal cell |
| `isWalkable(x, z)` | Check if a cell is walkable |
| `setWalkable(x, z, bool)` | Mark a cell walkable/blocked |
| `findPath(start, goal)` | A* pathfinding, returns cell array or `null` |
| `followPath(path, opts)` | Walk each step via `bot.walk()` |
| `goTo(x, z, opts)` | Find path + follow in one call |

### Built-in: visionPathfinding

`src/plugins/vision-pathfinding.js` — YOLO-guided pathfinding. Uses object detection to spot goals and obstacles, builds a walkability grid, then runs A* to find the distance and route.

```js
import { visionPathfinding } from "@xx_amaba_xx/robloxbot";

bot.use(visionPathfinding, {
  gridSize: 32,          // grid cells per side
  pixelsPerCell: 50,     // how many image pixels = 1 grid cell
  goalLabels: ["player", "goal"],   // YOLO labels treated as goal
  obstacleLabels: ["wall", "obstacle", "npc", "object"], // YOLO labels treated as blocked
});

// Step 1: YOLO looks at an image and finds goal + obstacles
const detections = await bot.vision.detector.detect(imageBuffer);

// Step 2: Convert detections to a walkability grid
bot.visionPathfinding.processDetections(detections, imageWidth, imageHeight);

// Step 3: Ask "how far is the goal?"
const distance = bot.visionPathfinding.getDistanceToGoal();
// → 7 (Manhattan distance in cells)

// Step 4: Find and follow the path
await bot.visionPathfinding.followPathToGoal();
// Walks step by step toward the goal, avoiding detected obstacles

// Or do it all in one call (detect → grid → path → walk)
await bot.visionPathfinding.navigateFromImage(imageBuffer, imageWidth, imageHeight);
```

Methods:

| Method | Description |
|--------|-------------|
| `setBotPosition(x, z)` | Set bot's current grid cell |
| `setGoal(x, z)` | Manually set goal cell |
| `setCell(x, z, walkable)` | Mark a cell walkable/blocked |
| `clearGrid()` | Reset grid and goal |
| `processDetections(detections, imgW, imgH, opts)` | Convert YOLO detections to grid |
| `getDistanceToGoal()` | Manhattan distance bot→goal (null if no goal) |
| `findPathToGoal()` | A* pathfinding, returns {found, distance, path} |
| `followPathToGoal(opts)` | Find path + walk each step via bot.walk() |
| `navigateFromImage(imageBuffer, imgW, imgH, opts)` | Detect → grid → path → walk in one call |

### Built-in: autoReconnect

`src/plugins/auto-reconnect.js` — automatically reconnects on disconnect with exponential backoff.

```js
import { autoReconnect } from "@xx_amaba_xx/robloxbot";

bot.use(autoReconnect, {
  maxAttempts: 10,
  minDelay: 5000,   // ms
  maxDelay: 60000,  // ms
});

bot.autoReconnect.stop();   // stop retrying
bot.autoReconnect.start();  // resume retrying
bot.autoReconnect.isReconnecting(); // boolean
bot.autoReconnect.attempts(); // current attempt number
```

Events: `reconnecting`, `reconnected`, `reconnect-error`, `reconnect-failed`

### Built-in: commands

`src/plugins/commands.js` — chat command framework with prefix, aliases, and cooldowns.

```js
import { commands } from "@xx_amaba_xx/robloxbot";

bot.use(commands, { prefix: "!", cooldownMs: 1000 });

bot.commands.register("ping", (args, msg) => bot.chat("pong!"));
bot.commands.register("say", (args, msg) => bot.chat(args.join(" ")), { alias: "s" });

// In-game chat: "!ping" → bot replies "pong!"
// In-game chat: "!say hello world" → bot replies "hello world!"
```

Methods: `register(name, handler, opts)`, `unregister(name)`, `get(name)`, `parse(message)`, `commands()`

### Built-in: macros

`src/plugins/macros.js` — record and play back action sequences.

```js
import { macros } from "@xx_amaba_xx/robloxbot";

bot.use(macros);

bot.macros.record("greeting");
await bot.walkForward(2);
await bot.chat("Hello!");
await bot.jump();
bot.macros.stop();

await bot.macros.play("greeting");
await bot.macros.play("greeting", { repeat: 3 });
bot.macros.remove("greeting");
bot.macros.list(); // ["greeting", ...]
```

Methods: `record(name)`, `stop()`, `play(name, opts)`, `remove(name)`, `list()`, `get(name)`, `isRecording()`

### Built-in: settings

`src/plugins/settings.js` — key-value settings with optional persistence.

```js
import { settings } from "@xx_amaba_xx/robloxbot";

bot.use(settings, { defaults: { walkspeed: 16, theme: "dark" } });

bot.settings.set("walkspeed", 20);
bot.settings.get("walkspeed"); // 20
bot.settings.get("missing", "fallback"); // "fallback"

await bot.settings.save();
await bot.settings.load();
```

Methods: `get(key, fallback)`, `set(key, value)`, `has(key)`, `del(key)`, `all()`, `reset()`, `save()`, `load()`

### Built-in: entities

`src/plugins/entities.js` — entity tracking stub (documented ceiling below).

```js
import { entities } from "@xx_amaba_xx/robloxbot";

bot.use(entities);

bot.entities.add({ userId: 2, username: "Player2", position: { x: 1, y: 0, z: 0 } });
bot.entities.get(2);
bot.entities.getAll();
bot.entities.remove(2);
bot.entities.count();
```

⚠️ Real entity tracking requires RakNet to receive server position updates. Without RakNet, only the bot itself is tracked.

### Built-in: inventory

`src/plugins/inventory.js` — inventory stub (documented ceiling below).

```js
import { inventory } from "@xx_amaba_xx/robloxbot";

bot.use(inventory);

bot.inventory.add({ id: "sword", name: "Iron Sword", type: "weapon" });
bot.inventory.get("sword");
bot.inventory.equip("sword");
bot.inventory.unequip("sword");
bot.inventory.equipped(); // currently equipped items
bot.inventory.remove("sword");
```

⚠️ Real inventory requires RakNet inventory packets or Roblox inventory web API. Without either, only manually added items are tracked.

---




## Transport layer

Two transports implement the same `Transport` ABC:

| Transport | File | Status |
|-----------|------|--------|
| `RakNetTransport` | `src/transport/raknet.js` | Skeleton — packet encode/decode helpers + `NotImplementedError` on connect/send |
| `WebTransport` | `src/transport/web.js` | ✅ Real — Roblox web API (join, friends, servers, presence, fetch) |

`RobloxClient` defaults to RakNet and auto-falls back to Web when RakNet isn't implemented. You can also inject your own transport:

```js
import { RobloxClient, WebTransport } from "@xx_amaba_xx/robloxbot";

const client = new RobloxClient({
  transport: new WebTransport({ cookie: process.env.ROBLOSECURITY }),
});
```

The RakNet skeleton includes `encodePacket()` / `decodePacket()` helpers and field descriptors in `src/constants/packets.js`. To make RakNet real, implement socket + handshake in `connect()` and RakNet framing in `send()`, then fill in real field layouts as you reverse-engineer the protocol.

---

## Examples

### Minimal bot

```js
import { RobloxBot } from "@xx_amaba_xx/robloxbot";

const bot = new RobloxBot({
  username: process.env.ROBLOX_USERNAME,
  password: process.env.ROBLOX_PASSWORD,
});

bot.on("join", () => console.log("Connected!"));
bot.on("error", (err) => console.error("Error:", err.message));

await bot.start();
await bot.joinGame(12345678);
await bot.stop();
```

### Join a friend

```js
import { RobloxBot } from "@xx_amaba_xx/robloxbot";

const bot = new RobloxBot({ username, password });
await bot.start();

const friends = await bot.listFriends();
console.log("Friends:", friends.map(f => f.username));

await bot.joinFriend("BestFriend");
await bot.stop();
```

### With vision service

```js
import { RobloxBot, createVisionService } from "@xx_amaba_xx/robloxbot";

const bot = new RobloxBot({ username, password });
const vision = createVisionService();

bot.on("chat", async (msg) => {
  if (msg.message === "!look") {
    const image = await captureScreenshot(); // your own capture logic
    const desc = await vision.vlm.describe(image);
    await bot.chat(desc);
  }
});

await bot.start();
```

---

## Configuration (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `ROBLOX_USERNAME` | Yes* | Roblox username |
| `ROBLOX_PASSWORD` | Yes* | Roblox password |
| `ROBLOSECURITY` | No* | Session cookie (escape hatch for CAPTCHA/2FA) |
| `VISION_SERVICE_URL` | No | External vision service URL |

\* At least one of (`ROBLOSECURITY`) or (`ROBLOX_USERNAME` + `ROBLOX_PASSWORD`) is required.

Copy `.env.example` to `.env` and never commit your real `.env` (it's in `.gitignore`).

---

## Architecture

```
src/
  index.js              # Public API exports
  bot.js                # RobloxBot class (EventEmitter) — high-level API
  client.js             # RobloxClient — owns Transport + auth
  events.js             # EventEmitter wrapper over Node `events`
  exceptions.js         # RobloxError, AuthError, TransportError, NotImplementedError
  utils.js              # loadEnv, sleep, buildRobloxUri
  transport/
    base.js             # Transport ABC interface
    raknet.js           # RakNet headless skeleton (encode/decode + stubs)
    web.js              # Roblox web API (real implementation + fetch)
  core/
    character.js        # Character state tracking
    movement.js         # Walk/jump (stubbed over transport)
    chat.js             # Say/whisper (stubbed over transport)
    game_join.js        # joinGame/joinUser/joinFriend/joinServer/leaveGame/findServers/listFriends
  plugins/
    auto-reconnect.js   # Auto-reconnect with exponential backoff
    commands.js         # Chat command framework (prefix, aliases, cooldowns)
    macros.js           # Record/play action sequences
    settings.js         # Key-value settings with persistence
    entities.js         # Entity tracking stub
    inventory.js        # Inventory stub
    pathfinding.js      # Grid-based A* pathfinding
    vision-pathfinding.js  # YOLO-guided pathfinding
  vision/
    index.js            # VisionDetector, VLM, MapInject, createVisionService
  constants/
    keys.js             # Keybind constants
    packets.js          # RakNet packet opcode + field skeleton

> **Note:** The npm package only includes `src/`. The `vision-service/` and `test/` directories are in the GitHub repo.
```

---

## Problems / Known Issues

| Problem | Impact | Workaround |
|---------|--------|------------|
| **Walk/jump/chat don't reach the game** | RakNet transport is a skeleton — `connect()`/`send()` throw `NotImplementedError`. Local simulation updates `bot.character.position` but nothing reaches Roblox. | Reverse-engineer RakNet protocol, implement socket+handshake in `src/transport/raknet.js`, fill `src/constants/packets.js` with real field layouts. |
| **Character state not populated from game** | `spawn`, `health`, `position` come from local simulation, not server packets. | Implement RakNet receive loop that decodes player spawn/movement packets into `bot.character.update()`. |
| **No real entity positions** | `bot.entities` only tracks manually added entities. Other players' positions aren't received. | Implement RakNet player join/leave/movement packet handling. |
| **No real inventory** | `bot.inventory` only tracks manually added items. | Implement RakNet inventory packets or Roblox inventory web API calls. |
| **Map injection impossible headlessly** | No Roblox client process to inject Lua into. | `MapInject` uses web API for static place/asset metadata only. |
| **Native vision modules don't compile on Termux** | `onnxruntime-node`, `sharp`, `torch` may fail to build on Android. | Use external Python vision service (`VISION_SERVICE_URL`) instead. |
| **Roblox login hits CAPTCHA/2FA** | Username/password login returns 403 on many accounts. | Supply `ROBLOSECURITY` cookie directly in `.env`. |
| **Web transport is HTTP, not in-game** | `joinGame`/`joinUser` work via web API but don't control a character. | Only useful for getting into a game; in-game control needs RakNet. |

---

## Roadmap

| Item | Plan |
|------|------|
| RakNet packet spec | Reverse-engineer from real client traffic; fill `packets.js` field layouts |
| Real walk/jump/chat | Implement RakNet socket + framing; `movement.js`/`chat.js` already structured to send packets |
| Real entity tracking | Wire RakNet player packets into `entities.js` |
| Real inventory | Wire RakNet inventory packets or web API into `inventory.js` |
| Plugin marketplace | Document `npm install` pattern for third-party plugins |

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "feat: add your feature"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Run tests and lint before submitting:

```bash
npm test        # vitest — 83 tests
npm run lint    # eslint
npm run format  # prettier
```

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Repository

https://github.com/pal3241/Royer
