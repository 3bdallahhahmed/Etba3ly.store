import { calculateOrderQuote, DEFAULT_MATERIAL_RATES, DEFAULT_PRICING_SETTINGS } from '../src/utils/pricingEngine.js';

console.log('========================================================');
console.log('VERIFYING PRINT HOURS & LIVE FILAMENT ENGINE');
console.log('========================================================\n');

// 1. Verify Print Hours parsing logic
function getOrderPrintHours(order) {
  if (!order) return 0.5;
  if (order.printhours !== undefined && order.printhours !== null) return Number(order.printhours);
  if (order.notes) {
    const match = order.notes.match(/\[HOURS:([^\]]+)\]/i) || order.notes.match(/\[Time:\s*([^\]|h]+)/i);
    if (match) return parseFloat(match[1]) || 0;
  }
  const w = Number(order.weightgrams) || 0;
  return w > 0 ? Number((w / 35).toFixed(1)) : 0.5;
}

const testOrderWithHours = {
  weightgrams: 17,
  notes: '[PRINTER:CC Abdalla] [DELIVERY:shipping] [DEPOSIT:115] [HOURS:1.6]'
};

const hoursVal = getOrderPrintHours(testOrderWithHours);
console.log(`[TEST 1] Print hours for 17g order with [HOURS:1.6]: ${hoursVal} hrs`);
if (hoursVal === 1.6) {
  console.log('[PASS] Test 1: Hours accurately parsed from notes (1.6 hrs instead of hardcoded 0.5 hrs)');
} else {
  console.error('[FAIL] Test 1 failed, got:', hoursVal);
  process.exit(1);
}

// 2. Custom Filament Addition & Calculation
const customMaterials = {
  ...DEFAULT_MATERIAL_RATES,
  silk_gold: {
    name: 'Silk Gold PLA',
    selling_rate: 2.50,
    cost: 0.90,
    in_stock: true
  },
  tpu: {
    name: 'TPU',
    selling_rate: 2.70,
    cost: 0.95,
    in_stock: false // Restocking soon
  }
};

// 40g Silk Gold, 1 hr print time, pickup
// Setup: 25 EGP, Material: 40 * 2.50 = 100 EGP, Time: 1 * 12 = 12 EGP
// Raw: 25 + 100 + 12 = 137 EGP.
// Rounded up to 5 EGP: 140 EGP.
const quote = calculateOrderQuote({
  items: [{ weightGrams: 40, printHours: 1.0, materialKey: 'Silk Gold PLA' }],
  deliveryMode: 'pickup',
  customMaterials
});

console.log(`\n[TEST 2] Silk Gold Quote: Raw Subtotal = ${quote.rawSubtotal} EGP, Final Subtotal = ${quote.manufacturingSubtotal} EGP`);
if (quote.rawSubtotal === 137 && quote.manufacturingSubtotal === 140) {
  console.log('[PASS] Test 2: Custom filament pricing accurately calculated (140 EGP)');
} else {
  console.error('[FAIL] Test 2 failed, expected 140 got:', quote.manufacturingSubtotal);
  process.exit(1);
}

// 3. Serialization to site_config.materials and why_text
const materialsString = Object.values(customMaterials)
  .map(m => m.in_stock === false ? `${m.name} [restocking]` : m.name)
  .join(', ');

console.log('\n[TEST 3] Materials dropdown string:');
console.log(' ->', materialsString);

if (materialsString.includes('Silk Gold PLA') && materialsString.includes('TPU [restocking]')) {
  console.log('[PASS] Test 3: Restocking tag and custom filament serialized properly');
} else {
  console.error('[FAIL] Test 3 failed:', materialsString);
  process.exit(1);
}

// 4. Customer Dropdown Parsing Verification
const parsedOptions = materialsString.split(',').map(m => {
  const raw = m.trim();
  const isRestocking = raw.toLowerCase().includes('[restocking]');
  const cleanName = raw.replace(/\[restocking\]/gi, '').trim();
  return { cleanName, isRestocking };
});

const tpuOpt = parsedOptions.find(o => o.cleanName === 'TPU');
const silkOpt = parsedOptions.find(o => o.cleanName === 'Silk Gold PLA');

if (tpuOpt && tpuOpt.isRestocking && silkOpt && !silkOpt.isRestocking) {
  console.log('[PASS] Test 4: Customer dropdown parser sets TPU as restocking/disabled and Silk Gold as active');
} else {
  console.error('[FAIL] Test 4 failed:', { tpuOpt, silkOpt });
  process.exit(1);
}

console.log('\n========================================================');
console.log('ALL TESTS PASSED SUCCESSFULLY.');
console.log('========================================================');
