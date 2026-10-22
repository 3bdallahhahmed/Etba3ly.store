/**
 * Core Dynamic Pricing, Cost Accounting & Profitability Engine
 * Centurai Print OS / Etba3ly 3D Printing System
 * No emojis allowed.
 */

export const DEFAULT_PRICING_SETTINGS = {
  setup_fee: 25.00,
  printing_hourly_rate: 12.00,
  pickup_minimum: 75.00,
  shipping_minimum: 150.00,
  packaging_fee: 25.00,
  actual_packaging_cost: 10.00,
  electricity_hourly_rate: 0.00, // Electricity default 0 EGP/hr in dorms
  maintenance_hourly_rate: 5.00,
  depreciation_hourly_rate: 4.50,
  failed_print_reserve_pct: 0.08,
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
  pla: { name: "PLA", selling_rate: 1.80, cost: 0.65, in_stock: true },
  pla_plus: { name: "PLA+", selling_rate: 2.00, cost: 0.75, in_stock: true },
  petg: { name: "PETG", selling_rate: 2.10, cost: 0.70, in_stock: true },
  abs: { name: "ABS", selling_rate: 2.20, cost: 0.75, in_stock: true },
  tpu: { name: "TPU", selling_rate: 2.70, cost: 0.95, in_stock: true },
  carbon_fiber: { name: "Carbon Fiber", selling_rate: 3.50, cost: 1.35, in_stock: true }
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
              selling_rate: Number(v.selling_rate) || 2.0,
              cost: Number(v.cost) || 0.75,
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
          selling_rate: rateMatch ? parseFloat(rateMatch[1]) : (def.selling_rate || 2.0),
          cost: costMatch ? parseFloat(costMatch[1]) : (def.cost || 0.75),
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

  const setupFee = Number(cfg.setup_fee) || 25;
  const hourlyRate = Number(cfg.printing_hourly_rate) || 12;
  const timeCharge = totalPrintHours * hourlyRate;

  const rawSubtotal = setupFee + materialCharge + timeCharge;

  const pickupMin = Number(cfg.pickup_minimum) || 75;
  const shippingMin = Number(cfg.shipping_minimum) || 150;
  const minimum = deliveryMode === "shipping" ? shippingMin : pickupMin;

  const minimumApplied = rawSubtotal < minimum;
  const manufacturingSubtotal = Math.ceil(Math.max(rawSubtotal, minimum) / 5) * 5;

  // Packaging and Shipping Fees
  const packagingFee = deliveryMode === "shipping" ? (Number(cfg.packaging_fee) || 25) : 0;
  const actualPackagingCost = deliveryMode === "shipping" ? (Number(cfg.actual_packaging_cost) || 10) : 0;

  let shippingFee = 0;
  if (deliveryMode === "shipping") {
    const zone = DEFAULT_SHIPPING_ZONES[shippingZoneKey] || DEFAULT_SHIPPING_ZONES.alexandria;
    shippingFee = zone.cost;
  }

  const customerTotal = manufacturingSubtotal + packagingFee + shippingFee;

  // Deposit: 50% of manufacturing subtotal
  const depositPct = Number(cfg.deposit_percentage) || 0.50;
  const depositRequired = Math.ceil(manufacturingSubtotal * depositPct);
  const remainingBalance = customerTotal - depositRequired;

  // Direct Cost Breakdown
  const electricityHourly = Number(cfg.electricity_hourly_rate) || 0;
  const maintenanceHourly = Number(cfg.maintenance_hourly_rate) || 5;
  const depreciationHourly = Number(cfg.depreciation_hourly_rate) || 4.5;
  const failedReservePct = Number(cfg.failed_print_reserve_pct) || 0.08;

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
 * Runs automated verification of all specification test cases.
 */
export function runPricingEngineTests() {
  const results = [];

  // Test 1: 30g PLA, 40 min (0.667h), Pickup
  // Raw: 25 + (30 * 1.80) + (0.667 * 12) = 25 + 54 + 8 = 87 EGP -> Rounded 90 EGP
  const t1 = calculateOrderQuote({
    items: [{ weightGrams: 30, printHours: 40 / 60, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 1: 30g PLA 40min Pickup",
    expectedRaw: 87,
    actualRaw: Math.round(t1.rawSubtotal),
    expectedSubtotal: 90,
    actualSubtotal: t1.manufacturingSubtotal,
    passed: Math.round(t1.rawSubtotal) === 87 && t1.manufacturingSubtotal === 90
  });

  // Test 2: 30g PLA, 7 hours, Pickup
  // Raw: 25 + (30 * 1.80) + (7 * 12) = 25 + 54 + 84 = 163 EGP -> Rounded 165 EGP
  const t2 = calculateOrderQuote({
    items: [{ weightGrams: 30, printHours: 7, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 2: 30g PLA 7h Pickup",
    expectedRaw: 163,
    actualRaw: Math.round(t2.rawSubtotal),
    expectedSubtotal: 165,
    actualSubtotal: t2.manufacturingSubtotal,
    passed: Math.round(t2.rawSubtotal) === 163 && t2.manufacturingSubtotal === 165
  });

  // Test 3: 6g PLA micro-order, Pickup
  // Raw: 25 + (6 * 1.80) + (0.2 * 12) = ~38.2 EGP -> Minimum 75 EGP applied
  const t3 = calculateOrderQuote({
    items: [{ weightGrams: 6, printHours: 0.2, materialKey: "pla" }],
    deliveryMode: "pickup"
  });
  results.push({
    test: "Test 3: 6g PLA Pickup Minimum",
    expectedSubtotal: 75,
    actualSubtotal: t3.manufacturingSubtotal,
    minimumApplied: t3.minimumApplied,
    passed: t3.manufacturingSubtotal === 75 && t3.minimumApplied === true
  });

  // Test 4: Nationwide Shipping Order (6g PLA)
  // Minimum: 150 EGP + 25 EGP packaging + 55 EGP shipping (Alexandria) = 230 EGP total
  const t4 = calculateOrderQuote({
    items: [{ weightGrams: 6, printHours: 0.2, materialKey: "pla" }],
    deliveryMode: "shipping",
    shippingZoneKey: "alexandria"
  });
  results.push({
    test: "Test 4: Nationwide Shipping Order",
    expectedSubtotal: 150,
    actualSubtotal: t4.manufacturingSubtotal,
    expectedTotal: 230,
    actualTotal: t4.customerTotal,
    passed: t4.manufacturingSubtotal === 150 && t4.customerTotal === 230
  });

  // Test 5: ElectraGo Referral Commission (5% of manufacturing subtotal)
  const t5 = calculateOrderQuote({
    items: [{ weightGrams: 30, printHours: 7, materialKey: "pla" }],
    deliveryMode: "shipping",
    shippingZoneKey: "alexandria",
    referralCode: "electrago"
  });
  // manufacturingSubtotal is 165 EGP. 5% = 8.25 EGP
  results.push({
    test: "Test 5: ElectraGo Referral Commission",
    expectedComm: 8.25,
    actualComm: t5.profitability.referralCommission,
    passed: t5.profitability.referralCommission === 8.25
  });

  return results;
}
