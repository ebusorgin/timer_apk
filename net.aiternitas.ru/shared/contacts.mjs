/**
 * Contacts — stored NodeIDs and box public keys for E2EE.
 * Contacts = keys: nodeId + boxPublicKey (and optional name).
 */

/**
 * @typedef {{ nodeId: string, boxPublicKey: Uint8Array | string, name?: string }} Contact
 */

/**
 * In-memory contact store (per node). Web/DB will persist elsewhere.
 */
export class ContactStore {
  constructor() {
    /** @type {Map<string, Contact>} nodeId -> Contact */
    this.byNodeId = new Map();
  }

  /**
   * @param {string} nodeId
   * @param {Uint8Array | string} boxPublicKey Base64 string or raw bytes
   * @param {string} [name]
   */
  add(nodeId, boxPublicKey, name = '') {
    const key = typeof boxPublicKey === 'string' ? boxPublicKey : Buffer.from(boxPublicKey).toString('base64');
    this.byNodeId.set(nodeId, { nodeId, boxPublicKey: key, name: name || '' });
  }

  /**
   * @param {string} nodeId
   * @returns {Contact | undefined}
   */
  get(nodeId) {
    const c = this.byNodeId.get(nodeId);
    if (!c) return undefined;
    return {
      nodeId: c.nodeId,
      boxPublicKey: typeof c.boxPublicKey === 'string' ? Buffer.from(c.boxPublicKey, 'base64') : c.boxPublicKey,
      name: c.name,
    };
  }

  /**
   * @param {string} nodeId
   * @returns {Uint8Array | undefined} Box public key raw bytes
   */
  getBoxPublicKey(nodeId) {
    const c = this.byNodeId.get(nodeId);
    if (!c) return undefined;
    if (typeof c.boxPublicKey === 'string') return new Uint8Array(Buffer.from(c.boxPublicKey, 'base64'));
    return c.boxPublicKey;
  }

  /** @returns {Contact[]} */
  list() {
    return Array.from(this.byNodeId.values()).map((c) => ({
      nodeId: c.nodeId,
      boxPublicKey: typeof c.boxPublicKey === 'string' ? new Uint8Array(Buffer.from(c.boxPublicKey, 'base64')) : c.boxPublicKey,
      name: c.name || '',
    }));
  }

  /**
   * @param {string} nodeId
   * @param {{ name?: string, boxPublicKey?: Uint8Array | string }} updates
   */
  update(nodeId, updates) {
    const c = this.byNodeId.get(nodeId);
    if (!c) return;
    if (updates.name !== undefined) c.name = updates.name;
    if (updates.boxPublicKey !== undefined) {
      c.boxPublicKey = typeof updates.boxPublicKey === 'string'
        ? updates.boxPublicKey
        : Buffer.from(updates.boxPublicKey).toString('base64');
    }
  }

  /**
   * @param {string} nodeId
   */
  remove(nodeId) {
    this.byNodeId.delete(nodeId);
  }

  /** @param {Contact[]} contacts */
  load(contacts) {
    for (const c of contacts) {
      const key = typeof c.boxPublicKey === 'string' ? c.boxPublicKey : Buffer.from(c.boxPublicKey).toString('base64');
      this.byNodeId.set(c.nodeId, { nodeId: c.nodeId, boxPublicKey: key, name: c.name || '' });
    }
  }
}
