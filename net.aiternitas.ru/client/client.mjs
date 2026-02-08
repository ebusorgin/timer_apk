/**
 * Client facade — one messenger with multiple transports.
 * User never chooses transport; bridging on connect.
 */

import { buildMessage, buildDeleteMessage } from '../core/messageCore.mjs';
import { decryptPayload, signKeypairToBox } from '../shared/crypto.mjs';
import { UnifiedTransport } from './transport/UnifiedTransport.mjs';

/**
 * Client: identity + unified transport. Send, poll, bridge.
 */
export class MessengerClient {
  /**
   * @param {{ publicKey: Uint8Array, secretKey: Uint8Array, userId: string, keyCreatedAt: number }} identity
   * @param {string[]} [relayServerUrls]
   */
  constructor(identity, relayServerUrls = []) {
    this.identity = identity;
    this.transport = new UnifiedTransport(relayServerUrls, identity.userId);
  }

  /**
   * Send message: encrypt, sign, send via unified transport (online + DTN). No transport metadata.
   * @param {string|Uint8Array} plaintext
   * @param {string} receiverId UserID
   * @param {Uint8Array} receiverBoxPublic Receiver's Curve25519 public key
   * @param {number} ttl_seconds
   * @returns {Promise<import('../shared/types.mjs').Message>}
   */
  async send(plaintext, receiverId, receiverBoxPublic, ttl_seconds) {
    const msg = await buildMessage(
      plaintext,
      this.identity,
      receiverId,
      receiverBoxPublic,
      ttl_seconds
    );
    await this.transport.send(msg);
    await this.transport.onRelayConnected();
    return msg;
  }

  /**
   * Poll for incoming messages (relay + DTN). Dedupe by message_id, highest version.
   */
  async poll() {
    return this.transport.poll();
  }

  /**
   * Decrypt payload (for messages where we are receiver). Requires sender's box public key.
   * @param {import('../shared/types.mjs').Message} msg
   * @param {Uint8Array} senderBoxPublic Sender's Curve25519 public key
   * @returns {Promise<Uint8Array | null>}
   */
  async decrypt(msg, senderBoxPublic) {
    const boxKeys = signKeypairToBox(this.identity);
    return decryptPayload(
      msg.encrypted_payload,
      boxKeys.secretKey,
      senderBoxPublic,
      msg.created_at,
      msg.ttl_seconds,
      msg.message_id
    );
  }

  /**
   * Issue DELETE control message (version=2). Caller must be sender or receiver.
   * @param {string} messageId
   * @param {string} senderId
   * @param {string} receiverId
   * @param {number} created_at
   * @returns {Promise<import('../shared/types.mjs').Message>}
   */
  async sendDelete(messageId, senderId, receiverId, created_at) {
    const msg = await buildDeleteMessage(
      messageId,
      senderId,
      receiverId,
      this.identity.secretKey,
      created_at
    );
    await this.transport.send(msg);
    await this.transport.onRelayConnected();
    return msg;
  }

  /**
   * Availability: online and peer count.
   */
  async getAvailability() {
    return this.transport.getAvailability();
  }

  get userId() {
    return this.identity.userId;
  }
}
