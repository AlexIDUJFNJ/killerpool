/**
 * Tests for Utils
 */

import { cn } from '../utils';

describe('Utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    });

    it('should handle undefined and null', () => {
      expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
    });

    it('should merge tailwind classes correctly', () => {
      // Tailwind classes with conflicting properties should be merged correctly
      expect(cn('px-4 py-2', 'px-6')).toBe('py-2 px-6');
    });

    it('should handle objects', () => {
      expect(cn('foo', { bar: true, baz: false })).toBe('foo bar');
    });

    it('should handle arrays', () => {
      expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
    });

    it('should handle empty input', () => {
      expect(cn()).toBe('');
    });

    it('should handle complex combinations', () => {
      const result = cn(
        'base-class',
        true && 'conditional-class',
        false && 'hidden-class',
        { active: true, disabled: false },
        ['array-class-1', 'array-class-2']
      );
      expect(result).toBe('base-class conditional-class active array-class-1 array-class-2');
    });
  });
});
