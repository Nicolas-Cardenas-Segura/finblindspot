import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../../src/privacy/sensitiveFilter.js';

describe('redactSensitive', () => {
  it('redacts IBANs', () => {
    expect(redactSensitive('DE89 3704 0044 0532 0130 00')).toEqual({
      text: '[redacted]',
      redacted: true,
      kinds: ['iban'],
    });
  });

  it('redacts Luhn-valid card numbers', () => {
    expect(redactSensitive('4111 1111 1111 1111')).toEqual({
      text: '[redacted]',
      redacted: true,
      kinds: ['card'],
    });
  });

  it('redacts tax identifiers', () => {
    expect(redactSensitive('123-45-6789')).toEqual({
      text: '[redacted]',
      redacted: true,
      kinds: ['tax_id'],
    });
  });

  it.each(['about 12k', '35%', '2500 a month', "I'm 42", '120000'])(
    'leaves benign numeric text unchanged: %s',
    (value) => {
      expect(redactSensitive(value)).toEqual({
        text: value,
        redacted: false,
        kinds: [],
      });
    },
  );
});
