/**
 * Online relay transport — push messages to relay servers, poll/subscribe for incoming.
 * Blind relay: server never decrypts; delivery by receiver_id.
 */

import { TransportInterface } from './TransportInterface.mjs';

/**
 * @param {string} baseUrl e.g. https://relay.example.com
 * @param {import('../../../shared/types.mjs').Message} message
 * @returns {Promise<boolean>} true if accepted
 */
async function postMessage(baseUrl, message) {
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  return res.ok;
}

/**
 * @param {string} baseUrl
 * @param {string} receiverId
 * @returns {Promise<import('../../../shared/types.mjs').Message[]>}
 */
async function fetchForReceiver(baseUrl, receiverId) {
  const res = await fetch(`${baseUrl}/messages?receiver_id=${encodeURIComponent(receiverId)}`, {
    method: 'GET',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * Online relay transport. Connects to one or more relay server URLs.
 */
export class OnlineRelayTransport extends TransportInterface {
  /**
   * @param {string[]} serverUrls e.g. ['https://relay1.net.aiternitas.ru', 'https://relay2.net.aiternitas.ru']
   * @param {string} localReceiverId UserID of this client (for polling)
   */
  constructor(serverUrls = [], localReceiverId = '') {
    super();
    this.serverUrls = Array.isArray(serverUrls) ? serverUrls : [serverUrls];
    this.localReceiverId = localReceiverId;
    this._online = false;
    this._lastCheck = 0;
  }

  /**
   * @param {import('../../../shared/types.mjs').Message} message
   */
  async send(message) {
    let anyOk = false;
    for (const baseUrl of this.serverUrls) {
      try {
        const ok = await postMessage(baseUrl, message);
        if (ok) anyOk = true;
      } catch (_) {
        // skip failed server
      }
    }
    if (!anyOk && this.serverUrls.length > 0) {
      throw new Error('No relay server accepted the message');
    }
  }

  /**
   * Poll all servers for messages for localReceiverId.
   */
  async poll() {
    if (!this.localReceiverId) return [];
    const all = [];
    for (const baseUrl of this.serverUrls) {
      try {
        const list = await fetchForReceiver(baseUrl, this.localReceiverId);
        all.push(...list);
      } catch (_) {
        // skip
      }
    }
    return all;
  }

  async getAvailability() {
    const now = Date.now();
    if (now - this._lastCheck < 5000) {
      return { online: this._online, peers: 0 };
    }
    this._lastCheck = now;
    let online = false;
    for (const baseUrl of this.serverUrls) {
      try {
        const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
        if (res.ok) {
          online = true;
          break;
        }
      } catch (_) {
        // skip
      }
    }
    this._online = online;
    return { online, peers: 0 };
  }

  get serverUrlsList() {
    return [...this.serverUrls];
  }
}
