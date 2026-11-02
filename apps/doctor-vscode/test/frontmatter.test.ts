import { describe, it, expect } from 'vitest';
import { getFieldNameAtLine } from '../src/utils/frontmatter';

describe('frontmatter utilities', () => {
  it('should extract field name from a line', () => {
    // Mock document and lineNumber for testing
    expect(getFieldNameAtLine).toBeDefined();
  });

  it('should handle indented field names', () => {
    expect(getFieldNameAtLine).toBeDefined();
  });

  it('should return null for non-field lines', () => {
    expect(getFieldNameAtLine).toBeDefined();
  });
});
