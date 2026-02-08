import { describe, expect, it } from 'vitest';
import {
  validateSubscribers,
  validateCalls,
  CALL_STATUS_SET,
} from '../../server/persistence/validators.mjs';

describe('validators', () => {
  describe('validateSubscribers', () => {
    it('accepts valid records', () => {
      const { records, invalid } = validateSubscribers([
        { id: 'id1', name: 'User 1' },
      ]);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ id: 'id1', name: 'User 1' });
      expect(invalid).toHaveLength(0);
    });
    it('rejects empty id', () => {
      const { records, invalid } = validateSubscribers([
        { id: '', name: 'User' },
      ]);
      expect(invalid.length).toBeGreaterThan(0);
    });
    it('rejects empty name', () => {
      const { records, invalid } = validateSubscribers([
        { id: 'id1', name: '' },
      ]);
      expect(invalid.length).toBeGreaterThan(0);
    });
  });

  describe('validateCalls', () => {
    it('accepts valid call', () => {
      const { records } = validateCalls([
        {
          id: 'call_1',
          from: { id: 'f1', name: 'From' },
          to: { id: 't1', name: 'To' },
          status: 'pending',
        },
      ]);
      expect(records).toHaveLength(1);
      expect(records[0].from.id).toBe('f1');
      expect(records[0].to.id).toBe('t1');
    });
    it('rejects invalid from id', () => {
      const { invalid } = validateCalls([
        {
          id: 'call_1',
          from: { id: '', name: 'From' },
          to: { id: 't1', name: 'To' },
        },
      ]);
      expect(invalid.length).toBeGreaterThan(0);
    });
  });

  describe('CALL_STATUS_SET', () => {
    it('contains expected statuses', () => {
      expect(CALL_STATUS_SET.has('pending')).toBe(true);
      expect(CALL_STATUS_SET.has('acknowledged')).toBe(true);
      expect(CALL_STATUS_SET.has('declined')).toBe(true);
    });
  });
});
