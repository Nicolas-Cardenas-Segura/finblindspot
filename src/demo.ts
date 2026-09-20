import { AssessmentService } from './interview.js';
import { Store } from './store.js';

const store = new Store();
const service = new AssessmentService(store);
const answers = [
  'EUR', 'ES', 'ES,GB', '35', '65', '4000', '2500', '5000', '300',
  '10000', '0', 'unknown', '1', 'unknown', '500', '2200', 'no', 'unknown', 'no',
];
try {
  console.log('FICTIONAL DEMO · no network, credentials or real financial data\n');
  await service.reply('demo', '/start');
  let result = '';
  for (const answer of answers) result = await service.reply('demo', answer);
  console.log(result);
  await service.reply('demo', '/revisit');
  const updates = [
    'same', 'same', 'same', 'same', 'same', 'same', '16000', 'same', 'same',
    'same', '25000', '0', 'yes', 'same', 'same', 'yes', 'yes', 'yes',
  ];
  for (const answer of updates) result = await service.reply('demo', answer);
  console.log('\n\nFOLLOW-UP (simulated now; no reminder scheduler)\n' + result);
  if (store.snapshots('demo').length !== 2) throw new Error('Demo did not finish both assessments.');
} finally { store.close(); }
