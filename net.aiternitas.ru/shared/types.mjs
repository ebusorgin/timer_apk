/**
 * Data models — single source of truth for Message and Identity.
 * No transport-specific fields in the message object.
 */

/**
 * UserID = hash(public_key), hex string
 * @typedef {string} UserID
 */

/**
 * Identity (client). Private key never leaves device.
 * @typedef {{
 *   publicKey: Uint8Array,
 *   secretKey: Uint8Array,
 *   userId: string,
 *   keyCreatedAt: number
 * }} Identity
 */

/**
 * Message — same format for offline, online relay, federation.
 * @typedef {{
 *   message_id: string,
 *   sender_id: string,
 *   receiver_id: string,
 *   encrypted_payload: string,
 *   created_at: number,
 *   ttl_seconds: number,
 *   version: number,
 *   sender_signature: string
 * }} Message
 */

/**
 * Serialized message for wire/storage (base64 for binary fields).
 * @typedef {{
 *   message_id: string,
 *   sender_id: string,
 *   receiver_id: string,
 *   encrypted_payload: string,
 *   created_at: number,
 *   ttl_seconds: number,
 *   version: number,
 *   sender_signature: string
 * }} MessageWire
 */

/**
 * Transport availability
 * @typedef {{ online: boolean, peers: number }} Availability
 */

export default {};
