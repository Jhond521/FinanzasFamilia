import { describe, expect, it } from 'vitest';
import { isEmailAllowed, parseAllowedEmails } from './auth';

describe('parseAllowedEmails', () => {
  it('splits, trims and lowercases a comma-separated list', () => {
    expect(parseAllowedEmails(' Jhond5@gmail.com ,lina.tic.isc@gmail.com')).toEqual([
      'jhond5@gmail.com',
      'lina.tic.isc@gmail.com',
    ]);
  });

  it('returns an empty list when unset', () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails('')).toEqual([]);
  });
});

describe('isEmailAllowed', () => {
  const allowed = parseAllowedEmails('jhond5@gmail.com,lina.tic.isc@gmail.com');

  it('accepts whitelisted emails regardless of case', () => {
    expect(isEmailAllowed('JhonD5@gmail.com', allowed)).toBe(true);
  });

  it('rejects anything not on the whitelist', () => {
    expect(isEmailAllowed('random@gmail.com', allowed)).toBe(false);
  });
});
