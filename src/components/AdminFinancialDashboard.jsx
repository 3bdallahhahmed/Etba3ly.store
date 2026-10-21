import React, { useState, useEffect, useMemo } from 'react';
import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  DEFAULT_SHIPPING_ZONES,
  calculateOrderQuote,
  calculatePartnerDistributions,
  normalizeMaterialKey
} from '../utils/pricingEngine';

export default function AdminFinancialDashboard({
  orders = [],
  supabase,
  addToast = () => {}
}) {
  const [activeTab, setActiveTab] = useState('pl'); // 'pl' | 'partners' | 'settings' | 'orders'
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
      auditedOrders
    };
  }, [orders, settings, materialRates]);

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

        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'pl', label: 'Profit & Loss' },
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
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Raw Plastic Consumed</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.rawFilamentCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{analytics.totalFilamentGrams.toFixed(0)} grams extruded</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Machine Maintenance & Wear (5 EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.maintenanceCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Centauri Carbon PEI bed, belts, nozzle wear</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Printer Depreciation (4.50 EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.depreciationCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Machine replacement capital allocation</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Failed-Print Reserve (8%)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.failedReserveCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Material buffer for warping/power interruptions</div>
              </div>

              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Electricity Cost (Default 0 EGP/hr)</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{analytics.electricityCost.toFixed(2)} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>University Dormitory zero-burden rate</div>
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

      {/* TAB 2: TWO-PARTNER PROFIT SHARING */}
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
