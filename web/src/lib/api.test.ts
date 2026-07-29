import { describe, expect, it } from 'vitest';
import { buildApiUrl } from './api';

describe('buildApiUrl', () => {
  it('prefixes the path with /api', () => {
    expect(buildApiUrl('/auth/me')).toBe('/api/auth/me');
  });

  it('adds the leading slash if missing', () => {
    expect(buildApiUrl('auth/me')).toBe('/api/auth/me');
  });
});
