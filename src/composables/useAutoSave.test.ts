import { describe, it, expect } from 'vitest';
import { hasPendingSave, flushPendingSave } from './useAutoSave';

describe('hasPendingSave', () => {
  it('returns false initially', () => {
    expect(hasPendingSave()).toBe(false);
  });
});

describe('flushPendingSave', () => {
  it('returns false when nothing is pending', async () => {
    const result = await flushPendingSave();
    expect(result).toBe(false);
  });
});