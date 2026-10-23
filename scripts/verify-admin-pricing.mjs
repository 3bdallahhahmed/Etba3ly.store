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

// 3. Rounding up to 5 EGP Verification (Pure Material Pricing: 28g * 3.50 = 98 -> 100 EGP)
const testRounding = calculateOrderQuote({
  items: [{ weightGrams: 28, printHours: 1.1, materialKey: 'pla' }],
  deliveryMode: 'pickup'
});
if (testRounding.manufacturingSubtotal === 100) {
  console.log('[PASS] Rounding rule: 28g * 3.50 = 98 -> Math.ceil(98 / 5) * 5 = 100 EGP');
} else {
  console.error('[FAIL] Rounding rule failed', testRounding.manufacturingSubtotal);
  allPassed = false;
}

// 4. Direct Cost Verification (strictly raw material cost, no machine accounting)
const expectedMaterialCost = 18.48; // 28g * 0.66
if (testRounding.costs.totalDirectCosts === expectedMaterialCost && testRounding.costs.electricityCost === 0 && testRounding.costs.depreciationCost === 0) {
  console.log('[PASS] Direct Cost Rule: strictly material cost (18.48 EGP), machine accounting removed');
} else {
  console.error('[FAIL] Direct Cost Rule failed', testRounding.costs);
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
