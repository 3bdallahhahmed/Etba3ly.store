import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  calculateOrderQuote,
  calculatePartnerDistributions,
  runPricingEngineTests
} from '../src/utils/pricingEngine.js';

console.log('========================================================');
console.log('ETBA3LY DYNAMIC PRICING & PROFIT ENGINE VERIFICATION');
console.log('========================================================\n');

// 1. Built-in Specification Tests
const specTests = runPricingEngineTests();
let allPassed = true;

specTests.forEach((t, i) => {
  if (t.passed) {
    console.log(`[PASS] Specification Test ${i + 1}: ${t.test}`);
  } else {
    console.error(`[FAIL] Specification Test ${i + 1}: ${t.test}`);
    allPassed = false;
  }
});

// 2. Partner Distribution Tests
const partnerSplit = calculatePartnerDistributions(10000, DEFAULT_PRICING_SETTINGS);
const partnerAPassed = partnerSplit.partnerA.payout === 2000;
const partnerBPassed = partnerSplit.partnerB.payout === 2000;
const growthPassed = partnerSplit.growthFund === 4000;
const cashPassed = partnerSplit.cashReserves === 2000;

if (partnerAPassed && partnerBPassed && growthPassed && cashPassed) {
  console.log('[PASS] Partner Profit Sharing: 40% Distributions (20% Mazen, 20% Abdalla), 40% Growth, 20% Reserve');
} else {
  console.error('[FAIL] Partner Profit Sharing test failed', partnerSplit);
  allPassed = false;
}

// 3. Rounding up to 5 EGP Verification
const testRounding = calculateOrderQuote({
  items: [{ weightGrams: 28, printHours: 1.1, materialKey: 'pla' }],
  deliveryMode: 'pickup'
});
// Raw: 25 + (28 * 1.80) + (1.1 * 12) = 25 + 50.4 + 13.2 = 88.6 EGP
// Rounded up to 5 EGP: 90 EGP
if (testRounding.manufacturingSubtotal === 90) {
  console.log('[PASS] Rounding rule: Math.ceil(88.6 / 5) * 5 = 90 EGP');
} else {
  console.error('[FAIL] Rounding rule failed', testRounding.manufacturingSubtotal);
  allPassed = false;
}

console.log('\n========================================================');
if (allPassed) {
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY.');
} else {
  console.error('SOME VERIFICATION TESTS FAILED.');
  process.exit(1);
}
console.log('========================================================');
