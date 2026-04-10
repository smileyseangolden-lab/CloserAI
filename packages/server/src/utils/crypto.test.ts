import { describe, expect, it } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  it('round-trips a plaintext through AES-256-GCM', () => {
    const plaintext = 'sk-ant-api03-abcdef1234567890';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertexts for identical plaintexts (random IV)', () => {
    const plaintext = 'sk-ant-api03-xyz';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it('rejects tampered ciphertexts', () => {
    const ciphertext = encrypt('sensitive-value');
    const parts = ciphertext.split(':');
    // Flip one byte of the actual ciphertext chunk
    const tampered = [parts[0], parts[1], Buffer.from('tampered').toString('base64')].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });
});
