import { describe, it, expect } from 'vitest';
import {
  normalizeMessageId,
  parseReferences,
  extractEmail,
  parsePostmarkPayload,
  parseSendGridPayload,
  parseGenericPayload,
} from './inboundEmail.js';

describe('normalizeMessageId', () => {
  it('strips angle brackets', () => {
    expect(normalizeMessageId('<abc@example.com>')).toBe('abc@example.com');
  });

  it('handles already-stripped ids', () => {
    expect(normalizeMessageId('abc@example.com')).toBe('abc@example.com');
  });

  it('returns undefined for empty / nullish', () => {
    expect(normalizeMessageId('')).toBeUndefined();
    expect(normalizeMessageId('   ')).toBeUndefined();
    expect(normalizeMessageId(null)).toBeUndefined();
    expect(normalizeMessageId(undefined)).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(normalizeMessageId('  <x@y>  ')).toBe('x@y');
  });
});

describe('parseReferences', () => {
  it('splits a multi-id References header', () => {
    const result = parseReferences('<a@x> <b@y>\n<c@z>');
    expect(result).toEqual(['a@x', 'b@y', 'c@z']);
  });

  it('returns [] for missing input', () => {
    expect(parseReferences(undefined)).toEqual([]);
    expect(parseReferences('')).toEqual([]);
  });
});

describe('extractEmail', () => {
  it('extracts from "Name <addr>" format', () => {
    expect(extractEmail('Jane Doe <jane@example.com>')).toEqual({
      email: 'jane@example.com',
      name: 'Jane Doe',
    });
  });

  it('extracts from bare address', () => {
    expect(extractEmail('jane@example.com')).toEqual({ email: 'jane@example.com' });
  });

  it('lowercases the address', () => {
    expect(extractEmail('JANE@EXAMPLE.COM').email).toBe('jane@example.com');
  });
});

describe('parsePostmarkPayload', () => {
  it('normalizes a full Postmark inbound payload', () => {
    const payload = {
      From: 'Jane Doe <jane@example.com>',
      To: 'agent@closerai.local',
      ToFull: [{ Email: 'agent@closerai.local' }],
      Subject: 'Re: Hello',
      TextBody: 'Sounds good!',
      HtmlBody: '<p>Sounds good!</p>',
      MessageID: 'abc-123@example.com',
      Headers: [
        { Name: 'In-Reply-To', Value: '<original@closerai.local>' },
        { Name: 'References', Value: '<original@closerai.local>' },
      ],
      Date: '2025-01-01T00:00:00Z',
    };
    const result = parsePostmarkPayload(payload);
    expect(result.fromEmail).toBe('jane@example.com');
    expect(result.fromName).toBe('Jane Doe');
    expect(result.toEmails).toContain('agent@closerai.local');
    expect(result.subject).toBe('Re: Hello');
    expect(result.messageId).toBe('abc-123@example.com');
    expect(result.inReplyTo).toBe('original@closerai.local');
    expect(result.references).toEqual(['original@closerai.local']);
  });
});

describe('parseSendGridPayload', () => {
  it('parses block-style headers', () => {
    const payload = {
      from: 'jane@example.com',
      to: 'agent@closerai.local',
      subject: 'Re: Hello',
      text: 'hello back',
      headers:
        'Message-ID: <abc@example.com>\r\nIn-Reply-To: <orig@closerai.local>\r\nReferences: <orig@closerai.local>',
    };
    const result = parseSendGridPayload(payload);
    expect(result.fromEmail).toBe('jane@example.com');
    expect(result.messageId).toBe('abc@example.com');
    expect(result.inReplyTo).toBe('orig@closerai.local');
    expect(result.references).toEqual(['orig@closerai.local']);
    expect(result.textBody).toBe('hello back');
  });
});

describe('parseGenericPayload', () => {
  it('handles minimal inbound JSON', () => {
    const result = parseGenericPayload({
      from: 'jane@example.com',
      to: ['agent@closerai.local'],
      subject: 'Hi',
      text: 'body',
      messageId: '<x@y>',
    });
    expect(result.fromEmail).toBe('jane@example.com');
    expect(result.messageId).toBe('x@y');
    expect(result.textBody).toBe('body');
  });
});
