/**
 * Core Dynamic Pricing, Cost Accounting & Profitability Engine
 * Centurai Print OS / Etba3ly 3D Printing System
 * No emojis allowed.
 */

export const DEFAULT_PRICING_SETTINGS = {
  // Machine capital & lifespan specs (Elegoo Centauri Carbon CC1)
  printer_cost: 40000.00,          // Machine purchase price (EGP)
  printer_lifespan_hours: 2000.00,  // Design operational lifespan (hours)
  spool_cost_per_kg: 660.00,       // Standard 1kg filament spool cost (EGP)
  avg_print_speed_g_per_hr: 30.00, // CoreXY extrusion speed average (25-45 g/hr)

  // Micro-order rule: Under 17g is flat 50 EGP. 17g+ does not activate (normal 3.5/g)
  micro_order_weight_threshold: 17.00, // Grams threshold
  micro_order_flat_price: 50.00,       // Flat price (EGP) for orders under 17g

  // Order pricing parameters
  setup_fee: 0.00,                 // 0 by default so normal 3.5/g is exact
  printing_hourly_rate: 0.00,      // 0 by default so normal 3.5/g is exact
  pickup_minimum: 50.00,           // 50 EGP campus pickup baseline
  shipping_minimum: 150.00,        // 150 EGP minimum for courier shipping
  packaging_fee: 25.00,
  actual_packaging_cost: 10.00,

  // Direct operating costs & amortization
  electricity_hourly_rate: 0.40,   // 200W avg draw = 400 kWh over 2,000h = ~800 EGP in Egypt (0.40 EGP/hr)
  maintenance_hourly_rate: 3.50,   // Periodic nozzles, PTFE tubes, textured PEI build plates
  depreciation_hourly_rate: 20.00, // 40,000 EGP printer cost / 2,000 hours = 20.00 EGP/hr
  failed_print_reserve_pct: 0.12,  // 12% reserve for supports, skirts, and failed prints (raising usable cost to ~0.76 EGP/g)

  // Commercial & partner splits
  deposit_percentage: 0.50,
  referral_commission_pct: 0.05,
  monthly_fixed_overhead: 0.00,
  partner_a_ownership: 0.50,
  partner_b_ownership: 0.50,
  distributable_pool_pct: 0.40,
  growth_pool_pct: 0.40,
  reserve_pool_pct: 0.20
};

export const DEFAULT_MATERIAL_RATES = {
  pla: { name: "PLA", selling_rate: 3.50, cost: 0.66, in_stock: true },
  pla_plus: { name: "PLA+", selling_rate: 3.75, cost: 0.75, in_stock: true },
  petg: { name: "PETG", selling_rate: 4.00, cost: 0.78, in_stock: true },
  abs: { name: "ABS", selling_rate: 4.00, cost: 0.80, in_stock: true },
  tpu: { name: "TPU", selling_rate: 4.50, cost: 0.95, in_stock: true },
  carbon_fiber: { name: "Carbon Fiber", selling_rate: 5.50, cost: 1.35, in_stock: true }
};

export const DEFAULT_SHIPPING_ZONES = {
  alexandria: { name: "Alexandria", cost: 55.00 },
  cairo_giza: { name: "Cairo / Giza", cost: 75.00 },
  delta_canal: { name: "Delta / Canal", cost: 90.00 },
  upper_egypt: { name: "Upper Egypt / Remote", cost: 110.00 }
};

/**
 * Resolves CSS color hex from filament color names.
 */
export function getColorHex(colorName = "") {
  const c = String(colorName || "").toLowerCase().trim();
  if (c.startsWith("#")) return c;
  if (c.includes("white") || c.includes("marble")) return "#f8fafc";
  if (c.includes("black") || c.includes("carbon") || c.includes("obsidian")) return "#1e232a";
  if (c.includes("orange") || c.includes("mclaren")) return "#ff8000";
  if (c.includes("silver") || c.includes("grey") || c.includes("gray") || c.includes("titanium")) return "#94a3b8";
  if (c.includes("red") || c.includes("crimson")) return "#ef4444";
  if (c.includes("blue") || c.includes("sky") || c.includes("cobalt")) return "#3b82f6";
  if (c.includes("green") || c.includes("emerald")) return "#10b981";
  if (c.includes("yellow") || c.includes("gold")) return "#eab308";
  if (c.includes("purple") || c.includes("violet")) return "#8b5cf6";
  if (c.includes("pink")) return "#ec4899";
  if (c.includes("brown") || c.includes("wood")) return "#78350f";
  return "#64748b";
}

/**
 * Normalizes material keys from raw names (e.g. "Elegoo Rapid PLA+", "petg", "PLA")
 */
export function normalizeMaterialKey(rawName) {
  if (!rawName) return "pla";
  const s = String(rawName).toLowerCase().trim();
  if (s.includes("carbon") || s.includes("cf")) return "carbon_fiber";
  if (s.includes("tpu")) return "tpu";
  if (s.includes("petg")) return "petg";
  if (s.includes("abs")) return "abs";
  if (s.includes("+") || s.includes("rapid") || s.includes("plus")) return "pla_plus";
  if (s === "pla" || s.startsWith("pla ") || s.endsWith(" pla")) {
    if (!s.includes("silk") && !s.includes("wood") && !s.includes("glow") && !s.includes("matte") && !s.includes("metal")) {
      return "pla";
    }
  }
  return s.replace(/[^a-z0-9]/g, '_') || "pla";
}

/**
 * Parses filaments and rates catalog from database config.
 * Supports HTML comment stash (<!--RATES_CATALOG:...-->), raw JSON, or comma-separated names.
 */
export function parseFilamentCatalog(rawMaterials, rawWhyText = '') {
  // 1. Try why_text comment stash
  if (rawWhyText) {
    const match = rawWhyText.match(/<!--RATES_CATALOG:(.*?)-->/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          const normalized = {};
          Object.entries(parsed).forEach(([k, v]) => {
            normalized[k] = {
              name: v.name || k,
              selling_rate: Number(v.selling_rate) || 3.5,
              cost: Number(v.cost) || 0.66,
              in_stock: v.in_stock !== false
            };
          });
          return normalized;
        }
      } catch (e) {}
    }
  }

  // 2. Try rawMaterials as JSON
  if (rawMaterials && (rawMaterials.startsWith('{') || rawMaterials.startsWith('['))) {
    try {
      const parsed = JSON.parse(rawMaterials);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch (e) {}
  }

  // 3. Parse comma-separated string like "PLA+, PETG, ABS, Carbon Fiber, TPU"
  if (rawMaterials && typeof rawMaterials === 'string') {
    const names = rawMaterials.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length > 0) {
      const result = {};
      names.forEach(rawName => {
        const isRestocking = rawName.toLowerCase().includes('[restocking]');
        const rateMatch = rawName.match(/\[rate:([\d.]+)\]/i);
        const costMatch = rawName.match(/\[cost:([\d.]+)\]/i);
        const cleanName = rawName
          .replace(/\[restocking\]/gi, '')
          .replace(/\[rate:[\d.]+\]/gi, '')
          .replace(/\[cost:[\d.]+\]/gi, '')
          .trim();
        if (!cleanName) return;
        const normKey = normalizeMaterialKey(cleanName);
        const isStandard = ['pla', 'pla_plus', 'petg', 'abs', 'tpu', 'carbon_fiber'].includes(normKey);
        const key = isStandard ? normKey : cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const def = DEFAULT_MATERIAL_RATES[key] || DEFAULT_MATERIAL_RATES[normKey] || DEFAULT_MATERIAL_RATES.pla;
        result[key] = {
          name: cleanName,
          selling_rate: rateMatch ? parseFloat(rateMatch[1]) : (def.selling_rate || 3.5),
          cost: costMatch ? parseFloat(costMatch[1]) : (def.cost || 0.66),
          in_stock: !isRestocking
        };
      });

      // Ensure standard PLA is present if not explicitly included
      if (!result.pla && !names.some(n => n.toLowerCase() === 'pla')) {
        result.pla = { ...DEFAULT_MATERIAL_RATES.pla };
      }
      return result;
    }
  }

  return { ...DEFAULT_MATERIAL_RATES };
}

/**
 * Serializes materials catalog into site_config.materials comma-separated string
 */
export function serializeFilamentCatalog(materials) {
  if (!materials || typeof materials !== 'object') return 'PLA, PLA+, PETG, ABS, TPU, Carbon Fiber';
  return Object.values(materials)
    .filter(m => m && m.name)
    .map(m => {
      const parts = [m.name];
      if (m.selling_rate !== undefined && m.selling_rate !== null) {
        parts.push(`[rate:${Number(m.selling_rate).toFixed(2)}]`);
      }
      if (m.cost !== undefined && m.cost !== null) {
        parts.push(`[cost:${Number(m.cost).toFixed(2)}]`);
      }
      if (m.in_stock === false) {
        parts.push(`[restocking]`);
      }
      return parts.join(' ');
    })
    .join(', ');
}

/**
 * Calculates a complete itemized quote for customer checkout and admin validation.
 */
export function calculateOrderQuote({
  items = [], // [{ weightGrams, printHours, materialKey, quantity }]
  deliveryMode = "pickup", // "pickup" | "shipping"
  shippingZoneKey = "alexandria",
  customSettings = {},
  customMaterials = {},
  referralCode = null
}) {
  const cfg = { ...DEFAULT_PRICING_SETTINGS, ...customSettings };
  const mats = { ...DEFAULT_MATERIAL_RATES, ...customMaterials };

  // If items array is empty but raw values provided directly
  const safeItems = items.length > 0 ? items : [{ weightGrams: 0, printHours: 0, materialKey: "pla", quantity: 1 }];

  let totalWeightG = 0;
  let totalPrintHours = 0;
  let materialCharge = 0;
  let rawMaterialCost = 0;

  safeItems.forEach(item => {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const w = (Number(item.weightGrams) || 0) * qty;
    const h = (Number(item.printHours) || 0) * qty;
    const rawMat = String(item.materialKey || item.material || "").toLowerCase().trim();
    const cleanRawMat = rawMat.replace(/\[restocking\]/gi, '').trim();
    const mKey = normalizeMaterialKey(cleanRawMat);
    const directByName = Object.values(mats).find(m => m && m.name && m.name.toLowerCase().trim() === cleanRawMat);
    const mData = directByName ||
                  mats[cleanRawMat] ||
                  mats[cleanRawMat.replace(/\s+/g, '_')] ||
                  mats[mKey] ||
                  DEFAULT_MATERIAL_RATES[mKey] ||
                  DEFAULT_MATERIAL_RATES.pla;

    totalWeightG += w;
    totalPrintHours += h; // Occupancy hours for jobs
    materialCharge += w * mData.selling_rate;
    rawMaterialCost += w * mData.cost;
  });

  const microThreshold = Number(cfg.micro_order_weight_threshold) || 17.0;
  const microFlatPrice = Number(cfg.micro_order_flat_price) || 50.0;
  const isMicroOrder = totalWeightG > 0 && totalWeightG < microThreshold;

  const setupFee = Number(cfg.setup_fee) || 0;
  const hourlyRate = Number(cfg.printing_hourly_rate) || 0;
  const timeCharge = totalPrintHours * hourlyRate;

  const pickupMin = isMicroOrder ? microFlatPrice : (Number(cfg.pickup_minimum) || 50);
  const shippingMin = Number(cfg.shipping_minimum) || 150;
  const minimum = deliveryMode === "shipping" ? shippingMin : pickupMin;

  let rawSubtotal;
  let minimumApplied = false;
  let manufacturingSubtotal;

  if (isMicroOrder) {
    // Under 17g: Fixed 50 EGP flat rate activates
    rawSubtotal = microFlatPrice;
    manufacturingSubtotal = microFlatPrice;
    minimumApplied = true;
  } else {
    // 17g and above: Flat rate does NOT activate; normal rate (3.5/g) applies
    rawSubtotal = setupFee + materialCharge + timeCharge;
    minimumApplied = rawSubtotal < minimum;
    manufacturingSubtotal = Math.ceil(Math.max(rawSubtotal, minimum) / 5) * 5;
  }

  // Packaging and Shipping Fees
  const packagingFee = deliveryMode === "shipping" ? (Number(cfg.packaging_fee) || 25) : 0;
  const actualPackagingCost = deliveryMode === "shipping" ? (Number(cfg.actual_packaging_cost) || 10) : 0;

  let shippingFee = 0;
  if (deliveryMode === "shipping") {
    const zone = DEFAULT_SHIPPING_ZONES[shippingZoneKey] || DEFAULT_SHIPPING_ZONES.alexandria;
    shippingFee = zone.cost;
  }

  const customerTotal = deliveryMode === "shipping" && !isMicroOrder
    ? Math.max(Number(cfg.shipping_minimum) || 150, manufacturingSubtotal + packagingFee + shippingFee)
    : manufacturingSubtotal + packagingFee + shippingFee;

  // Deposit: 50% of manufacturing subtotal
  const depositPct = Number(cfg.deposit_percentage) || 0.50;
  const depositRequired = Math.ceil(manufacturingSubtotal * depositPct);
  const remainingBalance = customerTotal - depositRequired;

  // Direct Cost Breakdown
  const electricityHourly = cfg.electricity_hourly_rate !== undefined && !isNaN(Number(cfg.electricity_hourly_rate))
    ? Number(cfg.electricity_hourly_rate)
    : 0.40;
  const maintenanceHourly = cfg.maintenance_hourly_rate !== undefined && !isNaN(Number(cfg.maintenance_hourly_rate))
    ? Number(cfg.maintenance_hourly_rate)
    : 3.50;
  const depreciationHourly = cfg.depreciation_hourly_rate !== undefined && !isNaN(Number(cfg.depreciation_hourly_rate))
    ? Number(cfg.depreciation_hourly_rate)
    : 20.00;
  const failedReservePct = cfg.failed_print_reserve_pct !== undefined && !isNaN(Number(cfg.failed_print_reserve_pct))
    ? Number(cfg.failed_print_reserve_pct)
    : 0.12;

  const electricityCost = totalPrintHours * electricityHourly;
  const maintenanceCost = totalPrintHours * maintenanceHourly;
  const depreciationCost = totalPrintHours * depreciationHourly;
  const failedPrintReserve = rawMaterialCost * failedReservePct;

  const totalDirectCosts =
    rawMaterialCost +
    electricityCost +
    maintenanceCost +
    depreciationCost +
    failedPrintReserve +
    actualPackagingCost;

  // Referral Commission: Calculated strictly on manufacturing subtotal
  const isReferralEligible = Boolean(referralCode && String(referralCode).trim().length > 0);
  const referralCommPct = Number(cfg.referral_commission_pct) || 0.05;
  const referralCommission = isReferralEligible ? manufacturingSubtotal * referralCommPct : 0;

  const orderContribution = manufacturingSubtotal - totalDirectCosts - referralCommission;
  const profitMarginPct = manufacturingSubtotal > 0 ? (orderContribution / manufacturingSubtotal) * 100 : 0;
  const contributionPerHour = totalPrintHours > 0 ? orderContribution / totalPrintHours : orderContribution;

  return {
    // Volume & Time
    totalWeightG: Math.round(totalWeightG * 100) / 100,
    totalPrintHours: Math.round(totalPrintHours * 100) / 100,

    // Customer Price Breakdown
    isMicroOrder,
    microFlatPrice,
    microThreshold,
    setupFee,
    materialCharge: Math.round(materialCharge * 100) / 100,
    timeCharge: Math.round(timeCharge * 100) / 100,
    rawSubtotal: Math.round(rawSubtotal * 100) / 100,
    minimum,
    minimumApplied,
    manufacturingSubtotal,
    packagingFee,
    shippingFee,
    customerTotal,
    depositRequired,
    remainingBalance,

    // Accounting & Direct Costs
    costs: {
      rawMaterialCost: Math.round(rawMaterialCost * 100) / 100,
      electricityCost: Math.round(electricityCost * 100) / 100,
      maintenanceCost: Math.round(maintenanceCost * 100) / 100,
      depreciationCost: Math.round(depreciationCost * 100) / 100,
      failedPrintReserve: Math.round(failedPrintReserve * 100) / 100,
      actualPackagingCost,
      totalDirectCosts: Math.round(totalDirectCosts * 100) / 100
    },

    // Profitability & Partner Model
    profitability: {
      referralCommission: Math.round(referralCommission * 100) / 100,
      orderContribution: Math.round(orderContribution * 100) / 100,
      profitMarginPct: Math.round(profitMarginPct * 10) / 10,
      contributionPerHour: Math.round(contributionPerHour * 100) / 100
    },

    // Snapshot Meta
    snapshot: {
      calculatedAt: new Date().toISOString(),
      deliveryMode,
      referralCode: referralCode || null,
      settings: cfg
    }
  };
}

/**
 * Calculates 2-partner profit distributions from realized distributable profit.
 */
export function calculatePartnerDistributions(distributableProfit, customSettings = {}) {
  const cfg = { ...DEFAULT_PRICING_SETTINGS, ...customSettings };
  const safeProfit = Math.max(0, Number(distributableProfit) || 0);

  const distPoolPct = Number(cfg.distributable_pool_pct) || 0.40;
  const growthPoolPct = Number(cfg.growth_pool_pct) || 0.40;
  const reservePoolPct = Number(cfg.reserve_pool_pct) || 0.20;

  const partnerAPct = Number(cfg.partner_a_ownership) || 0.50;
  const partnerBPct = Number(cfg.partner_b_ownership) || 0.50;

  const totalDistributionPool = safeProfit * distPoolPct;
  const growthFund = safeProfit * growthPoolPct;
  const cashReserves = safeProfit * reservePoolPct;

  const partnerAShare = totalDistributionPool * partnerAPct;
  const partnerBShare = totalDistributionPool * partnerBPct;

  return {
    netProfit: safeProfit,
    distributionPoolPct: distPoolPct * 100,
    growthPoolPct: growthPoolPct * 100,
    reservePoolPct: reservePoolPct * 100,
    totalDistributionPool: Math.round(totalDistributionPool * 100) / 100,
    growthFund: Math.round(growthFund * 100) / 100,
    cashReserves: Math.round(cashReserves * 100) / 100,
    partnerA: {
      name: "Partner A",
      ownershipPct: partnerAPct * 100,
      payout: Math.round(partnerAShare * 100) / 100
    },
    partnerB: {
      name: "Partner B",
      ownershipPct: partnerBPct * 100,
      payout: Math.round(partnerBShare * 100) / 100
    }
  };
}

/**
 * Calculates Break-Even unit economics and machine payoff analytics.
 * Elegoo Centauri Carbon (CC1) unit model:
 * - Printer cost: 40,000 EGP
 * - Design lifespan: 2,000 operational hours
 * - Spool cost: 660 EGP / 1,000g spool = 0.66 EGP/g
 * - Selling price: 3.50 EGP/g (PLA)
 * - Gross profit margin: 2.84 EGP/g (81.1%)
 * - Break-even volume: 40,000 / 2.84 = 14,085 grams (~14.1 kg)
 * - Required extrusion speed: 14,085 / 2,000 hrs = 7.04 g/hr
 * - Payoff time at CoreXY speed (30 g/hr): ~470 hours
 * - Pure profit runway: 1,530+ hours
 * - Micro-order tier (< 17g): Flat 50 EGP
 */
export function calculateBreakEvenMetrics({
  printerCost = 40000,
  lifespanHours = 2000,
  sellingRatePerGram = 3.50,
  spoolCostPerKg = 660,
  rawCostPerGram = null,
  avgSpeedGramsPerHour = 30,
  completedGrams = 0,
  completedHours = 0
} = {}) {
  const pCost = Number(printerCost) || 40000;
  const lHours = Number(lifespanHours) || 2000;
  const sCost = Number(spoolCostPerKg) || 660;
  const rawCost = rawCostPerGram !== null && rawCostPerGram !== undefined && !isNaN(Number(rawCostPerGram))
    ? Number(rawCostPerGram)
    : (sCost / 1000);
  const sellingRate = Number(sellingRatePerGram) || 3.50;
  const avgSpeed = Number(avgSpeedGramsPerHour) || 30;

  // Gross profit per gram
  const grossProfitPerGram = Math.max(0.01, sellingRate - rawCost);

  // Break-even filament volume in grams
  const breakEvenGrams = Math.ceil(pCost / grossProfitPerGram);
  const breakEvenKg = Math.round((breakEvenGrams / 1000) * 10) / 10;

  // Required extrusion speed over printer lifespan (g/hr)
  const requiredSpeedGramsPerHour = lHours > 0 ? Math.round((breakEvenGrams / lHours) * 100) / 100 : 7.04;

  // Expected print hours to break-even at realistic CoreXY speed
  const hoursToBreakEven = avgSpeed > 0 ? Math.round((breakEvenGrams / avgSpeed) * 10) / 10 : 470;

  // Usable cost factoring in ~12% waste & failed prints
  const effectiveUsableCostPerGram = Math.round((rawCost * 1.12) * 100) / 100;

  // Realized progress towards break-even
  const safeCompletedGrams = Math.max(0, Number(completedGrams) || 0);
  const safeCompletedHours = Math.max(0, Number(completedHours) || 0);
  const progressGramsPct = Math.min(100, Math.round((safeCompletedGrams / breakEvenGrams) * 1000) / 10);
  const progressHoursPct = Math.min(100, Math.round((safeCompletedHours / hoursToBreakEven) * 1000) / 10);
  const gramsRemaining = Math.max(0, breakEvenGrams - safeCompletedGrams);
  const capitalRecovered = Math.min(pCost, Math.round(safeCompletedGrams * grossProfitPerGram * 100) / 100);
  const capitalRemaining = Math.max(0, pCost - capitalRecovered);
  const isBrokenEven = safeCompletedGrams >= breakEvenGrams;
  const pureProfitRunwayHours = Math.max(0, Math.round((lHours - hoursToBreakEven) * 10) / 10);

  return {
    printerCost: pCost,
    lifespanHours: lHours,
    spoolCostPerKg: sCost,
    rawCostPerGram: Math.round(rawCost * 100) / 100,
    effectiveUsableCostPerGram,
    sellingRatePerGram: sellingRate,
    grossProfitPerGram: Math.round(grossProfitPerGram * 100) / 100,
    breakEvenGrams,
    breakEvenKg,
    requiredSpeedGramsPerHour,
    avgSpeedGramsPerHour: avgSpeed,
    hoursToBreakEven,
    pureProfitRunwayHours,
    completedGrams: safeCompletedGrams,
    completedHours: safeCompletedHours,
    progressGramsPct,
    progressHoursPct,
    gramsRemaining,
    capitalRecovered,
    capitalRemaining,
    isBrokenEven
  };
}

/**
 * Runs automated verification of all specification test cases.
 */
export function runPricingEngineTests() {
  const results = [];

  // Test 1: 30g PLA Pickup -> >= 17g, does NOT activate micro flat rate. Normal 3.5/g: 30 * 3.5 = 105 EGP
  const t1 = calculateOrderQuote({
    items: [{ weightGrams: 30, printHours: 1.0, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 1: 30g PLA Normal Rate (3.5 EGP/g)",
    expectedSubtotal: 105,
    actualSubtotal: t1.manufacturingSubtotal,
    isMicroOrder: t1.isMicroOrder,
    passed: t1.manufacturingSubtotal === 105 && t1.isMicroOrder === false
  });

  // Test 2: 17g PLA Pickup -> exactly at 17g threshold. Micro 50 EGP does NOT activate: 17 * 3.5 = 59.5 -> rounded 60 EGP
  const t2 = calculateOrderQuote({
    items: [{ weightGrams: 17, printHours: 0.5, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 2: 17g PLA Threshold (does not activate 50 EGP)",
    expectedSubtotal: 60,
    actualSubtotal: t2.manufacturingSubtotal,
    isMicroOrder: t2.isMicroOrder,
    passed: t2.manufacturingSubtotal === 60 && t2.isMicroOrder === false
  });

  // Test 3: 6g PLA micro-order, Pickup -> < 17g, flat 50 EGP activates
  const t3 = calculateOrderQuote({
    items: [{ weightGrams: 6, printHours: 0.2, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 3: 6g PLA Micro Order Flat Rate (< 17g = 50 EGP)",
    expectedSubtotal: 50,
    actualSubtotal: t3.manufacturingSubtotal,
    isMicroOrder: t3.isMicroOrder,
    passed: t3.manufacturingSubtotal === 50 && t3.isMicroOrder === true
  });

  // Test 4: 16.5g PLA micro-order, Pickup -> < 17g, flat 50 EGP activates
  const t4 = calculateOrderQuote({
    items: [{ weightGrams: 16.5, printHours: 0.5, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 4: 16.5g PLA Micro Order (< 17g = 50 EGP)",
    expectedSubtotal: 50,
    actualSubtotal: t4.manufacturingSubtotal,
    isMicroOrder: t4.isMicroOrder,
    passed: t4.manufacturingSubtotal === 50 && t4.isMicroOrder === true
  });

  // Test 5: 6g PLA Nationwide Shipping (Alexandria) -> 50 EGP manufacturing + 25 packaging + 55 shipping = 130 EGP
  const t5 = calculateOrderQuote({
    items: [{ weightGrams: 6, printHours: 0.2, materialKey: "pla" }],
    deliveryMode: "shipping",
    shippingZoneKey: "alexandria"
  });
  results.push({
    test: "Test 5: 6g PLA Micro Shipping Order",
    expectedSubtotal: 50,
    actualSubtotal: t5.manufacturingSubtotal,
    expectedTotal: 130,
    actualTotal: t5.customerTotal,
    passed: t5.manufacturingSubtotal === 50 && t5.customerTotal === 130
  });

  // Test 6: 20g PLA ElectraGo Referral Commission (5% of 70 EGP = 3.50 EGP)
  const t6 = calculateOrderQuote({
    items: [{ weightGrams: 20, printHours: 0.6, materialKey: "pla" }],
    deliveryMode: "pickup",
    referralCode: "electrago"
  });
  results.push({
    test: "Test 6: 20g PLA ElectraGo Referral Commission",
    expectedComm: 3.50,
    actualComm: t6.profitability.referralCommission,
    passed: t6.profitability.referralCommission === 3.50
  });

  return results;
}
