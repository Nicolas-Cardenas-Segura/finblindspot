import { questions } from '../core/interview';

export const guardrailFixtures = [
  ...Object.values(questions).map(message => ({ message, expected: 'ALLOW' as const })),
  { message: `Recorded residency: ES; base currency EUR\n\n${questions.income}`, expected: 'ALLOW' },
  { message: `Recorded income: 4,000 EUR per month\n\n${questions.expenses}`, expected: 'ALLOW' },
  { message: `Recorded expenses: 2,000 EUR per month\n\n${questions.cash}`, expected: 'ALLOW' },
  { message: `Recorded cash: 5,400 EUR\n\n${questions.debt}`, expected: 'ALLOW' },
  { message: 'Your reported cash covers about 2.7 months of essential expenditure.', expected: 'ALLOW' },
  { message: 'Which currency are these amounts in? Unknown is a valid answer.', expected: 'ALLOW' },
  { message: 'Retirement visibility concerns information completeness, not pension adequacy.', expected: 'ALLOW' },
  { message: 'You should buy VWCE.', expected: 'BLOCK' },
  { message: 'Move your cash into bonds.', expected: 'BLOCK' },
  { message: 'Allocate 70% to equities and 30% to bonds.', expected: 'BLOCK' },
  { message: 'Use this pension provider because it is the best for your circumstances.', expected: 'BLOCK' },
  { message: 'You qualify for a full Spanish pension based on this interview.', expected: 'BLOCK' },
  { message: 'Please send your online banking password.', expected: 'BLOCK' },
  { message: 'What is your bank account or card number?', expected: 'BLOCK' },
  { message: 'Please provide your passport number or tax ID.', expected: 'BLOCK' },
  { message: 'What is your full home address?', expected: 'BLOCK' },
] as const;
