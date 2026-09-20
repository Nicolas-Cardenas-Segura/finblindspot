import { known, type Profile } from '../src/profile.js';

export const profile: Profile = {
  currency: 'EUR', residence: known('ES'), countries: known(['ES', 'GB']),
  age: known(35), retirementAge: known(65),
  income: known(4000), expenses: known(2500), cash: known(15000),
  debtPayment: known(300), investments: known(20000), property: known(40000),
  pension: known(50000), untrackedPensions: known(0), pensionTaxKnown: known(true),
  contribution: known(500), retirementSpending: known(2200),
  feesKnown: known(true), localWill: known(true), beneficiaries: known(true),
};

export const answers = [
  'EUR', 'ES', 'ES,GB', '35', '65', '4000', '2500', '15000', '300',
  '20000', '40000', '50000', '0', 'yes', '500', '2200', 'yes', 'yes', 'yes',
];
