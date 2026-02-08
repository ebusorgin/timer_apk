/**
 * Unified transport — one interface: online + DTN + bridging.
 * User never chooses transport; client decides delivery strategy.
 */

import { OnlineRelayTransport } from './OnlineRelayTransport.mjs';
import { DTNTransportStub } from './DTNTransportStub.mjs';
import { isWithinTtl } from '../../shared/messageSchema.mjs';

/**
 * Unified transport: send to relay when online, always queue for DTN; on connect, bridge cache to relay.
 */
export class UnifiedTransport {
  /**
   * @param {string[]} relayServerUrls
   * @param {string} localReceiverId This client's UserID
   */
  constructor(relayServerUrls = [], localReceiverId = '') {
    this.online = new OnlineRelayTransport(relayServerUrls, localReceiverId);
    this.dtn = new DTNTransportStub(localReceiverId);
    this.localReceiverId = localReceiverId;
    this._bridging = false;
  }

  /**
   * Send message: if online, push to relay; always queue for DTN. No transport metadata in message.
   * @param {import('../../shared/types.mjs').Message} message
   */
  async send(message) {
    const avail = await this.online.getAvailability();
    if (avail.online) {
      try {
        await this.online.send(message);
      } catch (_) {
        // fallback to DTN only
      }
    }
    await this.dtn.send(message);
  }

  /**
   * Poll: from relay + from DTN (inbox). Dedupe by message_id, keep highest version.
   */
  async poll() {
    const fromRelay = await this.online.poll();
    const fromDtn = await this.dtn.poll();
    const byId = new Map();
    for (const m of [...fromRelay, ...fromDtn]) {
      const existing = byId.get(m.message_id);
      if (!existing || (existing.version != null && m.version > existing.version)) {
        byId.set(m.message_id, m);
      }
    }
    return Array.from(byId.values());
  }

  async getAvailability() {
    const online = await this.online.getAvailability();
    const dtn = await this.dtn.getAvailability();
    return {
      online: online.online,
      peers: dtn.peers,
    };
  }

  /**
   * Bridging: when online, upload all messages from DTN outbox (for which we are not receiver, still in TTL) to relay.
   * Idempotent by message_id; do not mutate message.
   */
  async bridgeToRelay() {
    if (this._bridging) return;
    const avail = await this.online.getAvailability();
    if (!avail.online) return;
    this._bridging = true;
    try {
      const outbox = this.dtn.getOutbox();
      const now = Math.floor(Date.now() / 1000);
      for (const msg of outbox) {
        if (msg.receiver_id === this.localReceiverId) continue;
        if (!isWithinTtl(msg, now)) continue;
        try {
          await this.online.send(msg);
          this.dtn.removeFromOutbox(msg.message_id);
        } catch (_) {
          // keep in outbox for next bridge
        }
      }
    } finally {
      this._bridging = false;
    }
  }

  /**
   * Call when connection to relay is established (e.g. after getAvailability().online becomes true).
   */
  onRelayConnected() {
    return this.bridgeToRelay();
  }

  get onlineTransport() {
    return this.online;
  }
  get dtnTransport() {
    return this.dtn;
  }
}
