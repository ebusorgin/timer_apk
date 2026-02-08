/**
 * Shared constants for net.aiternitas.ru
 * Single source for message version, time slot size, limits.
 */

/** Message version: 1 = ACTIVE, 2 = DEAD (deleted) */
export const MESSAGE_VERSION_ACTIVE = 1;
export const MESSAGE_VERSION_DEAD = 2;

/** Time slot size in seconds for time-based key derivation */
export const SLOT_SIZE_SECONDS = 3600;

/** Default max TTL for very new keys (key age < 24h) */
export const MAX_TTL_NEW_KEY_SECONDS = 86400;

/** Key age (seconds) above which full max TTL is allowed */
export const KEY_AGE_FULL_TTL_SECONDS = 7 * 86400;

/** Absolute max TTL any message may have */
export const MAX_TTL_ABSOLUTE_SECONDS = 30 * 86400;

/** Default max messages per node (client or server) */
export const DEFAULT_MAX_MESSAGES = 100_000;

/** Default max storage bytes per node */
export const DEFAULT_MAX_STORAGE_BYTES = 500 * 1024 * 1024;
