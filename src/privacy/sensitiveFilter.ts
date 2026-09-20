export interface RedactionResult {
  text: string;
  redacted: boolean;
  kinds: Array<'iban' | 'card' | 'passport' | 'tax_id' | 'digit_run'>;
}

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/g;
const CARD_PATTERN = /(?<![\d-])(?:\d[ -]?){12,18}\d(?!\d)/g;
const PASSPORT_PATTERN = /\b[A-Z]{1,2}\d{6,9}\b/g;
const TAX_ID_PATTERN = /\b(?:\d{3}-\d{2}-\d{4}|[A-Z]{2}\d{6}[A-D]|[XYZ]?\d{7,8}[A-Z])\b/g;
const DIGIT_RUN_PATTERN = /(?<!\d)\d{9,}(?!\d)/g;

function passesLuhn(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  let sum = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

function replaceMatches(
  text: string,
  pattern: RegExp,
  predicate: (match: string) => boolean = () => true,
): { text: string; found: boolean } {
  let found = false;
  const replaced = text.replace(pattern, (match) => {
    if (!predicate(match)) return match;
    found = true;
    return '[redacted]';
  });
  return { text: replaced, found };
}

export function redactSensitive(text: string): RedactionResult {
  let redactedText = text;
  const kinds: RedactionResult['kinds'] = [];

  const replacements: Array<[
    RegExp,
    RedactionResult['kinds'][number],
    ((match: string) => boolean) | undefined,
  ]> = [
    [IBAN_PATTERN, 'iban', undefined],
    [CARD_PATTERN, 'card', passesLuhn],
    [TAX_ID_PATTERN, 'tax_id', undefined],
    [PASSPORT_PATTERN, 'passport', undefined],
    [DIGIT_RUN_PATTERN, 'digit_run', undefined],
  ];

  for (const [pattern, kind, predicate] of replacements) {
    const result = replaceMatches(redactedText, pattern, predicate);
    redactedText = result.text;
    if (result.found) kinds.push(kind);
  }

  return {
    text: redactedText,
    redacted: kinds.length > 0,
    kinds,
  };
}
