/**
 * In-memory session: token -> identity (decrypted).
 * On server restart users must re-login.
 */

/** @type {Map<string, { publicKey: Buffer, secretKey: Buffer, boxPublicKey: Buffer, boxSecretKey: Buffer, userId: string, keyCreatedAt: number }>} */
export const sessionStore = new Map();

export function setIdentity(token, identity) {
  sessionStore.set(token, identity);
}

export function getIdentity(token) {
  return sessionStore.get(token);
}

export function deleteIdentity(token) {
  sessionStore.delete(token);
}
