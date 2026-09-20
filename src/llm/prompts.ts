import type { BlindSpotContent } from '../explain/content.js';
import type { FieldDef, SectionDef } from '../questionnaire/fields.js';
import { FIELDS, PENSION_FIELDS } from '../questionnaire/fields.js';
import type { Currency, FieldId } from '../questionnaire/schema.js';

export const ASSISTANT_NAME = 'Sam';

export const SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, the guide inside a financial blind spot assessment on Telegram. Your role is educational only: this is an educational assessment, it is not financial advice.

Who you are talking to: internationally mobile people with money, pensions and family spread across countries. Be warm, clear and patient. Talk like a knowledgeable friend, not a form and not a robot. Plain English, no financial jargon unless they ask for detail.

You never do the maths. All numbers come from deterministic backend code. You ask follow-ups, explain results, and nothing else.

May: ask follow-up questions, clarify an answer, point out missing information, explain a calculation or a concept, explain why something is a blind spot, suggest questions to ask a professional.

May not: recommend an investment, product or pension transfer, invent a missing value, present an assumption as a guarantee, or state that a projection will happen.

"I don't know" is an answer, not a zero. It is stored as null, it never silently becomes 0.

Style rules, follow all of them:
- Be concise. No filler, no padding, no "great question", no "of course", no "thanks for sharing".
- ZERO APOLOGIES. Never say "sorry" or "I apologize". If something went wrong, fix it and move on.
- One question at a time. Never bundle questions and never list the remaining questions.
- Use the conversation so far. Do not ask the person to repeat something they already told you.
- Use the person's first name occasionally, not in every message.
- Emojis are fine but rare: at most one, and never in every message.
- Never list available commands unless asked.
- Never describe actions you have not taken and never claim a value was saved unless the message says it was.`;

export type TurnEvent =
  | { kind: 'interview_started' }
  | { kind: 'answer_stored'; fieldId: FieldId; shown: string; also?: FieldId[] }
  | { kind: 'partial_stored'; fieldIds: FieldId[] }
  | { kind: 'dont_know_stored'; fieldId: FieldId }
  | { kind: 'correction_applied'; fieldId: FieldId; shown: string }
  | { kind: 'question_answered'; explanation: string }
  | { kind: 'skipped'; fieldId: FieldId }
  | { kind: 'off_topic'; retries: number };

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface TurnContext {
  field: FieldDef;
  currency?: Currency;
  event: TurnEvent;
  history: ConversationTurn[];
  firstName?: string;
  redacted: boolean;
  today: string;
  sectionStart?: SectionDef;
  openInSection?: FieldDef[];
  knowledge?: string[];
  previousReport?: string;
}

function describeEvent(e: TurnEvent): string {
  switch (e.kind) {
    case 'interview_started':
      return 'This is the start of a new assessment; the welcome text is already shown above your message. Ask the first open question in one or two sentences, no greeting.';
    case 'answer_stored':
      return `Their answer to "${promptFor(e.fieldId)}" was saved as: ${e.shown}.${
        e.also !== undefined && e.also.length > 0
          ? ` From the same message these were also saved: ${e.also.map(promptFor).join('; ')}.`
          : ''
      } Acknowledge it in at most one short clause (or not at all), then ask the next question.`;
    case 'partial_stored':
      return `Their message answered ${e.fieldIds.map(promptFor).join('; ')}, all saved, but not the current question. Acknowledge briefly, then ask the current question.`;
    case 'dont_know_stored':
      return `They did not know the answer to "${promptFor(e.fieldId)}". It is recorded as unknown, which is fine. Reassure briefly, then ask the next question.`;
    case 'correction_applied':
      return `They corrected an earlier answer. "${promptFor(e.fieldId)}" is now saved as: ${e.shown}. Confirm the change in one sentence, then ask the current question again.`;
    case 'question_answered':
      return `They asked a question. Give this answer in your own words without adding anything to it: ${e.explanation} Then ask the question again.`;
    case 'skipped':
      return `They chose not to answer "${promptFor(e.fieldId)}". It is left out, which is their call; the final report will simply show that part as not assessed. Accept it in at most one short clause, without pushing back, then ask the next question.`;
    case 'off_topic':
      return e.retries >= 2
        ? `Their reply did not answer the question (attempt ${e.retries}). Steer back gently and mention they can reply "don't know" if unsure, then ask again.`
        : 'Their reply did not answer the question. Steer back gently in one short sentence, then ask again.';
  }
}

export function TURN_PROMPT(ctx: TurnContext): string {
  const f = ctx.field;
  const historyText =
    ctx.history.length > 0
      ? ctx.history
          .map((t) => `[${t.role === 'user' ? (ctx.firstName ?? 'User') : ASSISTANT_NAME}]: ${t.text}`)
          .join('\n')
      : '(none yet)';
  const constraints: string[] = [];
  if (ctx.sectionStart !== undefined) {
    constraints.push(
      `A new part of the interview starts: "${ctx.sectionStart.title}". Ask it as one open question, in your own words, based on: ${ctx.sectionStart.opener} Make clear they can answer as much or as little as they like in one message and you will follow up on the rest.`,
    );
  } else {
    const others = ctx.openInSection ?? [];
    if (others.length > 0) {
      constraints.push(
        `What you need to learn next: ${f.prompt} Do not ask it as a form question. Ask one open, conversational question that invites them to talk about this part of their life so the answer comes out naturally (for example "tell me a bit about yourself" rather than "how old are you"), and that could also cover what is still open in this part: ${others.map((o) => o.prompt).join(' | ')}. Do not list these.`,
      );
    } else {
      constraints.push(
        `This is the only thing still open in this part, so ask it directly and specifically, keeping its exact meaning: ${f.prompt}`,
      );
    }
  }
  if (f.helper !== undefined) constraints.push(`Helper text you may weave in: ${f.helper}`);
  if (f.options !== undefined && f.options.length > 0) {
    constraints.push(
      `The answer will be mapped onto one of these internal values: ${f.options.join(' / ')}. Ask it as an open question in plain words; do not list the values or offer a menu.`,
    );
  }
  if (f.type === 'money' && ctx.currency !== undefined) constraints.push(`Amounts are in ${ctx.currency}; say so briefly.`);
  if (f.type === 'country' || f.type === 'country_list') constraints.push('Any country name is fine as an answer.');
  if (f.allowUnknown) constraints.push(`Mention that "don't know" is a valid answer.`);
  else constraints.push('Do not offer to skip this one, but if they decline, accept it.');
  if (ctx.redacted) {
    constraints.push(
      'Their last message contained something that looked like an account, card, passport or tax number. It was removed before you saw it. Remind them once, briefly, that only approximate figures are needed.',
    );
  }

  const knowledge =
    ctx.knowledge !== undefined && ctx.knowledge.length > 0
      ? `\nBackground from our own material, which you may paraphrase if it helps (it adds no numbers about this person):\n${ctx.knowledge.map((k) => `- ${k}`).join('\n')}\n`
      : '';
  const previous =
    ctx.previousReport !== undefined
      ? `\nTheir previous report. You may refer back to it when relevant, citing only these figures:\n${ctx.previousReport}\n`
      : '';

  return `Write the assistant's next Telegram message in the assessment.

Today: ${ctx.today}
Person's first name: ${ctx.firstName ?? 'unknown'}

Conversation so far (most recent last):
${historyText}
${knowledge}${previous}
What just happened:
${describeEvent(ctx.event)}

The message must:
${constraints.map((c) => `- ${c}`).join('\n')}
- Be 1 to 3 short sentences plus the question. Plain text, no markdown, no bullet lists.
- Ask in a natural, open way; they answer in their own words and the backend does the parsing.
- Contain no numbers except ones that appear above.
- Contain no advice, no products, no providers, no predictions.

Return the message text only.`;
}

function promptFor(id: FieldId): string {
  const field = [...FIELDS, ...PENSION_FIELDS].find((f) => f.id === id);
  return field ? field.prompt : '';
}

function describeField(f: FieldDef): string {
  const parts = [`type ${f.type}`];
  if (f.options) parts.push(`options: ${f.options.join(', ')}`);
  if (f.allowUnknown) parts.push('null allowed for "don\'t know"');
  return `- ${f.id}: ${f.prompt} (${parts.join('; ')})`;
}

export function INTENT_PROMPT(
  field: FieldDef,
  answered: FieldId[],
  currency?: Currency,
  open: FieldDef[] = [],
): string {
  const answeredList =
    answered.length > 0
      ? answered.map((id) => `- ${id}: ${promptFor(id)}`).join('\n')
      : '- (none yet)';
  const openList = open.length > 0 ? open.map(describeField).join('\n') : '- (none)';

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

Other open questions in this part of the interview. The user may answer several at once; capture every one their message clearly answers, in "values" keyed by field ID:
${openList}

Return JSON only, with this shape:
{ "intent": "answer" | "dont_know" | "question" | "correction" | "skip_request" | "stop_request" | "off_topic", "value"?: <typed value for the current field>, "values"?: { <open field id>: <typed value> }, "field_id"?: <one of the already answered field IDs> }

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
- Use "answer" with "values" (and "value" omitted) when the message answers other open questions but not the current one. Only include values the user actually stated; never guess or fill in defaults. Inside "values", null means the user said they do not know that one.
- Use "question" when the user asks something instead of answering, "skip_request" when they decline or want to skip just this question ("skip", "next", "rather not say"), "stop_request" when they want to end the interview and see what can be said so far ("stop", "that's enough", "just give me the results"), and "off_topic" for anything else.

Examples:
Reply: "about 4.2k after tax" -> { "intent": "answer", "value": 4200 }
Reply: "why do you need this?" -> { "intent": "question" }
Reply: "actually my rent is 1500" -> { "intent": "correction", "field_id": "spend_housing", "value": 1500 }
Reply (current field income_monthly, open: spend_housing, spend_living): "I take home 5k, rent is 1800 and we spend maybe 2000 on living" -> { "intent": "answer", "value": 5000, "values": { "spend_housing": 1800, "spend_living": 2000 } }`;
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
