import React, { useState, useEffect, useMemo } from 'react';
import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  DEFAULT_SHIPPING_ZONES,
  calculateOrderQuote,
  calculatePartnerDistributions,
  calculateBreakEvenMetrics,
  normalizeMaterialKey
} from '../utils/pricingEngine';

export default function AdminFinancialDashboard({
  orders = [],
  supabase,
  addToast = () => {}
}) {
  const [activeTab, setActiveTab] = useState('pl'); // 'pl' | 'breakeven' | 'partners' | 'settings' | 'orders'
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_pricing_settings');
      if (cached) return { ...DEFAULT_PRICING_SETTINGS, ...JSON.parse(cached) };
    } catch {}
    return { ...DEFAULT_PRICING_SETTINGS };
  });

  const [materialRates, setMaterialRates] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_material_rates');
      if (cached) return { ...DEFAULT_MATERIAL_RATES, ...JSON.parse(cached) };
    } catch {}
    return { ...DEFAULT_MATERIAL_RATES };
  });

  const [saving, setSaving] = useState(false);

  // Interactive Break-Even Simulator State
  const [simPrinterCost, setSimPrinterCost] = useState(40000);
  const [simLifespan, setSimLifespan] = useState(2000);
  const [simSpoolCost, setSimSpoolCost] = useState(660);
  const [simSellingRate, setSimSellingRate] = useState(3.00);
  const [simSpeed, setSimSpeed] = useState(30);

  // Sync simulator defaults from settings
  useEffect(() => {
    if (settings.printer_cost) setSimPrinterCost(Number(settings.printer_cost));
    if (settings.printer_lifespan_hours) setSimLifespan(Number(settings.printer_lifespan_hours));
    if (settings.spool_cost_per_kg) setSimSpoolCost(Number(settings.spool_cost_per_kg));
    if (settings.avg_print_speed_g_per_hr) setSimSpeed(Number(settings.avg_print_speed_g_per_hr));
    if (materialRates?.pla?.selling_rate) setSimSellingRate(Number(materialRates.pla.selling_rate));
  }, [settings.printer_cost, settings.printer_lifespan_hours, settings.spool_cost_per_kg, settings.avg_print_speed_g_per_hr, materialRates?.pla?.selling_rate]);

  // Sync settings with Supabase if table exists
  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    async function loadRemoteSettings() {
      try {
        const { data: sData } = await supabase.from('pricing_settings').select('*').limit(1).maybeSingle();
        if (isMounted && sData) {
          setSettings(prev => ({ ...prev, ...sData }));
          localStorage.setItem('etba3ly_pricing_settings', JSON.stringify(sData));
        }

        const { data: mData } = await supabase.from('material_rates').select('*');
        if (isMounted && mData && mData.length > 0) {
          const mapped = {};
          mData.forEach(m => {
            mapped[m.material_key] = {
              name: m.display_name,
              selling_rate: Number(m.selling_rate_per_gram),
              cost: Number(m.cost_per_gram)
            };
          });
          setMaterialRates(prev => ({ ...prev, ...mapped }));
          localStorage.setItem('etba3ly_material_rates', JSON.stringify(mapped));
        }
      } catch (err) {
        console.warn('Could not load remote pricing settings, using local cache:', err);
      }
    }

    loadRemoteSettings();
    return () => { isMounted = false; };
  }, [supabase]);

  // Save Settings handler
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem('etba3ly_pricing_settings', JSON.stringify(settings));
      localStorage.setItem('etba3ly_material_rates', JSON.stringify(materialRates));

      if (supabase) {
        await supabase.from('pricing_settings').upsert({
          id: 'default',
          ...settings,
          updated_at: new Date().toISOString()
        });
      }

      addToast('Financial parameters saved successfully', 'success');
    } catch (err) {
      console.error('Error saving pricing settings:', err);
      addToast('Saved to local storage (Database update pending)', 'info');
    } finally {
      setSaving(false);
    }
  };

  // Aggregated P&L and Accounting Calculations
  const analytics = useMemo(() => {
    let completedRevenue = 0;
    let pipelineRevenue = 0;
    let totalDirectCosts = 0;
    let rawFilamentCost = 0;
    let electricityCost = 0;
    let maintenanceCost = 0;
    let depreciationCost = 0;
    let failedReserveCost = 0;
    let referralCommissions = 0;
    let totalPackagingCost = 0;
    let totalPrintHours = 0;
    let totalFilamentGrams = 0;
    let totalDepositsReceived = 0;
    let totalRemainingBalance = 0;

    const auditedOrders = orders.map(o => {
      const isCompleted = o.status === 'completed' || o.status === 'done';
      const weight = Number(o.weightgrams) || Number(o.weight_grams) || 0;
      const hours = Number(o.printhours) || Number(o.estimated_hours) || (weight > 0 ? (weight / 35) : 0);
      const deliveryMode = o.delivery_mode || o.deliverymode || 'pickup';
      const referralCode = o.referral_code || o.referral;

      // Re-evaluate through core pricing engine
      const quote = calculateOrderQuote({
        items: [{ weightGrams: weight, printHours: hours, materialKey: o.material || 'pla' }],
        deliveryMode,
        customSettings: settings,
        customMaterials: materialRates,
        referralCode
      });

      const orderTotal = Number(o.totalprice) || quote.customerTotal;
      const depositRequired = quote.depositRequired;
      const depositPaid = Number(o.deposit_paid) || (isCompleted ? depositRequired : 0);
      const remainingBalance = Math.max(0, orderTotal - depositPaid);

      if (isCompleted) {
        completedRevenue += orderTotal;
        totalDirectCosts += quote.costs.totalDirectCosts;
        rawFilamentCost += quote.costs.rawMaterialCost;
        electricityCost += quote.costs.electricityCost;
        maintenanceCost += quote.costs.maintenanceCost;
        depreciationCost += quote.costs.depreciationCost;
        failedReserveCost += quote.costs.failedPrintReserve;
        referralCommissions += quote.profitability.referralCommission;
        totalPackagingCost += quote.costs.actualPackagingCost;
        totalPrintHours += hours;
        totalFilamentGrams += weight;
        totalDepositsReceived += depositPaid;
      } else if (o.status !== 'cancelled' && o.status !== 'rejected') {
        pipelineRevenue += orderTotal;
        totalDepositsReceived += depositPaid;
        totalRemainingBalance += remainingBalance;
      }

      return {
        ...o,
        computedQuote: quote,
        orderTotal,
        depositPaid,
        remainingBalance
      };
    });

    const netRealizedProfit = completedRevenue - totalDirectCosts - referralCommissions;
    const profitMargin = completedRevenue > 0 ? (netRealizedProfit / completedRevenue) * 100 : 0;
    const contributionPerHour = totalPrintHours > 0 ? netRealizedProfit / totalPrintHours : 0;

    const partnerSplits = calculatePartnerDistributions(netRealizedProfit, settings);

    const breakEven = calculateBreakEvenMetrics({
      printerCost: Number(settings.printer_cost) || 40000,
      lifespanHours: Number(settings.printer_lifespan_hours) || 2000,
      sellingRatePerGram: Number(materialRates?.pla?.selling_rate) || 3.00,
      spoolCostPerKg: Number(settings.spool_cost_per_kg) || 660,
      rawCostPerGram: Number(materialRates?.pla?.cost) || 0.66,
      avgSpeedGramsPerHour: Number(settings.avg_print_speed_g_per_hr) || 30,
      completedGrams: totalFilamentGrams,
      completedHours: totalPrintHours
    });

    return {
      completedRevenue,
      pipelineRevenue,
      totalDirectCosts,
      rawFilamentCost,
      electricityCost,
      maintenanceCost,
      depreciationCost,
      failedReserveCost,
      referralCommissions,
      totalPackagingCost,
      totalPrintHours,
      totalFilamentGrams,
      totalDepositsReceived,
      totalRemainingBalance,
      netRealizedProfit,
      profitMargin,
      contributionPerHour,
      partnerSplits,
      breakEven,
      auditedOrders
    };
  }, [orders, settings, materialRates]);

  // Live Scenario Simulator Calculations
  const simBreakEven = useMemo(() => {
    return calculateBreakEvenMetrics({
      printerCost: simPrinterCost,
      lifespanHours: simLifespan,
      sellingRatePerGram: simSellingRate,
      spoolCostPerKg: simSpoolCost,
      avgSpeedGramsPerHour: simSpeed,
      completedGrams: analytics.totalFilamentGrams,
      completedHours: analytics.totalPrintHours
    });
  }, [simPrinterCost, simLifespan, simSellingRate, simSpoolCost, simSpeed, analytics.totalFilamentGrams, analytics.totalPrintHours]);

  const handleAdoptSimulated = () => {
    const rawCost = Math.round((simSpoolCost / 1000) * 100) / 100;
    const depRate = simLifespan > 0 ? Math.round((simPrinterCost / simLifespan) * 100) / 100 : settings.depreciation_hourly_rate;
    setSettings(prev => ({
      ...prev,
      printer_cost: simPrinterCost,
      printer_lifespan_hours: simLifespan,
      spool_cost_per_kg: simSpoolCost,
      avg_print_speed_g_per_hr: simSpeed,
      depreciation_hourly_rate: depRate
    }));
    setMaterialRates(prev => ({
      ...prev,
      pla: {
        ...(prev.pla || DEFAULT_MATERIAL_RATES.pla),
        selling_rate: simSellingRate,
        cost: rawCost
      }
    }));
    addToast('Simulated parameters adopted into active settings. Click Save in Financial Parameters to persist.', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-in">
      {/* Top Navigation Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(16px)',
        padding: '16px 20px',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Financial Systems & Profitability
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Realized cashflow, cost accounting, two-partner distributions, and dynamic pricing controls.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'pl', label: 'Profit & Loss' },
            { id: 'breakeven', label: 'Break-Even & ROI' },
            { id: 'partners', label: 'Partner Distributions' },
            { id: 'settings', label: 'Financial Parameters' },
            { id: 'orders', label: 'Audit & Deposits' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: activeTab === tab.id ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeTab === tab.id ? 'var(--accent)' : 'rgba(255, 255, 255, 0.03)',
                color: activeTab === tab.id ? '#000000' : 'var(--text-secondary)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: P&L AND PROFITABILITY */}
      {activeTab === 'pl' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Machine Payoff & Break-Even Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 128, 0, 0.08) 0%, rgba(15, 23, 42, 0.75) 100%)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 128, 0, 0.25)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent)'
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Machine Investment & Break-Even Status
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                  Elegoo Centauri Carbon (CC1) Payoff Tracker
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Selling at {analytics.breakEven.sellingRatePerGram.toFixed(2)} EGP/g with {analytics.breakEven.rawCostPerGram.toFixed(2)} EGP/g raw filament cost yields {analytics.breakEven.grossProfitPerGram.toFixed(2)} EGP/g profit. Full break-even target: {analytics.breakEven.breakEvenGrams.toLocaleString()} grams (~{analytics.breakEven.hoursToBreakEven} hrs at 30 g/hr).
                </div>
              </div>

              <button
                onClick={() => setActiveTab('breakeven')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(255, 128, 0, 0.15)',
                  border: '1px solid rgba(255, 128, 0, 0.35)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Open Break-Even Model
              </button>
            </div>

            {/* Extrusion Progress Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Extrusion Payoff Progress: <strong style={{ color: 'var(--text-primary)' }}>{analytics.breakEven.completedGrams.toFixed(0)} / {analytics.breakEven.breakEvenGrams.toLocaleString()} grams</strong> ({analytics.breakEven.breakEvenKg} kg target)
                </span>
                <strong style={{ color: 'var(--accent)' }}>{analytics.breakEven.progressGramsPct}%</strong>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${analytics.breakEven.progressGramsPct}%`,
                  background: 'linear-gradient(90deg, #ff8000, #ffaa00)',
                  borderRadius: 4,
                  transition: 'width 0.4s ease'
                }} />
              </div>
            </div>

            {/* 4 Mini Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Gross Profit / Gram</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{analytics.breakEven.grossProfitPerGram.toFixed(2)} EGP/g</div>
                <div style={{ fontSize: 11, color: 'var(--status-done)', marginTop: 1 }}>78.0% margin over 0.66 EGP cost</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Capital Recovered</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{analytics.breakEven.capitalRecovered.toFixed(0)} / {analytics.breakEven.printerCost.toLocaleString()} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{analytics.breakEven.capitalRemaining.toFixed(0)} EGP remaining</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Hours to Payoff</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{analytics.breakEven.completedHours.toFixed(1)} / ~{analytics.breakEven.hoursToBreakEven} hrs</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>At 30 g/hr CoreXY print speed</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Pure Profit Runway</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--status-done)', marginTop: 2 }}>{analytics.breakEven.pureProfitRunwayHours} Hours</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>100% net profit post-payoff</div>
              </div>
            </div>
          </div>

          {/* Top KPI Cards */}
          <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Realized Net Profit
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', margin: '6px 0' }}>
                {analytics.netRealizedProfit.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--status-done)', fontWeight: 600 }}>
                Margin: {analytics.profitMargin.toFixed(1)}% | {analytics.contributionPerHour.toFixed(1)} EGP/hr
              </div>
            </div>

            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Total Revenue Recognized
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: '6px 0' }}>
                {analytics.completedRevenue.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                + {analytics.pipelineRevenue.toFixed(2)} EGP active in pipeline
              </div>
            </div>

            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Direct Manufacturing Costs
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#f59e0b', margin: '6px 0' }}>
                {analytics.totalDirectCosts.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Filament, wear, depreciation, reserve
              </div>
            </div>

            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.65)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ElectraGo Referral Owed
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#ec4899', margin: '6px 0' }}>
                {analytics.referralCommissions.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Strictly on manufacturing subtotal
              </div>
            </div>
          </div>

          {/* Detailed Cost Accounting Breakdown */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: 24
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Comprehensive Cost & Expense Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Raw Plastic Consumed ({analytics.breakEven.rawCostPerGram.toFixed(2)} EGP/g)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.rawFilamentCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{analytics.totalFilamentGrams.toFixed(0)} grams extruded across orders</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Machine Maintenance & Wear ({Number(settings.maintenance_hourly_rate || 3.50).toFixed(2)} EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.maintenanceCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Centauri Carbon PEI bed, belts, nozzle wear</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Printer Depreciation ({Number(settings.depreciation_hourly_rate || 20.00).toFixed(2)} EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.depreciationCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Machine replacement allocation ({Number(settings.printer_cost || 40000).toLocaleString()} EGP / {settings.printer_lifespan_hours || 2000}h)</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Failed-Print Reserve ({((Number(settings.failed_print_reserve_pct) ?? 0.12) * 100).toFixed(0)}%)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.failedReserveCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Material buffer for supports, skirts, and test prints</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Electricity Cost ({Number(settings.electricity_hourly_rate || 0.40).toFixed(2)} EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.electricityCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>200W draw = 400 kWh over 2,000h lifespan</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Packaging Supplies Cost</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.totalPackagingCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Boxes, bubble wrap, labels for shipped parcels</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BREAK-EVEN & MACHINE ROI */}
      {activeTab === 'breakeven' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 128, 0, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 128, 0, 0.3)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 10px var(--accent)'
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Elegoo Centauri Carbon (CC1) Unit Economics
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', marginTop: 6, letterSpacing: '-0.02em' }}>
                  Machine Payoff & Break-Even System
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 780, lineHeight: 1.5 }}>
                  Mathematical break-even analysis for your Elegoo Centauri Carbon. At a selling price of 3.00 EGP per gram and 0.66 EGP raw filament cost, the printer pays for itself in ~570 hours at 30 g/hr CoreXY print speed, well before hitting its 2,000-hour design lifespan.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  Edit Parameters
                </button>
              </div>
            </div>

            {/* Visual Payoff Progress Section */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Extrusion Volume Payoff Progress
                  </span>
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: 'var(--accent)' }}>{analytics.breakEven.completedGrams.toFixed(0)}</strong>
                    <span style={{ color: 'var(--text-tertiary)' }}> / {analytics.breakEven.breakEvenGrams.toLocaleString()} grams ({analytics.breakEven.progressGramsPct}%)</span>
                  </div>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${analytics.breakEven.progressGramsPct}%`,
                    background: 'linear-gradient(90deg, #ff8000, #ffaa00)',
                    borderRadius: 5,
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Capital Recovery Progress
                  </span>
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: 'var(--status-done)' }}>{analytics.breakEven.capitalRecovered.toLocaleString()} EGP</strong>
                    <span style={{ color: 'var(--text-tertiary)' }}> / {analytics.breakEven.printerCost.toLocaleString()} EGP</span>
                  </div>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${analytics.breakEven.progressGramsPct}%`,
                    background: 'linear-gradient(90deg, #10b981, #34d399)',
                    borderRadius: 5,
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                paddingTop: 12
              }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Grams Remaining:</span>{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{analytics.breakEven.gramsRemaining.toLocaleString()} g</strong>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Capital Remaining:</span>{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{analytics.breakEven.capitalRemaining.toLocaleString()} EGP</strong>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Required Extrusion Speed:</span>{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{analytics.breakEven.requiredSpeedGramsPerHour} g/hr</strong>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Runway After Payoff:</span>{' '}
                  <strong style={{ color: 'var(--status-done)' }}>{analytics.breakEven.pureProfitRunwayHours} Hours Pure Profit</strong>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Core Pillars Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16
          }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                1. Material Cost Base
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0' }}>
                {analytics.breakEven.rawCostPerGram.toFixed(2)} EGP<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 500 }}> / gram</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Based on <strong>{analytics.breakEven.spoolCostPerKg} EGP</strong> per 1,000g spool. Usable material cost is <strong>~{analytics.breakEven.effectiveUsableCostPerGram.toFixed(2)} EGP/g</strong> factoring in support structures and test prints.
              </div>
            </div>

            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                2. Unit Gross Profit
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent)', margin: '8px 0' }}>
                {analytics.breakEven.grossProfitPerGram.toFixed(2)} EGP<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 500 }}> / gram</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Selling price of <strong>{analytics.breakEven.sellingRatePerGram.toFixed(2)} EGP</strong> minus {analytics.breakEven.rawCostPerGram.toFixed(2)} EGP cost gives an exceptional <strong>78.0% gross margin</strong> on standard PLA prints.
              </div>
            </div>

            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                3. Break-Even Volume
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0' }}>
                {analytics.breakEven.breakEvenGrams.toLocaleString()} g<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 500 }}> (~{analytics.breakEven.breakEvenKg} kg)</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>{analytics.breakEven.printerCost.toLocaleString()} EGP printer cost / {analytics.breakEven.grossProfitPerGram.toFixed(2)} EGP profit</strong> = 17,094 grams. That is approximately 17 full 1kg spools of filament to fully amortize the machine.
              </div>
            </div>

            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                4. Payoff Duration & Speed
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--status-done)', margin: '8px 0' }}>
                ~{analytics.breakEven.hoursToBreakEven} Hours<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 500 }}> @ {analytics.breakEven.avgSpeedGramsPerHour} g/hr</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                The printer needs to extrude just <strong>{analytics.breakEven.requiredSpeedGramsPerHour} g/hr</strong> over {analytics.breakEven.lifespanHours}h. Because CoreXY machines average 25-45 g/hr, you pay it off in ~570 hours, leaving <strong>{analytics.breakEven.pureProfitRunwayHours} hours</strong> as pure profit.
              </div>
            </div>
          </div>

          {/* Operational Cost Buffers (Hidden Realities) */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                Real-World Hidden Costs & Reserve Accounting
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                While 3.00 EGP/g provides ample margins to break even, your system actively accounts for these operational realities:
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Waste & Failed Prints ({((Number(settings.failed_print_reserve_pct) ?? 0.12) * 100).toFixed(0)}% Buffer)
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Typically, 10-15% of filament goes to supports, skirts, purge towers, and bed adhesion failures. Our cost engine automatically incorporates a 12% reserve, lifting the effective usable material cost from 0.66 EGP to ~0.76 EGP per usable gram.
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Electricity Cost ({Number(settings.electricity_hourly_rate || 0.40).toFixed(2)} EGP/hr)
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  A CoreXY machine drawing ~200W on average consumes 400 kWh over a 2,000-hour operational cycle. In Egypt, this adds approximately 800 EGP total over the machine lifespan, represented as 0.40 EGP per print hour.
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Maintenance & Hardware Wear ({Number(settings.maintenance_hourly_rate || 3.50).toFixed(2)} EGP/hr)
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Covers periodic replacement of 0.4mm brass/hardened nozzles, PTFE tubing, textured PEI spring steel build plates, and belt tensioning over the 2,000-hour service window.
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Capital Depreciation ({Number(settings.depreciation_hourly_rate || 20.00).toFixed(2)} EGP/hr)
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Amortizes the 40,000 EGP purchase cost across 2,000 printing hours (40,000 / 2,000 = 20.00 EGP/hr). This capital is set aside in your financial models to fund printer replacement.
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Sensitivity & Scenario Calculator */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                Interactive Break-Even & Pricing Simulator
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Test different printer costs, spool prices, selling rates, and print speeds in real-time, then apply them to your active pricing configuration.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Printer Cost (EGP): {simPrinterCost.toLocaleString()}
                </label>
                <input
                  type="range"
                  min="20000"
                  max="70000"
                  step="1000"
                  value={simPrinterCost}
                  onChange={e => setSimPrinterCost(parseFloat(e.target.value) || 40000)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Operational Lifespan (Hours): {simLifespan}
                </label>
                <input
                  type="range"
                  min="1000"
                  max="4000"
                  step="100"
                  value={simLifespan}
                  onChange={e => setSimLifespan(parseFloat(e.target.value) || 2000)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Filament Spool Cost (EGP / kg): {simSpoolCost}
                </label>
                <input
                  type="range"
                  min="400"
                  max="1200"
                  step="20"
                  value={simSpoolCost}
                  onChange={e => setSimSpoolCost(parseFloat(e.target.value) || 660)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Selling Rate (EGP / g): {simSellingRate.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="1.50"
                  max="6.00"
                  step="0.10"
                  value={simSellingRate}
                  onChange={e => setSimSellingRate(parseFloat(e.target.value) || 3.00)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Average Print Speed (g / hr): {simSpeed}
                </label>
                <input
                  type="range"
                  min="15"
                  max="55"
                  step="5"
                  value={simSpeed}
                  onChange={e => setSimSpeed(parseFloat(e.target.value) || 30)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
            </div>

            {/* Simulation Results Box */}
            <div style={{
              background: 'rgba(255, 128, 0, 0.05)',
              border: '1px solid rgba(255, 128, 0, 0.25)',
              borderRadius: 12,
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Simulated Gross Margin</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
                  {simBreakEven.grossProfitPerGram.toFixed(2)} EGP/g
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Cost: {simBreakEven.rawCostPerGram.toFixed(2)} EGP/g
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Break-Even Volume</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {simBreakEven.breakEvenGrams.toLocaleString()} g
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  ~{simBreakEven.breakEvenKg} kg of filament
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Time to Payoff</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--status-done)', marginTop: 2 }}>
                  ~{simBreakEven.hoursToBreakEven} Hours
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  @ {simSpeed} g/hr print speed
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Depreciation Rate</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {(simPrinterCost / simLifespan).toFixed(2)} EGP/hr
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Min speed: {simBreakEven.requiredSpeedGramsPerHour} g/hr
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={handleAdoptSimulated}
                className="btn btn-primary"
                style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600 }}
              >
                Adopt Simulated Parameters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TWO-PARTNER PROFIT SHARING */}
      {activeTab === 'partners' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 24
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              Two-Partner Realized Profit Allocation
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Profit distributions are calculated exclusively from realized net earnings after all direct costs and provisions.
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20
          }}>
            {/* Distributable Pool Card */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.05)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--status-done)', textTransform: 'uppercase' }}>
                Distributable Partner Pool ({analytics.partnerSplits.distributionPoolPct}%)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0' }}>
                {analytics.partnerSplits.totalDistributionPool.toFixed(2)} EGP
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 12, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Partner A ({analytics.partnerSplits.partnerA.ownershipPct}%):</span>
                  <strong style={{ color: 'var(--accent)' }}>{analytics.partnerSplits.partnerA.payout.toFixed(2)} EGP</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Partner B ({analytics.partnerSplits.partnerB.ownershipPct}%):</span>
                  <strong style={{ color: 'var(--accent)' }}>{analytics.partnerSplits.partnerB.payout.toFixed(2)} EGP</strong>
                </div>
              </div>
            </div>

            {/* Business Growth Fund */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' }}>
                Business Growth & Expansion ({analytics.partnerSplits.growthPoolPct}%)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0' }}>
                {analytics.partnerSplits.growthFund.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Reserved for additional 3D printer hardware, upgraded nozzles, and filament inventory restocking.
              </div>
            </div>

            {/* Cash Reserves */}
            <div style={{
              background: 'rgba(234, 179, 8, 0.05)',
              border: '1px solid rgba(234, 179, 8, 0.2)',
              borderRadius: 14,
              padding: 20
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', textTransform: 'uppercase' }}>
                Emergency Cash Reserves ({analytics.partnerSplits.reservePoolPct}%)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0' }}>
                {analytics.partnerSplits.cashReserves.toFixed(2)} EGP
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Buffer retained against courier delivery delays, unexpected hardware failures, and refunds.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FINANCIAL PARAMETERS CONFIGURATION */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 24
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              Pricing & Financial Configuration
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Changes apply instantly to quotes and recalculate order profitability without hardcoded variables.
            </div>
          </div>

          {/* Machine Capital & Operational Parameters */}
          <div style={{
            background: 'rgba(255, 128, 0, 0.05)',
            border: '1px solid rgba(255, 128, 0, 0.2)',
            borderRadius: 12,
            padding: 16
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Machine Capital & Extrusion Economics
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Elegoo Centauri Carbon (CC1) unit cost and filament parameters. Updating values here automatically syncs depreciation and break-even targets.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Printer Cost (EGP)
                </label>
                <input
                  type="number"
                  step="500"
                  value={settings.printer_cost || 40000}
                  onChange={e => {
                    const costVal = parseFloat(e.target.value) || 0;
                    const lifeVal = settings.printer_lifespan_hours || 2000;
                    setSettings({
                      ...settings,
                      printer_cost: costVal,
                      depreciation_hourly_rate: lifeVal > 0 ? Math.round((costVal / lifeVal) * 100) / 100 : settings.depreciation_hourly_rate
                    });
                  }}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Lifespan (Hours)
                </label>
                <input
                  type="number"
                  step="100"
                  value={settings.printer_lifespan_hours || 2000}
                  onChange={e => {
                    const lifeVal = parseFloat(e.target.value) || 0;
                    const costVal = settings.printer_cost || 40000;
                    setSettings({
                      ...settings,
                      printer_lifespan_hours: lifeVal,
                      depreciation_hourly_rate: lifeVal > 0 ? Math.round((costVal / lifeVal) * 100) / 100 : settings.depreciation_hourly_rate
                    });
                  }}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Spool Cost (EGP / kg)
                </label>
                <input
                  type="number"
                  step="10"
                  value={settings.spool_cost_per_kg || 660}
                  onChange={e => {
                    const spoolVal = parseFloat(e.target.value) || 0;
                    const rawCost = Math.round((spoolVal / 1000) * 100) / 100;
                    setSettings({ ...settings, spool_cost_per_kg: spoolVal });
                    if (materialRates.pla) {
                      setMaterialRates(prev => ({
                        ...prev,
                        pla: { ...prev.pla, cost: rawCost }
                      }));
                    }
                  }}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  CoreXY Avg Speed (g/hr)
                </label>
                <input
                  type="number"
                  step="1"
                  value={settings.avg_print_speed_g_per_hr || 30}
                  onChange={e => setSettings({ ...settings, avg_print_speed_g_per_hr: parseFloat(e.target.value) || 30 })}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Micro-Order Threshold (Grams)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.micro_order_weight_threshold || 17}
                  onChange={e => setSettings({ ...settings, micro_order_weight_threshold: parseFloat(e.target.value) || 17 })}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Micro-Order Flat Price (EGP)
                </label>
                <input
                  type="number"
                  step="5"
                  value={settings.micro_order_flat_price || 50}
                  onChange={e => setSettings({ ...settings, micro_order_flat_price: parseFloat(e.target.value) || 50 })}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Setup Fee (EGP)
              </label>
              <input
                type="number"
                step="1"
                value={settings.setup_fee}
                onChange={e => setSettings({ ...settings, setup_fee: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Printing Hourly Rate (EGP/hr)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.printing_hourly_rate}
                onChange={e => setSettings({ ...settings, printing_hourly_rate: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Campus Pickup Minimum (EGP)
              </label>
              <input
                type="number"
                step="5"
                value={settings.pickup_minimum}
                onChange={e => setSettings({ ...settings, pickup_minimum: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Shipping Minimum (EGP)
              </label>
              <input
                type="number"
                step="5"
                value={settings.shipping_minimum}
                onChange={e => setSettings({ ...settings, shipping_minimum: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Packaging Fee (Customer EGP)
              </label>
              <input
                type="number"
                step="1"
                value={settings.packaging_fee}
                onChange={e => setSettings({ ...settings, packaging_fee: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Actual Packaging Cost (EGP)
              </label>
              <input
                type="number"
                step="1"
                value={settings.actual_packaging_cost}
                onChange={e => setSettings({ ...settings, actual_packaging_cost: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Electricity Cost (EGP/hr)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.electricity_hourly_rate}
                onChange={e => setSettings({ ...settings, electricity_hourly_rate: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Maintenance Wear (EGP/hr)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.maintenance_hourly_rate}
                onChange={e => setSettings({ ...settings, maintenance_hourly_rate: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Depreciation Allowance (EGP/hr)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.depreciation_hourly_rate}
                onChange={e => setSettings({ ...settings, depreciation_hourly_rate: parseFloat(e.target.value) || 0 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Failed-Print Reserve (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={settings.failed_print_reserve_pct * 100}
                onChange={e => setSettings({ ...settings, failed_print_reserve_pct: (parseFloat(e.target.value) || 0) / 100 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                ElectraGo Referral Commission (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.referral_commission_pct * 100}
                onChange={e => setSettings({ ...settings, referral_commission_pct: (parseFloat(e.target.value) || 0) / 100 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
                Required Deposit (%)
              </label>
              <input
                type="number"
                step="5"
                value={settings.deposit_percentage * 100}
                onChange={e => setSettings({ ...settings, deposit_percentage: (parseFloat(e.target.value) || 0) / 100 })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Material Rates Table */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Material Selling Rates & Purchase Costs
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '8px 12px' }}>Material</th>
                    <th style={{ padding: '8px 12px' }}>Selling Rate (EGP/g)</th>
                    <th style={{ padding: '8px 12px' }}>Raw Cost (EGP/g)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(materialRates).map(([key, data]) => (
                    <tr key={key} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{data.name}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number"
                          step="0.05"
                          value={data.selling_rate}
                          onChange={e => setMaterialRates({
                            ...materialRates,
                            [key]: { ...data, selling_rate: parseFloat(e.target.value) || 0 }
                          })}
                          className="input-field"
                          style={{ width: 120 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number"
                          step="0.05"
                          value={data.cost}
                          onChange={e => setMaterialRates({
                            ...materialRates,
                            [key]: { ...data, cost: parseFloat(e.target.value) || 0 }
                          })}
                          className="input-field"
                          style={{ width: 120 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ minWidth: 200 }}
            >
              {saving ? 'Saving Parameters...' : 'Save Financial Parameters'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: ORDERS AUDIT & DEPOSITS */}
      {activeTab === 'orders' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Order Cashflow & Margin Audit
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Real-time reconciliation of deposits, remaining balances, and line-item manufacturing contributions.
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Total Audited: {analytics.auditedOrders.length} orders
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '10px 8px' }}>Order ID</th>
                  <th style={{ padding: '10px 8px' }}>Customer</th>
                  <th style={{ padding: '10px 8px' }}>Grams / Material</th>
                  <th style={{ padding: '10px 8px' }}>Total Price</th>
                  <th style={{ padding: '10px 8px' }}>Deposit Req / Paid</th>
                  <th style={{ padding: '10px 8px' }}>Remaining</th>
                  <th style={{ padding: '10px 8px' }}>Direct Costs</th>
                  <th style={{ padding: '10px 8px' }}>Net Contribution</th>
                </tr>
              </thead>
              <tbody>
                {analytics.auditedOrders.slice(0, 30).map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      #{String(o.id).slice(0, 8)}
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{o.name || o.customer_name || 'Guest'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {o.weightgrams || o.weight_grams || 0}g ({o.material || 'PLA'})
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                      {Number(o.orderTotal).toFixed(2)} EGP
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {o.computedQuote.depositRequired} / <span style={{ color: 'var(--status-done)', fontWeight: 600 }}>{o.depositPaid.toFixed(2)} EGP</span>
                    </td>
                    <td style={{ padding: '10px 8px', color: o.remainingBalance > 0 ? '#ff453a' : 'var(--text-tertiary)', fontWeight: 600 }}>
                      {o.remainingBalance.toFixed(2)} EGP
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-tertiary)' }}>
                      {o.computedQuote.costs.totalDirectCosts.toFixed(2)} EGP
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--accent)', fontWeight: 700 }}>
                      {o.computedQuote.profitability.orderContribution.toFixed(2)} EGP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
