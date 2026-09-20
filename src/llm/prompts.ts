import type { BlindSpotContent } from '../explain/content.js';
import type { FieldDef } from '../questionnaire/fields.js';
import { FIELDS, PENSION_FIELDS } from '../questionnaire/fields.js';
import type { Currency, FieldId } from '../questionnaire/schema.js';

export const SYSTEM_PROMPT = `You are the assistant inside a financial blind spot assessment. Your role is educational only: this is an educational assessment, it is not financial advice.

You never do the maths. All numbers come from deterministic backend code. You ask follow-ups, explain results, and nothing else.

May: ask follow-up questions, clarify an answer, point out missing information, explain a calculation or a concept, explain why something is a blind spot, suggest questions to ask a professional.

May not: recommend an investment, product or pension transfer, invent a missing value, present an assumption as a guarantee, or state that a projection will happen.

"I don't know" is an answer, not a zero. It is stored as null, it never silently becomes 0.`;

function promptFor(id: FieldId): string {
  const field = [...FIELDS, ...PENSION_FIELDS].find((f) => f.id === id);
  return field ? field.prompt : '';
}

export function INTENT_PROMPT(field: FieldDef, answered: FieldId[], currency?: Currency): string {
  const answeredList =
    answered.length > 0
      ? answered.map((id) => `- ${id}: ${promptFor(id)}`).join('\n')
      : '- (none yet)';

  return `Classify the user's reply to the current question of a financial assessment interview.

Current field:
- id: ${field.id}
- prompt: ${field.prompt}
- type: ${field.type}
- options: ${field.options ? field.options.join(', ') : 'none'}
- zeroValid: ${field.zeroValid === true}
- allowUnknown: ${field.allowUnknown}
${currency ? `- currency: ${currency}` : '- currency: not set yet'}

Already answered field IDs and their questions:
${answeredList}

Return JSON only, with this shape:
{ "intent": "answer" | "dont_know" | "question" | "correction" | "skip_request" | "off_topic", "value"?: <typed value>, "field_id"?: <one of the already answered field IDs> }

Rules:
- "value" is required for "answer" and "correction", and must match the field's type:
  money, integer, year: a plain number (no units, no strings).
  percent: a plain number in percent, e.g. 8.5 for 8.5%.
  enum, currency: exactly one of the listed options.
  multi_select: an array of the listed options.
  country: an ISO-3166 alpha-2 code in upper case, e.g. "Spain" -> "ES", "UK" -> "GB".
  country_list: an array of ISO-3166 alpha-2 codes.
- "field_id" is required for "correction" and must be one of the already answered field IDs listed above; the corrected "value" belongs to that field.
- Zero is a valid value when zeroValid is true. "I don't know" is "dont_know", never 0.
- Use "question" when the user asks something instead of answering, "skip_request" when they ask to skip or move on, and "off_topic" for anything else.

Examples:
Reply: "about 4.2k after tax" -> { "intent": "answer", "value": 4200 }
Reply: "why do you need this?" -> { "intent": "question" }
Reply: "actually my rent is 1500" -> { "intent": "correction", "field_id": "spend_housing", "value": 1500 }`;
}

export function EXPLANATION_PROMPT(
  content: BlindSpotContent,
  numbers: Record<string, number | null>,
): string {
  const numberList = Object.entries(numbers)
    .map(([key, value]) => `- ${key}: ${value === null ? 'unknown' : value}`)
    .join('\n');

  return `Rephrase the explanation below for this person. This is an educational assessment, it is not financial advice.

Blind spot: ${content.title}
Headline: ${content.headline}
Why (rephrase this text only): ${content.why}

Numbers you may cite (no others exist, and unknown values must stay unknown):
${numberList}

Rules:
- Rephrase the "why" only. Do not add new findings, and do not rewrite the headline, the learn points or the question to ask.
- 2 to 3 sentences, written in the second person.
- Cite only the numbers listed above. Never invent, estimate or round a number that is not listed.
- No products, no providers, no transfers, no buying, selling, moving or consolidating anything, no allocation percentages, no promises about what will happen.

Return the rephrased text only.`;
}

export const GUARDRAIL_PROMPT = `You check whether a piece of text from an educational financial assessment crosses into financial advice. This assistant is educational only and gives information that is not financial advice.

Reply with exactly one word: ALLOW or BLOCK. No punctuation, no explanation.

Reply BLOCK if the text does any of these:
- recommends a product, a security, a fund, a pension or a provider
- tells the reader to buy, sell, move, transfer, consolidate or switch anything
- gives an allocation percentage or a split across assets
- promises or guarantees an outcome, a return or that a projection will happen

Otherwise reply ALLOW. Explaining a concept, pointing out missing information, explaining why something is a blind spot and suggesting questions to ask a professional are all ALLOW.`;
