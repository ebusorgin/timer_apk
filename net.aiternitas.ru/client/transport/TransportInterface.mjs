/**
 * Transport abstraction — single interface for online relay and DTN.
 * Core does not know which transport is used.
 */

/**
 * @typedef {{ online: boolean, peers: number }} Availability
 */

/**
 * Transport interface (conceptual).
 * - send(message): deliver message (push to relay or queue for DTN).
 * - poll() / subscribe(): get new messages.
 * - getAvailability(): online and peer count.
 */
export class TransportInterface {
  /**
   * @param {import('../../../shared/types.mjs').Message} message
   * @returns {Promise<void>}
   */
  async send(message) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Promise<import('../../../shared/types.mjs').Message[]>}
   */
  async poll() {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Promise<Availability>}
   */
  async getAvailability() {
    throw new Error('Not implemented');
  }
}
