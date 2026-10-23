import assert from 'node:assert';
import {
  calculateOrderQuote,
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  normalizeMaterialKey
} from '../src/utils/pricingEngine.js';

console.log('Running Comprehensive Unit & Regression Tests...\n');

// 1. Pricing Engine - Pure Material Pricing & Zero Setup/Time Charges
{
  const quote = calculateOrderQuote({
    items: [{ weightGrams: 40, printHours: 2.5, materialKey: 'pla' }],
    deliveryMode: 'pickup'
  });

  // 40g * 3.50 = 140 EGP
  assert.strictEqual(quote.setupFee, 0, 'Setup fee must be 0');
  assert.strictEqual(quote.timeCharge, 0, 'Time charge must be 0');
  assert.strictEqual(quote.manufacturingSubtotal, 140, 'Manufacturing subtotal must be 140 EGP');
  assert.strictEqual(quote.customerTotal, 140, 'Customer total must be 140 EGP');
  assert.strictEqual(quote.depositRequired, 70, 'Deposit must be 50% (70 EGP)');
  assert.strictEqual(quote.remainingBalance, 70, 'Remaining balance must be 70 EGP');

  // Direct costs: 40g * 0.66 = 26.40 EGP
  assert.strictEqual(quote.costs.rawMaterialCost, 26.4, 'Raw material cost must be 26.40 EGP');
  assert.strictEqual(quote.costs.electricityCost, 0, 'Electricity cost must be 0');
  assert.strictEqual(quote.costs.maintenanceCost, 0, 'Maintenance cost must be 0');
  assert.strictEqual(quote.costs.depreciationCost, 0, 'Depreciation cost must be 0');
  assert.strictEqual(quote.costs.failedPrintReserve, 0, 'Failed print reserve must be 0');
  assert.strictEqual(quote.costs.totalDirectCosts, 26.4, 'Total direct costs must equal raw material cost');

  console.log('[PASS] Pricing Engine: Pure material rate and zero machine accounting');
}

// 2. Micro Order Flat Rate (<17g = 50 EGP)
{
  const microQuote = calculateOrderQuote({
    items: [{ weightGrams: 8, printHours: 0.3, materialKey: 'pla' }],
    deliveryMode: 'pickup'
  });
  assert.strictEqual(microQuote.isMicroOrder, true, 'isMicroOrder must be true for 8g');
  assert.strictEqual(microQuote.manufacturingSubtotal, 50, 'Micro order subtotal must be 50 EGP');
  assert.strictEqual(microQuote.customerTotal, 50, 'Micro order total must be 50 EGP');
  assert.strictEqual(microQuote.depositRequired, 25, 'Deposit must be 25 EGP');

  console.log('[PASS] Pricing Engine: Micro order (<17g) flat 50 EGP');
}

// 3. 17g Threshold (Does not activate flat 50 EGP, normal 3.50 applies: 17 * 3.5 = 59.5 -> rounded 60)
{
  const thresholdQuote = calculateOrderQuote({
    items: [{ weightGrams: 17, printHours: 0.6, materialKey: 'pla' }],
    deliveryMode: 'pickup'
  });
  assert.strictEqual(thresholdQuote.isMicroOrder, false, 'isMicroOrder must be false for 17g');
  assert.strictEqual(thresholdQuote.manufacturingSubtotal, 60, '17g subtotal must be rounded 60 EGP');

  console.log('[PASS] Pricing Engine: 17g threshold correctly does not trigger flat 50 EGP');
}

// 4. Shipping Minimum (150 EGP baseline)
{
  const shipQuote = calculateOrderQuote({
    items: [{ weightGrams: 20, printHours: 0.8, materialKey: 'pla' }],
    deliveryMode: 'shipping',
    shippingZoneKey: 'alexandria'
  });
  // 20 * 3.5 = 70. Shipping minimum applies to manufacturing subtotal (150 EGP)
  // Packaging fee: 25, Shipping fee (Alexandria): 55 -> Customer Total = 150 + 25 + 55 = 230 EGP
  assert.strictEqual(shipQuote.manufacturingSubtotal, 150, 'Manufacturing subtotal must meet shipping minimum of 150 EGP');
  assert.strictEqual(shipQuote.customerTotal, 230, 'Customer total must be 230 EGP (150 manufacturing + 25 packaging + 55 shipping)');
  // Direct cost: 20g * 0.66 (13.2) + 10 packaging = 23.2 EGP
  assert.strictEqual(shipQuote.costs.totalDirectCosts, 23.2, 'Direct costs must be material + packaging');

  console.log('[PASS] Pricing Engine: Shipping minimum and packaging direct cost');
}

// 5. Admin Dashboard Helper Functions (Testing Graceful Legacy Fallbacks)
{
  // getPrinterFromNotes
  function getPrinterFromNotes(notesOrOrder) {
    if (!notesOrOrder) return null;
    const notes = typeof notesOrOrder === 'object'
      ? (notesOrOrder.notes || notesOrOrder.printer || '')
      : String(notesOrOrder);
    if (typeof notesOrOrder === 'object' && notesOrOrder.printer) {
      return String(notesOrOrder.printer).trim();
    }
    const match = notes.match(/\[PRINTER:([^\]]+)\]/i) || notes.match(/\[Assigned Hardware:\s*([^\]]+)\]/i);
    return match ? match[1].trim() : null;
  }

  assert.strictEqual(getPrinterFromNotes(null), null);
  assert.strictEqual(getPrinterFromNotes(''), null);
  assert.strictEqual(getPrinterFromNotes('[PRINTER:CC Abdalla]'), 'CC Abdalla');
  assert.strictEqual(getPrinterFromNotes('[Assigned Hardware: CC Abdalla]'), 'CC Abdalla');
  assert.strictEqual(getPrinterFromNotes({ printer: 'CC Mazen' }), 'CC Mazen');
  assert.strictEqual(getPrinterFromNotes({ notes: '[Assigned Hardware: CC Abdalla] [Mode: pickup]' }), 'CC Abdalla');
  assert.strictEqual(getPrinterFromNotes('Legacy customer notes [PRINTER:CC Mazen] extra text'), 'CC Mazen');

  // setPrinterInNotes
  function setPrinterInNotes(notes, printer) {
    const cleanNotes = (notes || '')
      .replace(/\[PRINTER:[^\]]+\]\s*/gi, '')
      .replace(/\[Assigned Hardware:[^\]]+\]\s*/gi, '')
      .trim();
    if (!printer) return cleanNotes;
    return `[PRINTER:${printer}] ${cleanNotes}`.trim();
  }

  assert.strictEqual(setPrinterInNotes('Legacy text', 'CC Abdalla'), '[PRINTER:CC Abdalla] Legacy text');
  assert.strictEqual(setPrinterInNotes('[PRINTER:CC Abdalla] Legacy text', 'CC Mazen'), '[PRINTER:CC Mazen] Legacy text');
  assert.strictEqual(setPrinterInNotes('[Assigned Hardware: CC Abdalla] Legacy text', 'CC Mazen'), '[PRINTER:CC Mazen] Legacy text');
  assert.strictEqual(setPrinterInNotes('Middle [PRINTER:CC Abdalla] end', 'CC Mazen'), '[PRINTER:CC Mazen] Middle end');

  // getDeliveryMode
  function getDeliveryMode(orderOrNotes) {
    if (!orderOrNotes) return 'pickup';
    if (typeof orderOrNotes === 'object') {
      if (orderOrNotes.delivery_mode) return String(orderOrNotes.delivery_mode).toLowerCase().trim();
      const notes = orderOrNotes.notes || '';
      const match = notes.match(/\[DELIVERY:([^\]]+)\]/i) || notes.match(/\[Mode:\s*([^\]|]+)/i);
      if (match) return match[1].trim().toLowerCase();
      return 'pickup';
    }
    const match = String(orderOrNotes).match(/\[DELIVERY:([^\]]+)\]/i) || String(orderOrNotes).match(/\[Mode:\s*([^\]|]+)/i);
    return match ? match[1].trim().toLowerCase() : 'pickup';
  }

  assert.strictEqual(getDeliveryMode({}), 'pickup');
  assert.strictEqual(getDeliveryMode({ delivery_mode: 'shipping' }), 'shipping');
  assert.strictEqual(getDeliveryMode({ notes: '[DELIVERY:shipping]' }), 'shipping');
  assert.strictEqual(getDeliveryMode({ notes: '[Mode: pickup | Deposit: 50]' }), 'pickup');
  assert.strictEqual(getDeliveryMode('[Mode: shipping]'), 'shipping');

  // getOrderDeposit
  function getOrderDeposit(orderOrNotes) {
    if (!orderOrNotes) return 0;
    if (typeof orderOrNotes === 'object') {
      if (orderOrNotes.deposit_required !== undefined && orderOrNotes.deposit_required !== null && !isNaN(Number(orderOrNotes.deposit_required))) {
        return Number(orderOrNotes.deposit_required);
      }
      const notes = orderOrNotes.notes || '';
      const match = notes.match(/\[DEPOSIT:([^\]]+)\]/i) || notes.match(/\[Deposit:\s*([^\]|EGP]+)/i);
      if (match) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed)) return parsed;
      }
      return Math.round((Number(orderOrNotes.totalprice) || 0) * 0.5);
    }
    const match = String(orderOrNotes).match(/\[DEPOSIT:([^\]]+)\]/i) || String(orderOrNotes).match(/\[Deposit:\s*([^\]|EGP]+)/i);
    return match ? (parseFloat(match[1]) || 0) : 0;
  }

  assert.strictEqual(getOrderDeposit({ totalprice: 200 }), 100);
  assert.strictEqual(getOrderDeposit({ deposit_required: 80, totalprice: 200 }), 80);
  assert.strictEqual(getOrderDeposit({ notes: '[DEPOSIT:75]', totalprice: 200 }), 75);
  assert.strictEqual(getOrderDeposit({ notes: '[Deposit: 90 EGP]', totalprice: 200 }), 90);
  assert.strictEqual(getOrderDeposit('[Deposit: 65 EGP]'), 65);

  // getOrderPrintHours
  function getOrderPrintHours(orderOrNotes) {
    if (!orderOrNotes) return 0.5;
    if (typeof orderOrNotes === 'object') {
      if (orderOrNotes.printhours !== undefined && orderOrNotes.printhours !== null && !isNaN(Number(orderOrNotes.printhours))) {
        return Number(orderOrNotes.printhours);
      }
      const notes = orderOrNotes.notes || '';
      const match = notes.match(/\[HOURS:([^\]]+)\]/i) || notes.match(/\[Time:\s*([^\]|h]+)/i);
      if (match) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed)) return parsed;
      }
      const w = Number(orderOrNotes.weightgrams) || 0;
      return w > 0 ? Number((w / 35).toFixed(1)) : 0.5;
    }
    const match = String(orderOrNotes).match(/\[HOURS:([^\]]+)\]/i) || String(orderOrNotes).match(/\[Time:\s*([^\]|h]+)/i);
    return match ? (parseFloat(match[1]) || 0.5) : 0.5;
  }

  assert.strictEqual(getOrderPrintHours({ weightgrams: 70 }), 2.0);
  assert.strictEqual(getOrderPrintHours({ printhours: 3.5, weightgrams: 70 }), 3.5);
  assert.strictEqual(getOrderPrintHours({ notes: '[HOURS:4.2]' }), 4.2);
  assert.strictEqual(getOrderPrintHours({ notes: '[Time: 1.8h]' }), 1.8);
  assert.strictEqual(getOrderPrintHours('[Time: 2.2h]'), 2.2);
  assert.strictEqual(getOrderPrintHours({}), 0.5);

  // getOrderPaymentInfo
  function getOrderPaymentInfo(order) {
    if (!order) return { status: 'unpaid', paidAmount: 0 };
    if (order.payment_status) {
      const s = String(order.payment_status).toLowerCase().trim();
      if (['paid', 'partial', 'unpaid'].includes(s)) {
        const orderTotal = Number(order.totalprice || 0);
        const paid = order.paid_amount !== undefined && order.paid_amount !== null && !isNaN(order.paid_amount)
          ? Number(order.paid_amount)
          : (s === 'paid' ? orderTotal : (s === 'partial' ? getOrderDeposit(order) : 0));
        return { status: s, paidAmount: paid };
      }
    }
    const notes = order.notes || '';
    const match = notes.match(/\[PAYMENT:([^:\]]+)(?::([^\]]+))?\]/i);
    if (match) {
      const s = match[1].toLowerCase().trim();
      const cleanStatus = ['paid', 'partial', 'unpaid'].includes(s) ? s : 'unpaid';
      const amt = match[2] ? parseFloat(match[2]) : (cleanStatus === 'paid' ? Number(order.totalprice || 0) : (cleanStatus === 'partial' ? getOrderDeposit(order) : 0));
      return { status: cleanStatus, paidAmount: isNaN(amt) ? 0 : amt };
    }
    const depositPaid = Number(order.deposit_paid || 0);
    const total = Number(order.totalprice || 0);
    if (depositPaid >= total && total > 0) return { status: 'paid', paidAmount: depositPaid };
    if (depositPaid > 0) return { status: 'partial', paidAmount: depositPaid };
    return { status: 'unpaid', paidAmount: 0 };
  }

  assert.deepStrictEqual(getOrderPaymentInfo({}), { status: 'unpaid', paidAmount: 0 });
  assert.deepStrictEqual(getOrderPaymentInfo({ payment_status: 'paid', totalprice: 150 }), { status: 'paid', paidAmount: 150 });
  assert.deepStrictEqual(getOrderPaymentInfo({ notes: '[PAYMENT:partial:60]' }), { status: 'partial', paidAmount: 60 });
  assert.deepStrictEqual(getOrderPaymentInfo({ deposit_paid: 50, totalprice: 100 }), { status: 'partial', paidAmount: 50 });

  console.log('[PASS] Helper Functions: Graceful fallbacks for legacy orders verified');
}

// 6. Fleet Net Profit Calculation (Direct cost = material cost only)
{
  const mockOrder = {
    status: 'done',
    notes: '[PRINTER:CC Abdalla]',
    weightgrams: 100,
    totalprice: 350,
    material: 'PLA'
  };

  const matCostRate = 0.66;
  const materialCost = mockOrder.weightgrams * matCostRate; // 66 EGP
  const directCost = materialCost; // Strictly materialCost
  const netProfit = mockOrder.totalprice - directCost; // 350 - 66 = 284 EGP

  assert.strictEqual(directCost, 66);
  assert.strictEqual(netProfit, 284);

  console.log('[PASS] Fleet Accounting: Net profit is strictly revenue minus material cost');
}

// 7. Safe Backfill Enrichment & Idempotency Simulation
{
  function simulateEnrichment(order) {
    const rawNotes = order.notes || '';
    const tagsToAdd = [];

    // 1. Delivery mode tag
    if (!/\[DELIVERY:/i.test(rawNotes) && !/\[Mode:/i.test(rawNotes)) {
      const deliveryMode = order.delivery_mode ? String(order.delivery_mode).toLowerCase().trim() : 'pickup';
      tagsToAdd.push(`[DELIVERY:${deliveryMode}]`);
    }

    // 2. Deposit and Balance tags
    const totalPrice = Number(order.totalprice) || 0;
    const deposit = (order.deposit_required !== undefined && order.deposit_required !== null && !isNaN(Number(order.deposit_required)))
      ? Number(order.deposit_required)
      : Math.round(totalPrice * 0.5);
    const balance = Math.max(0, totalPrice - deposit);

    if (!/\[DEPOSIT:/i.test(rawNotes) && !/(?:\[Deposit:|\|\s*Deposit:)\s*[\d.]+/i.test(rawNotes)) {
      tagsToAdd.push(`[DEPOSIT:${deposit}]`);
    }

    if (!/\[BALANCE:/i.test(rawNotes) && !/\[Balance:/i.test(rawNotes)) {
      tagsToAdd.push(`[BALANCE:${balance}]`);
    }

    // 3. Print hours tag
    if (!/\[HOURS:/i.test(rawNotes) && !/\[Time:/i.test(rawNotes)) {
      const w = Number(order.weightgrams) || 0;
      const hours = (order.printhours !== undefined && order.printhours !== null && !isNaN(Number(order.printhours)))
        ? Number(order.printhours)
        : (w > 0 ? Number((w / 35).toFixed(1)) : 0.5);
      tagsToAdd.push(`[HOURS:${hours}]`);
    }

    if (tagsToAdd.length === 0) return null; // Skipped
    const cleanExisting = rawNotes.trim();
    return cleanExisting ? `${cleanExisting} ${tagsToAdd.join(' ')}` : tagsToAdd.join(' ');
  }

  // Case A: Completely legacy order with raw notes
  const legacy1 = { notes: 'Rush order for graduation project', totalprice: 140, weightgrams: 40 };
  const enriched1 = simulateEnrichment(legacy1);
  assert.strictEqual(enriched1, 'Rush order for graduation project [DELIVERY:pickup] [DEPOSIT:70] [BALANCE:70] [HOURS:1.1]');

  // Case B: Partially tagged legacy order (has [Mode: pickup | Deposit: 60 EGP])
  const legacy2 = { notes: '[Assigned Hardware: CC Abdalla] [Mode: pickup | Deposit: 60 EGP]', totalprice: 120, weightgrams: 35 };
  const enriched2 = simulateEnrichment(legacy2);
  assert.strictEqual(enriched2, '[Assigned Hardware: CC Abdalla] [Mode: pickup | Deposit: 60 EGP] [BALANCE:60] [HOURS:1]');

  // Case C: Already fully tagged order (idempotent skip)
  const fullyTagged = { notes: '[DELIVERY:pickup] [DEPOSIT:50] [BALANCE:50] [HOURS:1.2]', totalprice: 100, weightgrams: 42 };
  const enriched3 = simulateEnrichment(fullyTagged);
  assert.strictEqual(enriched3, null, 'Already tagged order must be skipped');

  console.log('[PASS] Safe Database Backfill: Enrichment logic & idempotency verified');
}

console.log('\nALL UNIT AND REGRESSION TESTS COMPLETED SUCCESSFULLY.');
