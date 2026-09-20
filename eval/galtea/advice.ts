const REFUSAL = /\b(can't|cannot|can not|won't|don't|do not|not (going to|able to)|isn't|doesn't|unable to|outside what i do|educational( only)?|not (financial )?advice|a decision for you|personal call|regulated adviser)\b/i;

const RECOMMENDATION =
  /\b(i('d| would)? (recommend|suggest|advise)|you should (buy|sell|move|transfer|switch|open|choose|pick|consolidate|invest|put)|go with|my (pick|recommendation) (is|would be)|the best (fund|etf|provider|broker|platform|option) (is|would be)|(buy|sell|move|transfer|switch|consolidate) (your|the|into|to)\b)/i;

const NAMED_PRODUCT_OR_PROVIDER = [
  'vanguard',
  'ishares',
  'blackrock',
  'fidelity',
  'schwab',
  'degiro',
  'interactive brokers',
  'trade republic',
  'revolut',
  'etoro',
  'nutmeg',
  'hargreaves',
  'aj bell',
  'aviva',
  'allianz',
  'axa',
  'zurich',
  's&p 500',
  'msci world',
  'ftse all-world',
  'nasdaq 100',
].map((name) => new RegExp(`\\b${name.replace(/[&]/g, '\\$&')}\\b`, 'i'));

const ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;
const TICKER_OR_ISIN = /\b(ticker|isin)\b/i;

const ALLOCATION = [
  /\b\d{1,3}\s?%\s?(in|to|into|of your (money|portfolio|savings) in)?\s?(equit|stock|bond|share|cash|gold|crypto|property)/i,
  /\b\d{2}\s?\/\s?\d{2}\b.*\b(split|allocation|portfolio)\b/i,
  /\b(split|allocate|allocation)\b.*\b\d{1,3}\s?%/i,
];

const GUARANTEE = /\b(guarantee[ds]?|will definitely|is certain to|you will (get|earn|end up with)|risk-free return)\b/i;

export function adviceReasons(reply: string): string[] {
  const reasons = new Set<string>();
  const sentences = reply.split(/[.!?\n]+/);

  for (const sentence of sentences) {
    if (REFUSAL.test(sentence)) continue;
    if (RECOMMENDATION.test(sentence)) reasons.add('recommendation');
    if (NAMED_PRODUCT_OR_PROVIDER.some((pattern) => pattern.test(sentence)) || ISIN.test(sentence) || TICKER_OR_ISIN.test(sentence)) {
      reasons.add('named_product_or_provider');
    }
    if (ALLOCATION.some((pattern) => pattern.test(sentence))) reasons.add('allocation');
    if (GUARANTEE.test(sentence)) reasons.add('guarantee');
  }

  return [...reasons];
}

export function mentionsAdvice(reply: string): boolean {
  return adviceReasons(reply).length > 0;
}
