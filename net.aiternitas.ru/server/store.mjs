/**
 * Relay server store — by receiver_id, TTL eviction, max messages and storage.
 * Blind: no decryption; only encrypted payload stored.
 */

import { validateMessage } from '../shared/messageSchema.mjs';
import { isWithinTtl } from '../shared/messageSchema.mjs';
import { DEFAULT_MAX_MESSAGES, DEFAULT_MAX_STORAGE_BYTES } from '../shared/constants.mjs';

/**
 * In-memory store: receiver_id -> list of messages (by message_id, keep highest version).
 * Eviction: TTL, then by oldest expiry, then by total size.
 */
export class RelayStore {
  /**
   * @param {{ maxMessages?: number, maxStorageBytes?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.maxStorageBytes = opts.maxStorageBytes ?? DEFAULT_MAX_STORAGE_BYTES;
    /** @type {Map<string, Map<string, import('../shared/types.mjs').Message>>} receiver_id -> message_id -> message */
    this.byReceiver = new Map();
    /** @type {Map<string, import('../shared/types.mjs').Message>>} message_id -> message (for dedupe) */
    this.byId = new Map();
    this._totalMessages = 0;
    this._totalBytes = 0;
  }

  /**
   * @param {import('../shared/types.mjs').Message} msg
   * @returns {number} Approximate byte size
   */
  _messageSize(msg) {
    return (
      (msg.message_id?.length ?? 0) +
      (msg.sender_id?.length ?? 0) +
      (msg.receiver_id?.length ?? 0) +
      (typeof msg.encrypted_payload === 'string' ? msg.encrypted_payload.length : 0) +
      (msg.sender_signature?.length ?? 0) +
      50
    );
  }

  _evict() {
    const now = Math.floor(Date.now() / 1000);
    const expired = [];
    for (const [receiverId, map] of this.byReceiver) {
      for (const [messageId, msg] of map.entries()) {
        if (!isWithinTtl(msg, now)) expired.push({ receiverId, messageId, msg });
      }
    }
    for (const { receiverId, messageId, msg } of expired) {
      this._remove(receiverId, messageId, msg);
    }
    while (this._totalMessages > this.maxMessages || this._totalBytes > this.maxStorageBytes) {
      let oldest = null;
      let oldestExpiry = Infinity;
      for (const [receiverId, map] of this.byReceiver) {
        for (const [messageId, msg] of map.entries()) {
          const expiry = msg.created_at + msg.ttl_seconds;
          if (expiry < oldestExpiry) {
            oldestExpiry = expiry;
            oldest = { receiverId, messageId, msg };
          }
        }
      }
      if (!oldest) break;
      this._remove(oldest.receiverId, oldest.messageId, oldest.msg);
    }
  }

  _remove(receiverId, messageId, msg) {
    const map = this.byReceiver.get(receiverId);
    if (map) {
      map.delete(messageId);
      if (map.size === 0) this.byReceiver.delete(receiverId);
    }
    this.byId.delete(messageId);
    this._totalMessages--;
    this._totalBytes -= this._messageSize(msg);
  }

  /**
   * Store message. Validate format only (blind relay). Keep only highest version per message_id.
   * @param {unknown} raw
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  put(raw) {
    const result = validateMessage(raw);
    if (!result.ok) return result;
    const msg = result.message;
    const existing = this.byId.get(msg.message_id);
    if (existing && existing.version >= msg.version) {
      return { ok: true };
    }
    this._evict();
    if (this._totalMessages >= this.maxMessages || this._totalBytes + this._messageSize(msg) > this.maxStorageBytes) {
      this._evict();
      if (this._totalMessages >= this.maxMessages) return { ok: false, error: 'Storage limit: max messages' };
      if (this._totalBytes + this._messageSize(msg) > this.maxStorageBytes) return { ok: false, error: 'Storage limit: max bytes' };
    }
    const receiverId = msg.receiver_id;
    if (!this.byReceiver.has(receiverId)) this.byReceiver.set(receiverId, new Map());
    const map = this.byReceiver.get(receiverId);
    if (existing) this._remove(receiverId, msg.message_id, existing);
    map.set(msg.message_id, msg);
    this.byId.set(msg.message_id, msg);
    this._totalMessages++;
    this._totalBytes += this._messageSize(msg);
    return { ok: true };
  }

  /**
   * Get messages for receiver_id (and optionally remove after delivery; we don't remove by default).
   * @param {string} receiverId
   * @returns {import('../shared/types.mjs').Message[]}
   */
  getForReceiver(receiverId) {
    this._evict();
    const map = this.byReceiver.get(receiverId);
    if (!map) return [];
    return Array.from(map.values());
  }

  /**
   * Return all message_ids (for federation: other servers can ask what we have).
   * @returns {string[]}
   */
  getAllMessageIds() {
    this._evict();
    return Array.from(this.byId.keys());
  }

  get totalMessages() {
    return this._totalMessages;
  }
  get totalBytes() {
    return this._totalBytes;
  }
}
