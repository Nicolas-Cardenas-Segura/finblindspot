export const normalise = (text: string): string => text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
const sensitive = /\b(?:password|api[_ -]?key|secret[_ -]?key|passport|tax\s*(?:id|number)|national\s*(?:id|number)|card\s*number|account\s*number|iban)\s*(?:is|:|=)?\s*[A-Z0-9]{3,}|\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|(?:\d[ -]?){13,19}|\b(?:sk-|v1\.)[A-Za-z0-9._-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
export function checkInput(text: string): { accepted: true; text: string } | { accepted: false; reason: 'length' | 'sensitive' } {
  const clean = normalise(text).trim();
  if (!clean || clean.length > 4000) return { accepted: false, reason: 'length' };
  if (sensitive.test(clean)) return { accepted: false, reason: 'sensitive' };
  return { accepted: true, text: clean };
}
