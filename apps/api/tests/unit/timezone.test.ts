import { DEFAULT_TIMEZONE, resolveTimezone } from '../../src/shared/utils/timezone';

describe('shared/utils/timezone - resolveTimezone', () => {
  it('accepts a valid IANA timezone as-is', () => {
    expect(resolveTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(resolveTimezone('Europe/Lisbon')).toBe('Europe/Lisbon');
  });

  it('falls back to the default for undefined input', () => {
    expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
  });

  it('falls back to the default for an invalid/malformed timezone string', () => {
    expect(resolveTimezone('not-a-real-timezone')).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone('')).toBe(DEFAULT_TIMEZONE);
  });
});
