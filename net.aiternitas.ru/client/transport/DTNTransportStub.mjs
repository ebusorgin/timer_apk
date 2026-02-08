/**
 * DTN transport stub — in-memory store for offline queue and peer exchange.
 * Real BLE / Wi-Fi Direct would be platform-specific (mobile, native).
 * Same message object; no transport metadata in message.
 */

import { TransportInterface } from './TransportInterface.mjs';

/**
 * DTN transport: store messages for epidemic propagation; poll returns messages
 * "delivered" by peers (in stub: manually pushed for testing).
 */
export class DTNTransportStub extends TransportInterface {
  /**
   * @param {string} [localReceiverId] This client's UserID (filter incoming)
   */
  constructor(localReceiverId = '') {
    super();
    this.localReceiverId = localReceiverId;
    /** @type {import('../../../shared/types.mjs').Message[]} */
    this.outbox = [];
    /** @type {import('../../../shared/types.mjs').Message[]} */
    this.inbox = [];
    this._peers = 0;
  }

  /**
   * Queue message for DTN propagation (store-and-forward).
   */
  async send(message) {
    this.outbox.push(message);
  }

  /**
   * Return messages in inbox (for this receiver); clear inbox after read if desired.
   * In real DTN, peers would push into inbox when in range.
   */
  async poll() {
    const list = this.localReceiverId
      ? this.inbox.filter((m) => m.receiver_id === this.localReceiverId)
      : [...this.inbox];
    this.inbox = this.inbox.filter((m) => m.receiver_id !== this.localReceiverId);
    return list;
  }

  async getAvailability() {
    return { online: false, peers: this._peers };
  }

  /**
   * Stub: simulate peer delivery — push message into this node's inbox.
   * @param {import('../../../shared/types.mjs').Message} message
   */
  injectFromPeer(message) {
    this.inbox.push(message);
  }

  /**
   * Stub: set peer count for getAvailability().
   */
  setPeers(n) {
    this._peers = n;
  }

  /**
   * Get outbox (messages to propagate). Bridging will upload these to relay when online.
   */
  getOutbox() {
    return [...this.outbox];
  }

  /**
   * Remove from outbox after successful relay upload (do not mutate message).
   */
  removeFromOutbox(messageId) {
    this.outbox = this.outbox.filter((m) => m.message_id !== messageId);
  }
}
