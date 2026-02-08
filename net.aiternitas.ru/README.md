# net.aiternitas.ru

Decentralized hybrid messenger: **one participant type — NODE**. No servers, no clients, no special roles. Nodes create, store, forward, and bridge; differences are only environmental (e.g. internet vs no internet).

## Critical axiom

There is **only one type of participant: NODE**. All nodes:

- create messages
- store messages
- forward messages
- bridge transports automatically

Transport availability does not affect logic or crypto.

## Philosophy

- **Internet optional** — offline delivery via BLE / Wi-Fi Direct (people movement).
- **No central authority** — no root server; any node with internet can act as a bridge.
- **No monetization** — no ads, no tracking.
- **End-to-end encryption** — same immutable message object for all transports; no transport metadata in message.

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for:

- Architecture description (node-only, no server/client roles)
- Node state machine
- Transport abstraction (offline: BLE, Wi-Fi Direct; internet: any IP)
- Message lifecycle (ACTIVE → DEAD only; time-based encryption; deletion conditions)
- Failure cases

**Message:** `message_id`, `sender_id`, `receiver_id`, `encrypted_payload`, `created_at`, `ttl_seconds`, `version`, `sender_signature`. State: ACTIVE (version=1) → DEAD (higher version) only; no resurrection.

**Identity:** long-term keypair on first launch; **NodeID** = hash(public_key); private key never leaves device; no accounts.

## Usage

Every process is a **node**. In this repo:

- **Node with HTTP listener** (often called “relay” for deployment): stores and forwards messages over internet; other nodes can push/pull via it. Same behavior as any node; only “always-on + reachable” differs.
- **Node without listener** (e.g. app): creates messages, stores locally, uses BLE/Wi-Fi Direct stub and/or HTTP to reach the listener node.

### Run a node that listens on HTTP (optional, for internet path)

```bash
npm install
PORT=3000 node server/server.mjs
```

Optional env: `MAX_MESSAGES`, `MAX_STORAGE_BYTES`. Endpoints: `POST /messages`, `GET /messages?receiver_id=<NodeID>`, `POST /federation/messages`, `GET /health`.

### Run a node (e.g. demo: send to self via HTTP)

```js
import { createIdentity, MessengerClient } from 'net.aiternitas.ru';

const identity = await createIdentity();  // NodeID = identity.userId
const client = new MessengerClient(identity, ['http://localhost:3000']);

const msg = await client.send('Hello', receiverNodeId, receiverBoxPublic, 86400);
const list = await client.poll();
```

### Exports

- **Crypto:** `createIdentity`, `identityFromSecretKey`, `userIdFromPublicKey`, `signKeypairToBox`, `maxTtlForKeyAge`.
- **Message:** `validateMessage`, `isDead`, `isWithinTtl`, `buildMessage`, `buildDeleteMessage`, `mergeByVersion`.
- **Node (unified):** `MessengerClient`, `UnifiedTransport`, `OnlineRelayTransport`, `DTNTransportStub`.
- **Store (any node):** `RelayStore`.

## Non-goals

- Guaranteed delivery or read receipts.
- Revocation after key compromise (new key = new NodeID).
- Full metadata hiding (intermediaries may see sender_id, receiver_id, time, size).
- Editing messages or undoing DELETE.

## Web app

- **Backend:** auth (register/login), DB (SQLite: users, contacts), API: `/api/auth/*`, `/api/contacts`, `/api/messages/build`, `/api/messages`.
- **Frontend:** `web/` — Vite + React. Landing (вход/регистрация), контакты (NodeID + ключ), чат. После `npm run web:build` сервер раздаёт SPA из корня.
- **Tests:** `npm test` — unit + web API tests (25 tests).

## Limits

- Delivery is probabilistic; nodes may drop messages.
- Offline delivery depends on BLE / Wi-Fi Direct (platform-specific; this repo provides a DTN stub).
- Storage: hard cap on message count and size; LRU/expiry eviction.
