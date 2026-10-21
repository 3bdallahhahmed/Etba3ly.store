import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  DEFAULT_SHIPPING_ZONES,
  calculateOrderQuote,
  calculatePartnerDistributions,
  normalizeMaterialKey
} from '../utils/pricingEngine';
import GalleryStudioUploader from '../utils/GalleryStudioUploader';

// Printer helper functions
function getPrinterFromNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/^\[PRINTER:([^\]]+)\]/);
  return match ? match[1] : null;
}

function setPrinterInNotes(notes, printer) {
  const cleanNotes = (notes || "").replace(/^\[PRINTER:[^\]]+\]\s*/, "");
  if (!printer) return cleanNotes;
  return `[PRINTER:${printer}] ${cleanNotes}`.trim();
}

function getCleanNotes(notes) {
  return (notes || "").replace(/^\[PRINTER:[^\]]+\]\s*/, "").trim();
}

export default function AdminDashboard({
  orders = [],
  setOrders = () => {},
  config = {},
  setConfig = () => {},
  supabase,
  PRINTERS = ["CC Abdalla", "CC Mazen"],
  darkMode = true,
  fetchOrders = () => {},
  fetchConfig = () => {},
  handleAdminLogout = () => {},
  addToast = () => {},
  exportCSV = () => {},
  galleryItems = [],
  newGalleryItem = { title: "", description: "" },
  setNewGalleryItem = () => {},
  newGalleryFiles = [],
  setNewGalleryFiles = () => {},
  galleryUploading = false,
  galleryProcessing = false,
  setGalleryProcessing = () => {},
  handleAddGalleryItem = () => {},
  handleDeleteGalleryItem = () => {},
  handleTestTelegram = () => {},
  isTestingTelegram = false,
  handleTestDiscord = () => {},
  isTestingDiscord = false,
  handleTestEmail = () => {},
  isTestingEmail = false
}) {
  // Navigation: 'orders' | 'fleet' | 'partners' | 'settings' | 'gallery'
  const [activeNav, setActiveNav] = useState('orders');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'queued' | 'printing' | 'done' | 'cancelled'
  const [printerFilter, setPrinterFilter] = useState('all'); // 'all' | 'CC Abdalla' | 'CC Mazen'

  // Settings State
  const [pricingSettings, setPricingSettings] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_pricing_settings');
      if (cached) return { ...DEFAULT_PRICING_SETTINGS, ...JSON.parse(cached) };
    } catch {}
    return { ...DEFAULT_PRICING_SETTINGS };
  });

  const [materials, setMaterials] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_material_rates');
      if (cached) return { ...DEFAULT_MATERIAL_RATES, ...JSON.parse(cached) };
    } catch {}
    return { ...DEFAULT_MATERIAL_RATES };
  });

  const [savingSettings, setSavingSettings] = useState(false);

  // Quick Add Order Modal
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickOrder, setQuickOrder] = useState({
    name: '',
    phone: '',
    orderName: '',
    weightGrams: 30,
    printHours: 1.5,
    material: 'pla',
    printer: 'CC Abdalla',
    customPrice: '',
    deliveryMode: 'pickup'
  });

  // Edit Order Price/Details Modal
  const [editingOrder, setEditingOrder] = useState(null);

  // Load Remote Settings from Supabase
  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    async function loadRemote() {
      try {
        const { data: sData } = await supabase.from('pricing_settings').select('*').limit(1).maybeSingle();
        if (isMounted && sData) {
          setPricingSettings(prev => ({ ...prev, ...sData }));
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
          setMaterials(prev => ({ ...prev, ...mapped }));
          localStorage.setItem('etba3ly_material_rates', JSON.stringify(mapped));
        }
      } catch (e) {
        console.warn('Could not sync remote pricing settings:', e);
      }
    }
    loadRemote();
    return () => { isMounted = false; };
  }, [supabase]);

  // Save Pricing & Financial Settings
  const handleSaveFinancials = async (e) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      localStorage.setItem('etba3ly_pricing_settings', JSON.stringify(pricingSettings));
      localStorage.setItem('etba3ly_material_rates', JSON.stringify(materials));

      if (supabase) {
        await supabase.from('pricing_settings').upsert({
          id: 'default',
          ...pricingSettings,
          updated_at: new Date().toISOString()
        });
      }
      addToast('Pricing parameters saved. Historical approved orders preserved.', 'success');
    } catch (err) {
      console.error('Error saving pricing:', err);
      addToast('Saved locally in browser', 'info');
    } finally {
      setSavingSettings(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Order Actions & Database Sync
  // ─────────────────────────────────────────────────────────────

  // Update order status with instant optimistic update + Supabase write
  const handleUpdateStatus = async (orderId, newStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    try {
      if (supabase) {
        const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;
      }
      addToast(`Order #${String(orderId).slice(0, 8)} updated to ${newStatus}`, 'info');
    } catch (err) {
      console.error('Status update failed:', err);
      addToast('Failed to update status on server', 'error');
      fetchOrders();
    }
  };

  // Assign Printer (CC Abdalla vs CC Mazen)
  const handleAssignPrinter = async (orderId, printerName) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;
    const updatedNotes = setPrinterInNotes(targetOrder.notes, printerName);

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: updatedNotes } : o));
    try {
      if (supabase) {
        const { error } = await supabase.from('orders').update({ notes: updatedNotes }).eq('id', orderId);
        if (error) throw error;
      }
      addToast(`Assigned to ${printerName}`, 'success');
    } catch (err) {
      console.error('Printer assignment failed:', err);
      addToast('Failed to save printer assignment', 'error');
      fetchOrders();
    }
  };

  // Recalculate price for an order using current rates
  const handleRecalculateOrderPrice = async (order) => {
    const w = Number(order.weightgrams) || 0;
    const h = Number(order.printhours) || (w > 0 ? (w / 35) : 0.2);
    const mode = order.delivery_mode || 'pickup';
    const quote = calculateOrderQuote({
      items: [{ weightGrams: w, printHours: h, materialKey: order.material || 'pla' }],
      deliveryMode: mode,
      customSettings: pricingSettings,
      customMaterials: materials
    });

    const newPrice = quote.customerTotal;
    const newDeposit = quote.depositRequired;
    const newRemaining = quote.remainingBalance;

    setOrders(prev => prev.map(o => o.id === order.id ? {
      ...o,
      totalprice: newPrice,
      deposit_required: newDeposit,
      remaining_balance: newRemaining,
      price_locked: true
    } : o));

    try {
      if (supabase) {
        await supabase.from('orders').update({
          totalprice: newPrice,
          deposit_required: newDeposit,
          remaining_balance: newRemaining
        }).eq('id', order.id);
      }
      addToast(`Order price updated to ${newPrice.toFixed(2)} EGP`, 'success');
    } catch (err) {
      console.error('Failed to recalculate order price:', err);
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`Are you sure you want to permanently delete order #${String(orderId).slice(0, 8)}?`)) return;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, _deleting: true } : o));
    try {
      if (supabase) {
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
      }
      setOrders(prev => prev.filter(o => o.id !== orderId));
      addToast('Order deleted successfully', 'info');
    } catch (err) {
      console.error('Failed to delete order:', err);
      addToast('Error deleting order', 'error');
      fetchOrders();
    }
  };

  // Quick Add Order Handler (Replaces USB jobs seamlessly)
  const handleCreateQuickOrder = async (e) => {
    e.preventDefault();
    const w = Number(quickOrder.weightGrams) || 0;
    const h = Number(quickOrder.printHours) || 0.5;
    const mat = quickOrder.material || 'pla';
    const delivery = quickOrder.deliveryMode || 'pickup';

    const calculatedQuote = calculateOrderQuote({
      items: [{ weightGrams: w, printHours: h, materialKey: mat }],
      deliveryMode: delivery,
      customSettings: pricingSettings,
      customMaterials: materials
    });

    const finalPrice = quickOrder.customPrice !== '' ? Number(quickOrder.customPrice) : calculatedQuote.customerTotal;
    const trackingCode = 'ETB-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const payload = {
      name: quickOrder.name || 'Direct Workshop Client',
      phone: quickOrder.phone || '01000000000',
      email: 'direct@etba3ly.store',
      ordername: quickOrder.orderName || 'Workshop Print Job',
      material: mat.toUpperCase(),
      color: 'Standard',
      notes: setPrinterInNotes('', quickOrder.printer),
      status: 'queued',
      weightgrams: w,
      totalprice: finalPrice,
      deposit_required: calculatedQuote.depositRequired,
      deposit_paid: finalPrice, // Direct workshop walk-ins often pay upfront
      remaining_balance: 0,
      tracking_code: trackingCode,
      delivery_mode: delivery,
      createdat: new Date().toISOString()
    };

    try {
      if (supabase) {
        const { data, error } = await supabase.from('orders').insert([payload]).select().single();
        if (error) throw error;
        setOrders(prev => [data, ...prev]);
      } else {
        setOrders(prev => [{ id: Date.now(), ...payload }, ...prev]);
      }
      addToast(`Order logged & assigned to ${quickOrder.printer}`, 'success');
      setIsQuickAddOpen(false);
      setQuickOrder({
        name: '',
        phone: '',
        orderName: '',
        weightGrams: 30,
        printHours: 1.5,
        material: 'pla',
        printer: 'CC Abdalla',
        customPrice: '',
        deliveryMode: 'pickup'
      });
    } catch (err) {
      console.error('Failed to log order:', err);
      addToast('Error logging order to database', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Fleet & Partner Separation Metrics
  // ─────────────────────────────────────────────────────────────
  const fleetData = useMemo(() => {
    let abdallaHours = 0;
    let abdallaGrams = 0;
    let abdallaRevenue = 0;
    let abdallaCosts = 0;
    let abdallaActiveJob = null;

    let mazenHours = 0;
    let mazenGrams = 0;
    let mazenRevenue = 0;
    let mazenCosts = 0;
    let mazenActiveJob = null;

    let unassignedRevenue = 0;
    let totalFleetHours = 0;

    orders.forEach(o => {
      const isDone = o.status === 'done' || o.status === 'completed';
      const isPrinting = o.status === 'printing';
      const printer = getPrinterFromNotes(o.notes);
      const w = Number(o.weightgrams) || 0;
      const h = Number(o.printhours) || (w > 0 ? (w / 35) : 0.2);
      const rev = Number(o.totalprice) || 0;

      // Direct variable costs (raw material + wear 5/h + dep 4.5/h + failed reserve 8%)
      const matKey = normalizeMaterialKey(o.material);
      const matCostRate = materials[matKey]?.cost || 0.65;
      const materialCost = w * matCostRate;
      const machineWearCost = h * (Number(pricingSettings.maintenance_hourly_rate) || 5);
      const depreciationCost = h * (Number(pricingSettings.depreciation_hourly_rate) || 4.5);
      const reserveCost = materialCost * (Number(pricingSettings.failed_print_reserve_pct) || 0.08);
      const directCost = materialCost + machineWearCost + depreciationCost + reserveCost;

      if (isPrinting) {
        if (printer === 'CC Abdalla') abdallaActiveJob = o;
        if (printer === 'CC Mazen') mazenActiveJob = o;
      }

      if (isDone || isPrinting) {
        totalFleetHours += h;
        if (printer === 'CC Abdalla') {
          abdallaHours += h;
          abdallaGrams += w;
          abdallaRevenue += rev;
          abdallaCosts += directCost;
        } else if (printer === 'CC Mazen') {
          mazenHours += h;
          mazenGrams += w;
          mazenRevenue += rev;
          mazenCosts += directCost;
        } else {
          unassignedRevenue += rev;
        }
      }
    });

    const abdallaProfit = abdallaRevenue - abdallaCosts;
    const mazenProfit = mazenRevenue - mazenCosts;
    const totalNetProfit = (abdallaProfit + mazenProfit + unassignedRevenue);

    const partnerDistributions = calculatePartnerDistributions(totalNetProfit, pricingSettings);

    return {
      abdalla: {
        printer: 'CC Abdalla',
        operator: 'Abdalla',
        hours: Math.round(abdallaHours * 10) / 10,
        grams: Math.round(abdallaGrams),
        revenue: Math.round(abdallaRevenue * 100) / 100,
        costs: Math.round(abdallaCosts * 100) / 100,
        netProfit: Math.round(abdallaProfit * 100) / 100,
        activeJob: abdallaActiveJob
      },
      mazen: {
        printer: 'CC Mazen',
        operator: 'Mazen',
        hours: Math.round(mazenHours * 10) / 10,
        grams: Math.round(mazenGrams),
        revenue: Math.round(mazenRevenue * 100) / 100,
        costs: Math.round(mazenCosts * 100) / 100,
        netProfit: Math.round(mazenProfit * 100) / 100,
        activeJob: mazenActiveJob
      },
      totalFleetHours: Math.round(totalFleetHours * 10) / 10,
      totalNetProfit: Math.round(totalNetProfit * 100) / 100,
      partnerDistributions
    };
  }, [orders, pricingSettings, materials]);

  // Filtered Orders for the Table
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Status filter
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;

      // Printer filter
      const p = getPrinterFromNotes(o.notes);
      if (printerFilter !== 'all') {
        if (printerFilter === 'CC Abdalla' && p !== 'CC Abdalla') return false;
        if (printerFilter === 'CC Mazen' && p !== 'CC Mazen') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (o.name || '').toLowerCase().includes(q);
        const matchOrder = (o.ordername || '').toLowerCase().includes(q);
        const matchPhone = (o.phone || '').includes(q);
        const matchCode = (o.tracking_code || '').toLowerCase().includes(q);
        const matchId = String(o.id || '').toLowerCase().includes(q);
        return matchName || matchOrder || matchPhone || matchCode || matchId;
      }

      return true;
    });
  }, [orders, statusFilter, printerFilter, searchQuery]);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#090d16',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* STRIPE / SHOPIFY STYLE LEFT VERTICAL SIDEBAR */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside style={{
        width: 260,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 16px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Brand Header */}
          <div style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#000'
              }}>
                E
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  Etba3ly OS
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Staging Workshop
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { id: 'orders', label: 'Orders & Queue', badge: orders.filter(o => o.status === 'queued' || o.status === 'printing').length },
              { id: 'fleet', label: 'Fleet & Working Hours', badge: '2 CC1' },
              { id: 'partners', label: 'Partner P&L & Splits' },
              { id: 'settings', label: 'Pricing & Store CMS' },
              { id: 'gallery', label: 'Product Gallery', badge: galleryItems.length }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.15s ease',
                  background: activeNav === item.id ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: activeNav === item.id ? '#38bdf8' : '#94a3b8',
                  textAlign: 'left'
                }}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: activeNav === item.id ? '#38bdf8' : 'rgba(255, 255, 255, 0.06)',
                    color: activeNav === item.id ? '#000' : '#cbd5e1'
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
          <button
            onClick={() => { fetchOrders(); fetchConfig(); addToast('Database queue refreshed', 'info'); }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            Refresh Data
          </button>
          <button
            onClick={exportCSV}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            Export Orders CSV
          </button>
          <button
            onClick={handleAdminLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MAIN VIEW CONTENT AREA */}
      {/* ───────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', minWidth: 0 }}>
        {/* Top Header Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 28,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 20
        }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
              {activeNav === 'orders' && 'Orders & Production Queue'}
              {activeNav === 'fleet' && 'Printer Fleet & Working Hours'}
              {activeNav === 'partners' && 'Two-Partner Profit Sharing (Mazen & Abdalla)'}
              {activeNav === 'settings' && 'Dynamic Pricing & Store Parameters'}
              {activeNav === 'gallery' && 'Product Portfolio & Gallery Studio'}
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
              {activeNav === 'orders' && 'Manage student orders, assign to Mazen or Abdalla, lock pricing, and dispatch prints.'}
              {activeNav === 'fleet' && 'Track distinct machine hours, maintenance wear, and filament extrusion per 3D printer.'}
              {activeNav === 'partners' && 'Audited partner splits, growth funds, and realized cashflow distributions.'}
              {activeNav === 'settings' && 'Real-time parameters for setup fees, hourly rates, materials, and dormant power rates.'}
              {activeNav === 'gallery' && 'Manage public showcase items and client print models.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setIsQuickAddOpen(true)}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                background: '#38bdf8',
                color: '#000',
                fontWeight: 700,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              + Quick Add Order
            </button>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 1: ORDERS & PRODUCTION QUEUE */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeNav === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Filter Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              background: 'rgba(15, 23, 42, 0.65)',
              padding: '14px 18px',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {/* Status Tabs */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All Orders' },
                  { id: 'queued', label: 'Queued' },
                  { id: 'printing', label: 'Printing' },
                  { id: 'done', label: 'Completed' },
                  { id: 'cancelled', label: 'Cancelled' }
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStatusFilter(s.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: statusFilter === s.id ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: statusFilter === s.id ? '#38bdf8' : '#94a3b8'
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Printer Filter & Search */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={printerFilter}
                  onChange={e => setPrinterFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Printers</option>
                  <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                  <option value="CC Mazen">CC Mazen (Mazen)</option>
                </select>

                <input
                  type="text"
                  placeholder="Search order, customer, phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: 12,
                    width: 240
                  }}
                />
              </div>
            </div>

            {/* Orders Table */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '14px 16px' }}>Order Details</th>
                    <th style={{ padding: '14px 16px' }}>Part Specs</th>
                    <th style={{ padding: '14px 16px' }}>Assigned Hardware</th>
                    <th style={{ padding: '14px 16px' }}>Price & Immutability</th>
                    <th style={{ padding: '14px 16px' }}>Status</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                        No orders match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => {
                      const assignedPrinter = getPrinterFromNotes(order.notes) || 'Unassigned';
                      const isLocked = order.status === 'approved' || order.status === 'printing' || order.status === 'done' || order.totalprice !== null;
                      const weight = Number(order.weightgrams) || 0;
                      const price = Number(order.totalprice) || 0;

                      return (
                        <tr
                          key={order.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            transition: 'background 0.15s',
                            opacity: order._deleting ? 0.4 : 1
                          }}
                        >
                          {/* Order Details */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{order.ordername || 'Custom Print'}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                              {order.name || 'Client'} &bull; {order.phone}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
                              {order.tracking_code || `#${String(order.id).slice(0, 8)}`}
                            </div>
                          </td>

                          {/* Part Specs */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600 }}>{order.material || 'PLA'}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>({order.color || 'White'})</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                              {weight}g &bull; ~{Math.max(0.2, (weight / 35)).toFixed(1)} hrs
                            </div>
                            {order.fileurl && (
                              <a
                                href={order.fileurl.split(',')[0]}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 11, color: '#38bdf8', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}
                              >
                                Download STL &rarr;
                              </a>
                            )}
                          </td>

                          {/* Assigned Hardware */}
                          <td style={{ padding: '14px 16px' }}>
                            <select
                              value={assignedPrinter}
                              onChange={e => handleAssignPrinter(order.id, e.target.value)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: '#1e293b',
                                color: assignedPrinter.includes('Abdalla') ? '#38bdf8' : assignedPrinter.includes('Mazen') ? '#a855f7' : '#94a3b8',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              <option value="Unassigned">Assign Printer...</option>
                              <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                              <option value="CC Mazen">CC Mazen (Mazen)</option>
                            </select>
                          </td>

                          {/* Price & Immutability */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>
                              {price.toFixed(2)} EGP
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                textTransform: 'uppercase',
                                background: isLocked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                                color: isLocked ? '#22c55e' : '#eab308',
                                border: isLocked ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(234, 179, 8, 0.25)'
                              }}>
                                {isLocked ? 'Price Locked' : 'Draft Quote'}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 16px' }}>
                            <select
                              value={order.status}
                              onChange={e => handleUpdateStatus(order.id, e.target.value)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: order.status === 'printing' ? 'rgba(56, 189, 248, 0.15)' :
                                            order.status === 'done' ? 'rgba(34, 197, 94, 0.15)' :
                                            order.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                                color: order.status === 'printing' ? '#38bdf8' :
                                       order.status === 'done' ? '#22c55e' :
                                       order.status === 'cancelled' ? '#ef4444' : '#cbd5e1',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <option value="queued">Queued</option>
                              <option value="approved">Approved</option>
                              <option value="printing">Printing Now</option>
                              <option value="done">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>

                          {/* Quick Actions */}
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleRecalculateOrderPrice(order)}
                                title="Recalculate price using latest dynamic rates"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  color: '#cbd5e1',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  cursor: 'pointer'
                                }}
                              >
                                Recalc
                              </button>
                              <button
                                onClick={() => handleDeleteOrder(order.id)}
                                title="Delete order"
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.2)',
                                  cursor: 'pointer'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 2: FLEET ALLOCATION & WORKING HOURS (MAZEN VS ABDALLA) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeNav === 'fleet' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Two Distinct Machine Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
              {/* CC Abdalla Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 16,
                padding: 24,
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>Elegoo Centauri Carbon #1</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Partner Operator: Abdalla</div>
                  </div>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: fleetData.abdalla.activeJob ? 'rgba(56, 189, 248, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: fleetData.abdalla.activeJob ? '#38bdf8' : '#22c55e',
                    border: '1px solid currentColor'
                  }}>
                    {fleetData.abdalla.activeJob ? 'Printing: ' + fleetData.abdalla.activeJob.ordername : 'Idle / Ready'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Working Hours</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#fff' }}>{fleetData.abdalla.hours} hrs</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Filament Extruded</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#fff' }}>{fleetData.abdalla.grams} g</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Revenue Generated</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#22c55e' }}>{fleetData.abdalla.revenue.toFixed(2)} EGP</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Abdalla Machine Profit</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#38bdf8' }}>{fleetData.abdalla.netProfit.toFixed(2)} EGP</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 12 }}>
                  Direct machine burdens (wear 5 EGP/h + depreciation 4.5 EGP/h): <strong>{fleetData.abdalla.costs.toFixed(2)} EGP</strong>
                </div>
              </div>

              {/* CC Mazen Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: 16,
                padding: 24,
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#a855f7' }}>Elegoo Centauri Carbon #2</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Partner Operator: Mazen</div>
                  </div>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: fleetData.mazen.activeJob ? 'rgba(168, 85, 247, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: fleetData.mazen.activeJob ? '#a855f7' : '#22c55e',
                    border: '1px solid currentColor'
                  }}>
                    {fleetData.mazen.activeJob ? 'Printing: ' + fleetData.mazen.activeJob.ordername : 'Idle / Ready'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Working Hours</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#fff' }}>{fleetData.mazen.hours} hrs</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Filament Extruded</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#fff' }}>{fleetData.mazen.grams} g</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Revenue Generated</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#22c55e' }}>{fleetData.mazen.revenue.toFixed(2)} EGP</div>
                  </div>
                  <div style={{ background: '#1e293b', padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Mazen Machine Profit</div>
                    <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#a855f7' }}>{fleetData.mazen.netProfit.toFixed(2)} EGP</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 12 }}>
                  Direct machine burdens (wear 5 EGP/h + depreciation 4.5 EGP/h): <strong>{fleetData.mazen.costs.toFixed(2)} EGP</strong>
                </div>
              </div>
            </div>

            {/* Combined Fleet Odometer */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Combined Fleet Working Hours</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#38bdf8', marginTop: 4 }}>
                  {fleetData.totalFleetHours} total machine hours logged
                </div>
              </div>
              <button
                onClick={() => setIsQuickAddOpen(true)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                + Log Offline Print Job
              </button>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 3: TWO-PARTNER PROFIT SHARING & P&L */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeNav === 'partners' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 24
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                Realized Net Earnings & Distributions
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
                Calculated strictly after filament plastic costs, 5 EGP/hr wear, 4.5 EGP/hr depreciation, 0 EGP/hr electricity, and 8% failure reserve.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {/* 40% Distributable Partner Pool */}
                <div style={{
                  background: 'rgba(34, 197, 94, 0.05)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  borderRadius: 14,
                  padding: 20
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>
                    Distributable Partner Pool ({fleetData.partnerDistributions.distributionPoolPct}%)
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0' }}>
                    {fleetData.partnerDistributions.totalDistributionPool.toFixed(2)} EGP
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 12, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#94a3b8' }}>Partner Abdalla (50%):</span>
                      <strong style={{ color: '#38bdf8' }}>{fleetData.partnerDistributions.partnerA.payout.toFixed(2)} EGP</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#94a3b8' }}>Partner Mazen (50%):</span>
                      <strong style={{ color: '#a855f7' }}>{fleetData.partnerDistributions.partnerB.payout.toFixed(2)} EGP</strong>
                    </div>
                  </div>
                </div>

                {/* 40% Business Growth Fund */}
                <div style={{
                  background: 'rgba(56, 189, 248, 0.05)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 14,
                  padding: 20
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                    Business Growth Fund ({fleetData.partnerDistributions.growthPoolPct}%)
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0' }}>
                    {fleetData.partnerDistributions.growthFund.toFixed(2)} EGP
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    Retained for workshop inventory, hardened steel nozzles, and Elegoo hardware spare parts.
                  </div>
                </div>

                {/* 20% Cash Reserves */}
                <div style={{
                  background: 'rgba(234, 179, 8, 0.05)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  borderRadius: 14,
                  padding: 20
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#eab308', textTransform: 'uppercase' }}>
                    Emergency Cash Reserves ({fleetData.partnerDistributions.reservePoolPct}%)
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0' }}>
                    {fleetData.partnerDistributions.cashReserves.toFixed(2)} EGP
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    Emergency operating liquidity buffer for courier re-deliveries and print cancellations.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 4: PRICING & STORE CMS PARAMETERS */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeNav === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <form onSubmit={handleSaveFinancials} style={{
              background: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 24
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                  Dynamic Pricing & Financial Parameters
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                  Editing these parameters immediately updates new client quotes. Historical and approved orders remain protected.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Setup Fee (EGP)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={pricingSettings.setup_fee}
                    onChange={e => setPricingSettings({ ...pricingSettings, setup_fee: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Hourly Printing Rate (EGP/hr)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={pricingSettings.printing_hourly_rate}
                    onChange={e => setPricingSettings({ ...pricingSettings, printing_hourly_rate: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Campus Pickup Minimum (EGP)
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={pricingSettings.pickup_minimum}
                    onChange={e => setPricingSettings({ ...pricingSettings, pickup_minimum: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Shipping Minimum (EGP)
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={pricingSettings.shipping_minimum}
                    onChange={e => setPricingSettings({ ...pricingSettings, shipping_minimum: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Electricity Cost (Default 0 EGP/hr)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={pricingSettings.electricity_hourly_rate}
                    onChange={e => setPricingSettings({ ...pricingSettings, electricity_hourly_rate: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                    Machine Wear Burden (EGP/hr)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={pricingSettings.maintenance_hourly_rate}
                    onChange={e => setPricingSettings({ ...pricingSettings, maintenance_hourly_rate: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>
              </div>

              {/* Material Rates Table */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                  Material Selling Rates & Purchase Costs
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }}>
                        <th style={{ padding: '8px 12px' }}>Material</th>
                        <th style={{ padding: '8px 12px' }}>Selling Rate (EGP/g)</th>
                        <th style={{ padding: '8px 12px' }}>Raw Cost (EGP/g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(materials).map(([key, data]) => (
                        <tr key={key} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{data.name}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <input
                              type="number"
                              step="0.05"
                              value={data.selling_rate}
                              onChange={e => setMaterials({
                                ...materials,
                                [key]: { ...data, selling_rate: parseFloat(e.target.value) || 0 }
                              })}
                              style={{ width: 120, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <input
                              type="number"
                              step="0.05"
                              value={data.cost}
                              onChange={e => setMaterials({
                                ...materials,
                                [key]: { ...data, cost: parseFloat(e.target.value) || 0 }
                              })}
                              style={{ width: 120, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
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
                  disabled={savingSettings}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    background: '#38bdf8',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {savingSettings ? 'Saving Parameters...' : 'Save Parameters to Database'}
                </button>
              </div>
            </form>

            {/* Notification Tests */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 24
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                Workshop Dispatch Alerts
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                Verify automated pings to Telegram, Discord, and Email when new student orders arrive.
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleTestTelegram}
                  disabled={isTestingTelegram}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#0284c7', color: '#fff', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer' }}
                >
                  {isTestingTelegram ? 'Sending...' : 'Test Telegram Alert'}
                </button>
                <button
                  onClick={handleTestDiscord}
                  disabled={isTestingDiscord}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#5865F2', color: '#fff', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer' }}
                >
                  {isTestingDiscord ? 'Sending...' : 'Test Discord Alert'}
                </button>
                <button
                  onClick={handleTestEmail}
                  disabled={isTestingEmail}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#475569', color: '#fff', fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer' }}
                >
                  {isTestingEmail ? 'Sending...' : 'Test Email Alert'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* VIEW 5: GALLERY CMS */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeNav === 'gallery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Add Gallery Item Card */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 24
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Add New Gallery Product</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Title *</label>
                  <input
                    value={newGalleryItem.title}
                    onChange={e => setNewGalleryItem(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Quadcopter Drone Arm / Enclosure"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Description</label>
                  <textarea
                    rows="2"
                    value={newGalleryItem.description}
                    onChange={e => setNewGalleryItem(p => ({ ...p, description: e.target.value }))}
                    placeholder="Material specs, print resolution, and functional details..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <GalleryStudioUploader
                  files={newGalleryFiles}
                  onProcessedFilesChange={setNewGalleryFiles}
                  onProcessingStateChange={setGalleryProcessing}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={handleAddGalleryItem}
                    disabled={galleryUploading || galleryProcessing}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      background: '#38bdf8',
                      color: '#000',
                      fontWeight: 700,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {galleryProcessing ? 'Processing Images...' : galleryUploading ? 'Uploading...' : 'Publish to Gallery'}
                  </button>
                </div>
              </div>
            </div>

            {/* Gallery Items Grid */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: 24
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>
                Active Portfolio Items ({galleryItems.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {galleryItems.map(item => (
                  <div key={item.id} style={{
                    background: '#1e293b',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {item.image_urls && item.image_urls[0] && (
                      <img
                        src={item.image_urls[0]}
                        alt={item.title}
                        style={{ width: '100%', height: 160, objectFit: 'cover' }}
                      />
                    )}
                    <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{item.description}</div>
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleDeleteGalleryItem(item)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* QUICK ADD ORDER MODAL (REPLACES USB JOBS) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isQuickAddOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 20
        }}>
          <form
            onSubmit={handleCreateQuickOrder}
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Log Workshop Print Job</div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}
              >
                &times;
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                Job / Part Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Robot Bracket / Mazen Personal"
                value={quickOrder.orderName}
                onChange={e => setQuickOrder({ ...quickOrder, orderName: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                  Assign to Hardware
                </label>
                <select
                  value={quickOrder.printer}
                  onChange={e => setQuickOrder({ ...quickOrder, printer: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                  <option value="CC Mazen">CC Mazen (Mazen)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                  Material
                </label>
                <select
                  value={quickOrder.material}
                  onChange={e => setQuickOrder({ ...quickOrder, material: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  <option value="pla">PLA</option>
                  <option value="pla_plus">PLA+ / Rapid PLA</option>
                  <option value="petg">PETG</option>
                  <option value="tpu">TPU</option>
                  <option value="carbon_fiber">Carbon Fiber</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                  Weight (g)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={quickOrder.weightGrams}
                  onChange={e => setQuickOrder({ ...quickOrder, weightGrams: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                  Print Time (hrs)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={quickOrder.printHours}
                  onChange={e => setQuickOrder({ ...quickOrder, printHours: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                Custom Price (Leave empty for dynamic rate)
              </label>
              <input
                type="number"
                step="1"
                placeholder="Auto-calculated"
                value={quickOrder.customPrice}
                onChange={e => setQuickOrder({ ...quickOrder, customPrice: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{ padding: '8px 20px', borderRadius: 8, background: '#38bdf8', color: '#000', fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                Add Job to Queue
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
