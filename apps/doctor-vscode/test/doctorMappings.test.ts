import { describe, expect, it } from 'vitest';
import { FRONT_MATTER_KEYS } from '@estruyf/doctor-common';
import { DOCTOR_FIELD_MAPPINGS } from '../src/utils/doctorMappings';

describe('doctor field mappings', () => {
  it('cover every front matter key doctor reads, except the custom columns', () => {
    // The keys are doctor's, shared through @estruyf/doctor-common: a key doctor
    // starts reading has to show up in the side panel too
    const mapped = DOCTOR_FIELD_MAPPINGS.map((m) => m.frontMatterKey).sort();
    const expected = FRONT_MATTER_KEYS.filter((key) => key !== 'metadata').sort();
    expect(mapped).toEqual(expected);
  });
});
