# net.aiternitas.ru — Architecture

## Critical axiom

**There is only one type of participant: NODE.**

There are no servers, no clients, no special roles. A node may run on Android, iOS, Windows, Linux, macOS. Differences between nodes are only environmental: some have internet connectivity, some do not.

---

## Core principle

All nodes:

- create messages
- store messages
- forward messages
- bridge transports automatically

Transport availability MUST NOT affect logic or crypto.

---

## 1. Architecture description

**Single participant type:** every entity is a **node**. A node has:

- A long-term keypair (generated on first launch).
- **NodeID** = hash(public_key). No accounts, phone numbers, or emails.
- Local storage (bounded: message count cap, storage size cap).
- Access to zero or more **transports** (BLE, Wi-Fi Direct, internet).

**Behavior:**

- When a node **sends** a message: it stores it locally, offers it to every locally available transport (BLE, Wi-Fi Direct, internet if present). It does not “choose” client vs server; it just forwards via whatever is available.
- When a node **receives** a message (from any transport): it verifies the signature, keeps at most one copy per `message_id` (highest version), stores it, and may forward it again via its own transports (store-and-forward).
- When **internet becomes available**: the node attempts to forward all stored messages (for which it is not the receiver and which are still within TTL) over the internet — it acts as a bridge. No separate “relay server” role: any node with internet can be reached by others and can exchange messages; an “always-on internet node” is just a node with stable connectivity and possibly larger storage.

**Logic and crypto** are identical for every node. No code path depends on “am I server or client”; only “which transports are available right now”.

---

## 2. Node state machine

A node’s **operational state** is driven by environment and message flow, not by role.

```
                    ┌─────────────────────────────────────────┐
                    │                  NODE                    │
                    │  - keypair, NodeID                       │
                    │  - local store (bounded)                  │
                    │  - transport set (BLE / Wi‑Fi Direct /    │
                    │    internet — each can be up or down)    │
                    └─────────────────────────────────────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
   [SEND path]                    [RECEIVE path]                 [ENVIRONMENT]
   - create message               - get message from             - transport up/down
   - store locally                  any transport                 (e.g. internet available)
   - offer to all                 - verify signature              → trigger: forward
     local transports             - merge by message_id             all forwardable
   - if internet:                   (keep highest version)          messages
     also offer there             - store
                                  - may forward to
                                    other transports
         │                               │
         │                               ▼
         │                        [FOR SELF?]
         │                         - if receiver_id == NodeID:
         │                             decrypt, display,
         │                             emit DELETE (higher version),
         │                             propagate DELETE
         └───────────────────────────────┴───────────────────────────────┘
```

**Invariants:**

- Node does not have “modes” (client/server). It has **available transports** and **storage state**.
- Decisions are: “do I have a message to forward?”, “is this for me?”, “can I delete this?” — all independent of “server” vs “client”.

---

## 3. Transport abstraction

**Transport** = a way to send and receive **the same message object** (no transport-specific metadata in the message).

- **Offline transport:** BLE, Wi-Fi Direct. Epidemic store-and-forward; no routing, no delivery guarantees. Peer discovery and exchange of message summaries / missing messages are transport-specific.
- **Internet transport:** any IP connectivity. Nodes exchange message summaries and missing messages with other nodes they can reach. Any node with internet can act as a temporary bridge for others.

**Abstraction (conceptual):**

- `offer(message)` — try to send this message to the world via this transport (best-effort).
- `receive()` / callback — messages that this transport has delivered to this node.
- `availability()` — whether this transport is currently usable (e.g. internet up, peers in range).

**Critical:** Crypto and message format do not depend on which transport is used. The same message is valid on BLE, Wi-Fi Direct, or internet. Transport availability must not change verification rules, version rules, or deletion rules.

---

## 4. Message lifecycle

**Message (immutable):**

- `message_id`, `sender_id`, `receiver_id`, `encrypted_payload`, `created_at`, `ttl_seconds`, `version`, `sender_signature`.
- Same object for all transports.

**State rules (strict):**

- Messages start **ACTIVE** (version = 1).
- The only transition is to **DEAD** (higher version, e.g. 2), via a DELETE-control message (same `message_id`, higher `version`, valid signature from sender or receiver).
- No resurrection, no reissue, no key rotation.

**Lifecycle:**

1. **Creation:** Sender creates message (version 1), signs it, stores locally, offers to all local transports (including internet if available).
2. **Propagation:** Other nodes receive it (any transport), verify signature, keep highest version per `message_id`, store, and may forward via their transports. No guarantee of delivery.
3. **At receiver (message for self):** Node with `receiver_id == NodeID` decrypts, displays, emits DELETE-control (higher version), propagates DELETE via all transports.
4. **Deletion:** A node may **delete** a message from its store only if at least one of: TTL expired, DELETE-control with higher version received, storage limits exceeded, or payload is cryptographically expired (past TTL for decryption). No other deletion reasons.
5. **Time-based encryption:** Payload is encrypted once. Decryption key is derived from time-slot KDF. After `ttl_seconds`, the payload is undecryptable; no re-encryption, no message mutation.

---

## 5. Failure cases

- **Transport unavailable:** Node continues to store and forward when transport returns. No logic or crypto change.
- **Message dropped:** No retransmission guarantee. Store-and-forward is best-effort.
- **Malicious or lazy node:** May drop or delay messages. Verification (signature, version) is done on receive; invalid or outdated messages are discarded. No trust in intermediaries.
- **Storage full:** Eviction by policy (e.g. LRU, expiry). Only messages that satisfy deletion conditions may be removed; hard caps on count and size are enforced.
- **Key compromise:** No revocation. New identity = new NodeID; old messages are not “recalled”.
- **Duplicate / reordered delivery:** Node keeps only one copy per `message_id` (highest version). Idempotent merge.

---

## 6. Deletion conditions (strict)

A node may delete a message **only** if:

1. TTL expired (`now - created_at > ttl_seconds`), or  
2. DELETE-control with higher version received (same `message_id`), or  
3. Storage limits exceeded (eviction policy: e.g. LRU / expiry), or  
4. Payload is cryptographically expired (cannot derive decryption key; no need to keep).

No other reasons (e.g. “user asked to delete” is implemented by emitting DELETE-control and propagating; actual deletion happens when condition 2 is applied).

---

## 7. UX

- User never selects “mode” (offline/online). Offline routing is invisible.
- No read receipts, no delivery guarantees.
- Same behavior on Android, iOS, Windows, Linux, macOS; only transports available per platform differ.

---

## Implementation note

In code, a process that **listens on HTTP** and stores/forwards messages is still a **node**; it is often called “relay” or “server” for deployment convenience, but by design it behaves like any other node: it creates, stores, forwards, and bridges. A process that only has a UI and no listening port is also a node. The axiom “only nodes” is the architectural truth; naming in the codebase may retain “server”/“client” for clarity of which process listens where, but the spec and behavior are node-uniform.
