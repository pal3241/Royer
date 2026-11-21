# Royer

> A mineflayer-style headless Roblox bot library for Node.js / Termux (Android).

Control a Roblox character through the headless RakNet protocol with a working web-transport fallback for joining games, users, servers, and friends — today.

[![npm version](https://img.shields.io/npm/v/robloxbot)](https://www.npmjs.com/package/robloxbot)
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
# Clone
git clone https://github.com/pal3241/Royer.git
cd Royer

# Install dependencies
npm install
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
import { RobloxBot } from "./src/index.js";

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

```js
import { createVisionService } from "./src/index.js";

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

### Map detection

`vision.map` is a stub with a documented ceiling:

```js
const vision = createVisionService();

// Throws — headless RakNet has no Roblox client to inject Lua into
await vision.map.enable();
```

See `src/vision/map_inject.js` for the full ceiling explanation and alternatives (web API asset fetch, or relay observations from a real Roblox client on a companion device).

---

## Transport layer

Two transports implement the same `Transport` ABC:

| Transport | File | Status |
|-----------|------|--------|
| `RakNetTransport` | `src/transport/raknet.js` | Stub — `connect()`/`send()` throw `NotImplementedError` |
| `WebTransport` | `src/transport/web.js` | ✅ Real — Roblox web API (join, friends, servers, presence) |

`RobloxClient` defaults to RakNet and auto-falls back to Web when RakNet isn't implemented. You can also inject your own transport:

```js
import { RobloxClient, WebTransport } from "./src/index.js";

const client = new RobloxClient({
  transport: new WebTransport({ cookie: process.env.ROBLOSECURITY }),
});
```

---

## Examples

### Minimal bot

```js
import { RobloxBot } from "./src/index.js";

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
const bot = new RobloxBot({ username, password });
await bot.start();

const friends = await bot.listFriends();
console.log("Friends:", friends.map(f => f.username));

await bot.joinFriend("BestFriend");
await bot.stop();
```

### With vision service

```js
import { RobloxBot, createVisionService } from "./src/index.js";

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
    raknet.js           # RakNet headless protocol (stub)
    web.js              # Roblox web API (real implementation)
  core/
    character.js        # Character state tracking
    movement.js         # Walk/jump (stubbed over transport)
    chat.js             # Say/whisper (stubbed over transport)
    game_join.js        # joinGame/joinUser/joinFriend/joinServer/leaveGame/findServers/listFriends
  vision/
    index.js            # VisionDetector, VLM, MapInject, createVisionService
  constants/
    keys.js             # Keybind constants
    packets.js          # RakNet packet opcode skeleton
test/
  bot.test.js
  transport.test.js
  vision.test.js
```

---

## Roadmap / Known ceilings

| Item | Ceiling / Plan |
|------|---------------|
| RakNet packet spec | Reverse-engineer Roblox's game protocol; wire opcodes in `src/constants/packets.js` and `src/transport/raknet.js` |
| Real walk/jump/chat | Requires RakNet framing; currently stubbed with clear warnings |
| Map injection | Impossible headlessly — no Roblox client process to inject Lua into. Alternatives: web API asset fetch, or relay from a real client |
| Native vision on Termux | `onnxruntime-node` / `sharp` don't compile reliably; external HTTP vision service recommended |
| CAPTCHA / 2FA login | Use `ROBLOSESCURITY` cookie directly |

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "feat: add your feature"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Run tests and lint before submitting:

```bash
npm test        # vitest — 26 tests
npm run lint    # eslint
npm run format  # prettier
```

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Repository

https://github.com/pal3241/Royer
