import { describe, it, expect } from 'vitest';
import {
  isTaxonomyField,
  isUserField,
  isMultiField,
  getFieldTypeDocumentation,
  FIELD_TYPES
} from '../src/utils/fieldTypes';

describe('fieldTypes', () => {
  it('should identify taxonomy fields', () => {
    expect(isTaxonomyField(FIELD_TYPES.TAXONOMY)).toBe(true);
    expect(isTaxonomyField(FIELD_TYPES.TAXONOMY_MULTI)).toBe(true);
    expect(isTaxonomyField(FIELD_TYPES.TEXT)).toBe(false);
  });

  it('should identify user fields', () => {
    expect(isUserField(FIELD_TYPES.USER)).toBe(true);
    expect(isUserField(FIELD_TYPES.USER_MULTI)).toBe(true);
    expect(isUserField(FIELD_TYPES.TEXT)).toBe(false);
  });

  it('should identify multi-select fields', () => {
    expect(isMultiField(FIELD_TYPES.TAXONOMY_MULTI)).toBe(true);
    expect(isMultiField(FIELD_TYPES.USER_MULTI)).toBe(true);
    expect(isMultiField(FIELD_TYPES.TAXONOMY)).toBe(false);
  });

  it('should return documentation for field types', () => {
    const doc = getFieldTypeDocumentation(FIELD_TYPES.TAXONOMY);
    expect(doc).toBeTruthy();
    expect(doc.length > 0).toBe(true);
  });
});
