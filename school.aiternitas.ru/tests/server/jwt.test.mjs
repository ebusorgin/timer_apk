import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createToken, verifyToken } from '../../server/middleware/jwtAuth.mjs';

describe('JWT middleware', () => {
  it('createToken returns a string', () => {
    const token = createToken('123');
    assert.strictEqual(typeof token, 'string');
    assert.ok(token.length > 0);
  });

  it('verifyToken returns userId for valid token', () => {
    const token = createToken('456');
    const userId = verifyToken(token);
    assert.strictEqual(userId, '456');
  });

  it('verifyToken accepts Bearer prefix', () => {
    const token = createToken('789');
    const userId = verifyToken('Bearer ' + token);
    assert.strictEqual(userId, '789');
  });

  it('verifyToken returns null for invalid token', () => {
    assert.strictEqual(verifyToken('invalid'), null);
    assert.strictEqual(verifyToken(''), null);
    assert.strictEqual(verifyToken(null), null);
  });
});
