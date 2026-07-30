import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, COLOR_SCHEME_IDS } from './index';

describe('color schemes', () => {
  it('defines every declared scheme ID exactly once', () => {
    expect(COLOR_SCHEMES.map((scheme) => scheme.id).sort()).toEqual([...COLOR_SCHEME_IDS].sort());
    expect(new Set(COLOR_SCHEMES.map((scheme) => scheme.id)).size).toBe(COLOR_SCHEMES.length);
  });

  it('provides the same complete, non-empty token set for light and dark modes', () => {
    const referenceKeys = Object.keys(COLOR_SCHEMES[0].light).sort();
    expect(referenceKeys.length).toBeGreaterThan(0);

    for (const scheme of COLOR_SCHEMES) {
      expect(scheme.label.trim(), scheme.id).not.toBe('');
      for (const mode of [scheme.light, scheme.dark]) {
        expect(Object.keys(mode).sort(), `${scheme.id} token keys`).toEqual(referenceKeys);
        for (const [token, value] of Object.entries(mode)) {
          expect(value.trim(), `${scheme.id}.${token}`).not.toBe('');
        }
      }
    }
  });
});
