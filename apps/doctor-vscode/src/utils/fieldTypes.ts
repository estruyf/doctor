export const FIELD_TYPES = {
  TAXONOMY: 'TaxonomyFieldType',
  TAXONOMY_MULTI: 'TaxonomyFieldTypeMulti',
  USER: 'User',
  USER_MULTI: 'UserMulti',
  TEXT: 'Text',
  CHOICE: 'Choice',
  NUMBER: 'Number',
  DATETIME: 'DateTime',
  BOOLEAN: 'Boolean',
  LOOKUP: 'Lookup'
};

export function isTaxonomyField(typeAsString: string): boolean {
  return typeAsString === FIELD_TYPES.TAXONOMY || typeAsString === FIELD_TYPES.TAXONOMY_MULTI;
}

export function isUserField(typeAsString: string): boolean {
  return typeAsString === FIELD_TYPES.USER || typeAsString === FIELD_TYPES.USER_MULTI;
}

export function isMultiField(typeAsString: string): boolean {
  return typeAsString === FIELD_TYPES.TAXONOMY_MULTI || typeAsString === FIELD_TYPES.USER_MULTI;
}

export function getFieldTypeDocumentation(typeAsString: string): string {
  switch (typeAsString) {
    case FIELD_TYPES.TAXONOMY:
    case FIELD_TYPES.TAXONOMY_MULTI:
      return 'Select from managed metadata terms. Use CodeLens to pick.';
    case FIELD_TYPES.USER:
    case FIELD_TYPES.USER_MULTI:
      return 'Enter user principal names (e.g., user@contoso.com). Use CodeLens to search.';
    case FIELD_TYPES.TEXT:
      return 'Enter plain text.';
    case FIELD_TYPES.NUMBER:
      return 'Enter a number.';
    case FIELD_TYPES.CHOICE:
      return 'Select from predefined choices.';
    case FIELD_TYPES.DATETIME:
      return 'Enter a date and time.';
    case FIELD_TYPES.BOOLEAN:
      return 'Enter true or false.';
    default:
      return 'Enter a value.';
  }
}
