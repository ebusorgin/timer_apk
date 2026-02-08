import { describe, expect, it } from 'vitest';
import { sanitizeDisplayName, sortSubscribers } from '../../server/utils/subscriberUtils.mjs';

describe('subscriberUtils', () => {
  describe('sanitizeDisplayName', () => {
    it('trims whitespace', () => {
      expect(sanitizeDisplayName('  foo  ')).toBe('foo');
    });
    it('collapses multiple spaces', () => {
      expect(sanitizeDisplayName('foo   bar')).toBe('foo bar');
    });
    it('limits to 64 chars', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeDisplayName(long).length).toBe(64);
    });
    it('returns empty for non-string', () => {
      expect(sanitizeDisplayName(null)).toBe('');
      expect(sanitizeDisplayName(123)).toBe('');
    });
    it('handles XSS-like input', () => {
      const xss = '<script>alert(1)</script>';
      expect(sanitizeDisplayName(xss)).toBe('<script>alert(1)</script>');
    });
  });

  describe('sortSubscribers', () => {
    it('sorts by name', () => {
      const items = [
        { id: '1', name: 'Zebra' },
        { id: '2', name: 'Apple' },
      ];
      expect(sortSubscribers(items).map((s) => s.name)).toEqual(['Apple', 'Zebra']);
    });
    it('returns new array', () => {
      const items = [{ id: '1', name: 'A' }];
      expect(sortSubscribers(items)).not.toBe(items);
    });
  });
});
