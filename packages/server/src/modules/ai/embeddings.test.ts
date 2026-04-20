import { describe, it, expect } from 'vitest';
import { embed } from './embeddings.js';
import { EMBEDDING_DIMENSIONS } from '../../db/schema.js';

describe('embeddings (stub provider)', () => {
  it('returns a unit vector of the configured dimension', async () => {
    const { vector } = await embed('hello world');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it('is deterministic for the same input', async () => {
    const a = await embed('objection: pricing is too high');
    const b = await embed('objection: pricing is too high');
    expect(a.vector).toEqual(b.vector);
  });

  it('produces different vectors for different inputs', async () => {
    const a = await embed('product features');
    const b = await embed('refund policy');
    expect(a.vector).not.toEqual(b.vector);
  });

  it('handles empty input without throwing', async () => {
    const { vector } = await embed('');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});
