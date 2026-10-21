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

// ─────────────────────────────────────────────────────────────
// Minimalist Apple HIG Icons (1.5px Stroke, SVG Monochrome)
// ─────────────────────────────────────────────────────────────
const Icons = {
  Apple: () => (
    <svg viewBox="0 0 170 170" width="16" height="16" fill="currentColor">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.59-7.71-11.66-14.01-6.19-9.68-11.08-20.73-14.67-33.15-3.59-12.43-5.39-24.16-5.39-35.18 0-14.89 3.82-27.18 11.45-36.87 7.63-9.69 17.15-14.68 28.56-14.97 4.58 0 9.78 1.15 15.6 3.44 5.82 2.29 9.54 3.49 11.16 3.6 2.01-.22 5.86-1.46 11.55-3.71 5.69-2.26 10.74-3.32 15.16-3.18 11.43.53 20.89 4.67 28.37 12.43-10.03 6.1-15 14.62-14.91 25.56.09 8.64 3.37 16.03 9.85 22.18 6.47 6.14 14.05 9.77 22.73 10.88-2.35 6.94-5.35 14.39-8.99 22.36zM119.22 31.84c0-7.39 2.65-14.35 7.96-20.87 5.3-6.53 11.83-10.45 19.57-11.78.22 1.1.33 2.1.33 3 0 7.39-2.73 14.36-8.2 20.91-5.46 6.55-12.01 10.33-19.66 11.34-.1-.88-.15-1.78-.15-2.71z"/>
    </svg>
  ),
  Orders: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  Fleet: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
  Finance: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Gallery: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Sun: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
};

// ─────────────────────────────────────────────────────────────
// Printer Helper Functions
// ─────────────────────────────────────────────────────────────
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

export default function AdminDashboard({
  orders = [],
  setOrders = () => {},
  config = {},
  setConfig = () => {},
  supabase,
  PRINTERS = ["CC Abdalla", "CC Mazen"],
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
  // Theme state: Apple Business Light vs Apple Pro Dark
  const [isAppleDark, setIsAppleDark] = useState(() => {
    try {
      return localStorage.getItem('apple_admin_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const toggleAppleTheme = () => {
    setIsAppleDark(prev => {
      const next = !prev;
      localStorage.setItem('apple_admin_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Apple Color Tokens
  const theme = useMemo(() => {
    if (isAppleDark) {
      return {
        bg: '#000000',
        canvas: '#161617',
        surface: '#1c1c1e',
        surfaceHover: '#2c2c2e',
        border: 'rgba(255, 255, 255, 0.1)',
        borderSubtle: 'rgba(255, 255, 255, 0.05)',
        text: '#f5f5f7',
        textSecondary: '#86868b',
        textMuted: '#636366',
        accent: '#2997ff',
        buttonPrimaryBg: '#ffffff',
        buttonPrimaryText: '#000000',
        buttonSecondaryBg: 'rgba(255, 255, 255, 0.08)',
        buttonSecondaryText: '#f5f5f7',
        statusGreen: '#30d158',
        statusOrange: '#ff9f0a',
        statusRed: '#ff453a',
        inspectorBg: '#1c1c1e'
      };
    }
    // Apple Business Light (Default matching screenshots)
    return {
      bg: '#f5f5f7',
      canvas: '#ffffff',
      surface: '#ffffff',
      surfaceHover: '#f5f5f7',
      border: 'rgba(0, 0, 0, 0.08)',
      borderSubtle: 'rgba(0, 0, 0, 0.04)',
      text: '#1d1d1f',
      textSecondary: '#86868b',
      textMuted: '#a1a1a6',
      accent: '#0071e3',
      buttonPrimaryBg: '#000000',
      buttonPrimaryText: '#ffffff',
      buttonSecondaryBg: 'rgba(0, 0, 0, 0.05)',
      buttonSecondaryText: '#1d1d1f',
      statusGreen: '#34c759',
      statusOrange: '#ff9500',
      statusRed: '#ff3b30',
      inspectorBg: '#ffffff'
    };
  }, [isAppleDark]);

  // Navigation: 'orders' | 'fleet' | 'partners' | 'settings' | 'gallery'
  const [activeNav, setActiveNav] = useState('orders');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'queued' | 'printing' | 'done' | 'cancelled'
  const [printerFilter, setPrinterFilter] = useState('all'); // 'all' | 'CC Abdalla' | 'CC Mazen'

  // Selected Order for Apple Inspector Slide-out Sheet
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('overview'); // 'overview' | 'specs' | 'payment'

  // Pricing Parameters State
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

  // Sync Remote Settings
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

  // Keep selected order synced when orders list updates
  useEffect(() => {
    if (selectedOrder) {
      const fresh = orders.find(o => o.id === selectedOrder.id);
      if (fresh) setSelectedOrder(fresh);
    }
  }, [orders]);

  // ─────────────────────────────────────────────────────────────
  // Order Actions & Database Sync
  // ─────────────────────────────────────────────────────────────
  const handleUpdateStatus = async (orderId, newStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    try {
      if (supabase) {
        const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;
      }
      addToast(`Status updated: ${newStatus}`, 'info');
    } catch (err) {
      console.error('Status update failed:', err);
      addToast('Status update failed', 'error');
      fetchOrders();
    }
  };

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
      fetchOrders();
    }
  };

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
      addToast(`Price updated: ${newPrice.toFixed(2)} EGP`, 'success');
    } catch (err) {
      console.error('Failed to recalculate order price:', err);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`Permanently delete order #${String(orderId).slice(0, 8)}?`)) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    if (selectedOrder?.id === orderId) setSelectedOrder(null);
    try {
      if (supabase) {
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
      }
      addToast('Order deleted', 'info');
    } catch (err) {
      console.error('Failed to delete order:', err);
      fetchOrders();
    }
  };

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
      addToast('Parameters saved successfully', 'success');
    } catch (err) {
      console.error('Error saving pricing:', err);
      addToast('Saved locally', 'info');
    } finally {
      setSavingSettings(false);
    }
  };

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
      name: quickOrder.name || 'Direct Client',
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
      deposit_paid: finalPrice,
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
        setSelectedOrder(data);
      } else {
        const mock = { id: Date.now(), ...payload };
        setOrders(prev => [mock, ...prev]);
        setSelectedOrder(mock);
      }
      addToast(`Order assigned to ${quickOrder.printer}`, 'success');
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
      addToast('Error logging order', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Minimalist Fleet Metrics (Mazen vs Abdalla)
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

    let totalFleetHours = 0;

    orders.forEach(o => {
      const isDone = o.status === 'done' || o.status === 'completed';
      const isPrinting = o.status === 'printing';
      const printer = getPrinterFromNotes(o.notes);
      const w = Number(o.weightgrams) || 0;
      const h = Number(o.printhours) || (w > 0 ? (w / 35) : 0.2);
      const rev = Number(o.totalprice) || 0;

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
        }
      }
    });

    const abdallaProfit = abdallaRevenue - abdallaCosts;
    const mazenProfit = mazenRevenue - mazenCosts;
    const totalNetProfit = abdallaProfit + mazenProfit;

    const partnerDistributions = calculatePartnerDistributions(totalNetProfit, pricingSettings);

    return {
      abdalla: {
        name: 'CC Abdalla',
        partner: 'Abdalla',
        hours: Math.round(abdallaHours * 10) / 10,
        grams: Math.round(abdallaGrams),
        revenue: Math.round(abdallaRevenue * 100) / 100,
        profit: Math.round(abdallaProfit * 100) / 100,
        activeJob: abdallaActiveJob
      },
      mazen: {
        name: 'CC Mazen',
        partner: 'Mazen',
        hours: Math.round(mazenHours * 10) / 10,
        grams: Math.round(mazenGrams),
        revenue: Math.round(mazenRevenue * 100) / 100,
        profit: Math.round(mazenProfit * 100) / 100,
        activeJob: mazenActiveJob
      },
      totalFleetHours: Math.round(totalFleetHours * 10) / 10,
      totalNetProfit: Math.round(totalNetProfit * 100) / 100,
      partnerDistributions
    };
  }, [orders, pricingSettings, materials]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      const p = getPrinterFromNotes(o.notes);
      if (printerFilter !== 'all') {
        if (printerFilter === 'CC Abdalla' && p !== 'CC Abdalla') return false;
        if (printerFilter === 'CC Mazen' && p !== 'CC Mazen') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          (o.name || '').toLowerCase().includes(q) ||
          (o.ordername || '').toLowerCase().includes(q) ||
          (o.phone || '').includes(q) ||
          (o.tracking_code || '').toLowerCase().includes(q) ||
          String(o.id || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, statusFilter, printerFilter, searchQuery]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: theme.bg,
      color: theme.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      transition: 'background 0.2s, color 0.2s'
    }}>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. APPLE TOP NAVIGATION BAR */}
      {/* ───────────────────────────────────────────────────────────── */}
      <header style={{
        height: 52,
        background: theme.canvas,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.Apple />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: theme.text }}>
            Business
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, marginLeft: 4 }}>
            · Etba3ly OS
          </span>
        </div>

        {/* Apple Horizontal Segmented Navigation */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[
            { id: 'orders', label: 'Orders' },
            { id: 'fleet', label: 'Devices' },
            { id: 'partners', label: 'Finance' },
            { id: 'settings', label: 'Settings' },
            { id: 'gallery', label: 'Showcase' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveNav(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 980,
                fontSize: 13,
                fontWeight: activeNav === tab.id ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeNav === tab.id ? theme.buttonSecondaryBg : 'transparent',
                color: activeNav === tab.id ? theme.text : theme.textSecondary
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* User / Theme / Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={toggleAppleTheme}
            title={isAppleDark ? 'Switch to Apple Business Light' : 'Switch to Apple Pro Dark'}
            style={{
              width: 32,
              height: 32,
              borderRadius: 980,
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              color: theme.text,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isAppleDark ? <Icons.Sun /> : <Icons.Moon />}
          </button>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            style={{
              padding: '6px 14px',
              borderRadius: 980,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: theme.buttonPrimaryBg,
              color: theme.buttonPrimaryText
            }}
          >
            + New Order
          </button>

          <button
            onClick={handleAdminLogout}
            style={{
              padding: '6px 12px',
              borderRadius: 980,
              fontSize: 12,
              fontWeight: 500,
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.textSecondary,
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. MAIN APP CONTAINER (DATA TABLE + SLIDE-OUT INSPECTOR SHEET) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 52px)', position: 'relative' }}>
        {/* Main Content Area */}
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', minWidth: 0 }}>
          {/* Subheader / Action Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: theme.text }}>
                {activeNav === 'orders' && 'Orders'}
                {activeNav === 'fleet' && 'Devices'}
                {activeNav === 'partners' && 'Finance & Partner Allocations'}
                {activeNav === 'settings' && 'Workshop Settings'}
                {activeNav === 'gallery' && 'Showcase Portfolio'}
              </h1>
              <span style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2, display: 'inline-block' }}>
                {activeNav === 'orders' && `${filteredOrders.length} orders configured`}
                {activeNav === 'fleet' && '2 CoreXY Elegoo Centauri Carbon devices active'}
                {activeNav === 'partners' && 'Realized distributions for Mazen and Abdalla'}
                {activeNav === 'settings' && 'Dynamic pricing rates and CMS settings'}
                {activeNav === 'gallery' && `${galleryItems.length} published products`}
              </span>
            </div>

            {/* Orders specific filters */}
            {activeNav === 'orders' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {/* Search */}
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '5px 10px'
                }}>
                  <Icons.Search />
                  <input
                    type="text"
                    placeholder="Search orders..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.text,
                      fontSize: 13,
                      paddingLeft: 8,
                      outline: 'none',
                      width: 180
                    }}
                  />
                </div>

                {/* Status Segmented Pill */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="printing">Printing</option>
                  <option value="done">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={printerFilter}
                  onChange={e => setPrinterFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Hardware</option>
                  <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                  <option value="CC Mazen">CC Mazen (Mazen)</option>
                </select>
              </div>
            )}
          </div>

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: ORDERS (FULL-WIDTH APPLE DATA TABLE) */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'orders' && (
            <div style={{
              background: theme.surface,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{
                    borderBottom: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase'
                  }}>
                    <th style={{ padding: '12px 18px' }}>Name / Details</th>
                    <th style={{ padding: '12px 18px' }}>Specifications</th>
                    <th style={{ padding: '12px 18px' }}>Device</th>
                    <th style={{ padding: '12px 18px' }}>Price</th>
                    <th style={{ padding: '12px 18px' }}>Status</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Inspection</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '48px 18px', textAlign: 'center', color: theme.textSecondary, fontSize: 13 }}>
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => {
                      const isSelected = selectedOrder?.id === order.id;
                      const printer = getPrinterFromNotes(order.notes) || 'Unassigned';
                      const isLocked = order.status === 'approved' || order.status === 'printing' || order.status === 'done' || order.totalprice !== null;
                      const weight = Number(order.weightgrams) || 0;
                      const price = Number(order.totalprice) || 0;

                      let statusColor = theme.textSecondary;
                      if (order.status === 'printing') statusColor = theme.statusOrange;
                      if (order.status === 'done') statusColor = theme.statusGreen;
                      if (order.status === 'cancelled') statusColor = theme.statusRed;

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          style={{
                            borderBottom: `1px solid ${theme.borderSubtle}`,
                            cursor: 'pointer',
                            background: isSelected ? (isAppleDark ? '#2c2c2e' : '#f0f0f5') : 'transparent',
                            transition: 'background 0.1s ease'
                          }}
                        >
                          {/* Name / Customer */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: 600, color: theme.text }}>{order.ordername || 'Custom 3D Print'}</div>
                            <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                              {order.name || 'Client'} · {order.tracking_code || `#${String(order.id).slice(0, 6)}`}
                            </div>
                          </td>

                          {/* Specifications */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ color: theme.text, fontWeight: 500 }}>
                              {order.material || 'PLA'} · {weight}g
                            </div>
                            <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                              ~{Math.max(0.2, (weight / 35)).toFixed(1)} hrs
                            </div>
                          </td>

                          {/* Device Assigned */}
                          <td style={{ padding: '14px 18px' }}>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: printer.includes('Abdalla') ? theme.accent : printer.includes('Mazen') ? '#af52de' : theme.textSecondary
                            }}>
                              {printer}
                            </span>
                          </td>

                          {/* Price */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: 600, color: theme.text }}>{price.toFixed(2)} EGP</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: isLocked ? theme.statusGreen : theme.statusOrange, marginTop: 2 }}>
                              {isLocked ? 'Price Locked' : 'Draft'}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                              <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize', color: theme.text }}>
                                {order.status}
                              </span>
                            </div>
                          </td>

                          {/* Right Chevron */}
                          <td style={{ padding: '14px 18px', textAlign: 'right', color: theme.textMuted }}>
                            <Icons.ChevronRight />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: DEVICES (MINIMALIST APPLE TELEMETRY ROWS) */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'fleet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* CC Abdalla Row */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: theme.buttonSecondaryBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.text
                  }}>
                    <Icons.Fleet />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Elegoo Centauri Carbon #1</span>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: fleetData.abdalla.activeJob ? theme.statusOrange : theme.statusGreen
                      }} />
                      <span style={{ fontSize: 12, color: theme.textSecondary }}>
                        {fleetData.abdalla.activeJob ? 'Printing: ' + fleetData.abdalla.activeJob.ordername : 'Ready'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      Assigned Partner: Abdalla · CoreXY 0.4mm Nozzle
                    </div>
                  </div>
                </div>

                {/* Inline Telemetry Metrics */}
                <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Hours</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.abdalla.hours} hrs</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Extruded</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.abdalla.grams} g</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Revenue</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.abdalla.revenue.toFixed(2)} EGP</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Abdalla Profit</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.accent, marginTop: 2 }}>{fleetData.abdalla.profit.toFixed(2)} EGP</div>
                  </div>
                  <button
                    onClick={() => {
                      setQuickOrder(p => ({ ...p, printer: 'CC Abdalla' }));
                      setIsQuickAddOpen(true);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 980,
                      fontSize: 12,
                      fontWeight: 600,
                      border: `1px solid ${theme.border}`,
                      background: theme.buttonSecondaryBg,
                      color: theme.buttonSecondaryText,
                      cursor: 'pointer'
                    }}
                  >
                    + Log Job
                  </button>
                </div>
              </div>

              {/* CC Mazen Row */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: theme.buttonSecondaryBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.text
                  }}>
                    <Icons.Fleet />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Elegoo Centauri Carbon #2</span>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: fleetData.mazen.activeJob ? theme.statusOrange : theme.statusGreen
                      }} />
                      <span style={{ fontSize: 12, color: theme.textSecondary }}>
                        {fleetData.mazen.activeJob ? 'Printing: ' + fleetData.mazen.activeJob.ordername : 'Ready'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      Assigned Partner: Mazen · CoreXY 0.4mm Nozzle
                    </div>
                  </div>
                </div>

                {/* Inline Telemetry Metrics */}
                <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Hours</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.mazen.hours} hrs</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Extruded</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.mazen.grams} g</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Revenue</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>{fleetData.mazen.revenue.toFixed(2)} EGP</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase' }}>Mazen Profit</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#af52de', marginTop: 2 }}>{fleetData.mazen.profit.toFixed(2)} EGP</div>
                  </div>
                  <button
                    onClick={() => {
                      setQuickOrder(p => ({ ...p, printer: 'CC Mazen' }));
                      setIsQuickAddOpen(true);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 980,
                      fontSize: 12,
                      fontWeight: 600,
                      border: `1px solid ${theme.border}`,
                      background: theme.buttonSecondaryBg,
                      color: theme.buttonSecondaryText,
                      cursor: 'pointer'
                    }}
                  >
                    + Log Job
                  </button>
                </div>
              </div>

              {/* Total Fleet Odometer */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
                color: theme.textSecondary
              }}>
                <div>Total combined fleet operating hours logged: <strong style={{ color: theme.text }}>{fleetData.totalFleetHours} hours</strong></div>
                <div>Wear & maintenance provisions applied: <strong style={{ color: theme.text }}>5.00 EGP/hr</strong></div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: FINANCE & PARTNER ALLOCATIONS */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'partners' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Partner Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{
                  background: theme.surface,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  padding: 24
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                    Partner Abdalla (50% Distributable)
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, margin: '8px 0', color: theme.text, letterSpacing: '-0.02em' }}>
                    {fleetData.partnerDistributions.partnerA.payout.toFixed(2)} EGP
                  </div>
                  <div style={{ fontSize: 12, color: theme.textSecondary }}>
                    Direct machine contribution: {fleetData.abdalla.profit.toFixed(2)} EGP
                  </div>
                </div>

                <div style={{
                  background: theme.surface,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  padding: 24
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                    Partner Mazen (50% Distributable)
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, margin: '8px 0', color: theme.text, letterSpacing: '-0.02em' }}>
                    {fleetData.partnerDistributions.partnerB.payout.toFixed(2)} EGP
                  </div>
                  <div style={{ fontSize: 12, color: theme.textSecondary }}>
                    Direct machine contribution: {fleetData.mazen.profit.toFixed(2)} EGP
                  </div>
                </div>
              </div>

              {/* Pool Breakdown Table */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: '20px 24px'
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: theme.text }}>
                  Realized Net Earnings & Capital Pools
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 10 }}>
                    <span style={{ color: theme.textSecondary }}>Distributable Partner Pool (40%)</span>
                    <strong style={{ color: theme.statusGreen }}>{fleetData.partnerDistributions.totalDistributionPool.toFixed(2)} EGP</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 10 }}>
                    <span style={{ color: theme.textSecondary }}>Business Growth Fund (40%)</span>
                    <strong style={{ color: theme.accent }}>{fleetData.partnerDistributions.growthFund.toFixed(2)} EGP</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 4 }}>
                    <span style={{ color: theme.textSecondary }}>Emergency Operating Reserves (20%)</span>
                    <strong style={{ color: theme.statusOrange }}>{fleetData.partnerDistributions.cashReserves.toFixed(2)} EGP</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: SETTINGS (PRICING & CMS) */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <form onSubmit={handleSaveFinancials} style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>
                  Dynamic Pricing Configuration
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Setup Fee (EGP)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={pricingSettings.setup_fee}
                      onChange={e => setPricingSettings({ ...pricingSettings, setup_fee: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Printing Hourly Rate (EGP/hr)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingSettings.printing_hourly_rate}
                      onChange={e => setPricingSettings({ ...pricingSettings, printing_hourly_rate: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Pickup Minimum (EGP)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={pricingSettings.pickup_minimum}
                      onChange={e => setPricingSettings({ ...pricingSettings, pickup_minimum: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Shipping Minimum (EGP)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={pricingSettings.shipping_minimum}
                      onChange={e => setPricingSettings({ ...pricingSettings, shipping_minimum: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Electricity (EGP/hr - Default 0)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={pricingSettings.electricity_hourly_rate}
                      onChange={e => setPricingSettings({ ...pricingSettings, electricity_hourly_rate: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Wear Burden (EGP/hr)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingSettings.maintenance_hourly_rate}
                      onChange={e => setPricingSettings({ ...pricingSettings, maintenance_hourly_rate: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Materials Table */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Material Rates</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '8px 10px' }}>Material</th>
                        <th style={{ padding: '8px 10px' }}>Selling Rate (EGP/g)</th>
                        <th style={{ padding: '8px 10px' }}>Cost (EGP/g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(materials).map(([key, data]) => (
                        <tr key={key} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                          <td style={{ padding: '8px 10px', fontWeight: 500, color: theme.text }}>{data.name}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              step="0.05"
                              value={data.selling_rate}
                              onChange={e => setMaterials({ ...materials, [key]: { ...data, selling_rate: parseFloat(e.target.value) || 0 } })}
                              style={{ width: 100, padding: '4px 8px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}` }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              step="0.05"
                              value={data.cost}
                              onChange={e => setMaterials({ ...materials, [key]: { ...data, cost: parseFloat(e.target.value) || 0 } })}
                              style={{ width: 100, padding: '4px 8px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}` }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 980,
                      background: theme.buttonPrimaryBg,
                      color: theme.buttonPrimaryText,
                      fontWeight: 600,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {savingSettings ? 'Saving...' : 'Save Parameters'}
                  </button>
                </div>
              </form>

              {/* Notification Testing */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: 20
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Alert Testing</div>
                <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 12 }}>Verify instant dispatch notification triggers.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram}
                    style={{ padding: '6px 14px', borderRadius: 980, background: theme.buttonSecondaryBg, color: theme.text, fontSize: 12, fontWeight: 500, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    {isTestingTelegram ? 'Testing...' : 'Test Telegram Alert'}
                  </button>
                  <button
                    onClick={handleTestDiscord}
                    disabled={isTestingDiscord}
                    style={{ padding: '6px 14px', borderRadius: 980, background: theme.buttonSecondaryBg, color: theme.text, fontSize: 12, fontWeight: 500, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    {isTestingDiscord ? 'Testing...' : 'Test Discord Alert'}
                  </button>
                  <button
                    onClick={handleTestEmail}
                    disabled={isTestingEmail}
                    style={{ padding: '6px 14px', borderRadius: 980, background: theme.buttonSecondaryBg, color: theme.text, fontSize: 12, fontWeight: 500, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    {isTestingEmail ? 'Testing...' : 'Test Email Alert'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: GALLERY PORTFOLIO */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'gallery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: 24
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 16 }}>Add Portfolio Product</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Product Title</label>
                    <input
                      value={newGalleryItem.title}
                      onChange={e => setNewGalleryItem(p => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. Precision Drone Arm Enclosure"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Description</label>
                    <textarea
                      rows="2"
                      value={newGalleryItem.description}
                      onChange={e => setNewGalleryItem(p => ({ ...p, description: e.target.value }))}
                      placeholder="Functional specs and material details..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <GalleryStudioUploader
                    files={newGalleryFiles}
                    onProcessedFilesChange={setNewGalleryFiles}
                    onProcessingStateChange={setGalleryProcessing}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      onClick={handleAddGalleryItem}
                      disabled={galleryUploading || galleryProcessing}
                      style={{
                        padding: '8px 20px',
                        borderRadius: 980,
                        background: theme.buttonPrimaryBg,
                        color: theme.buttonPrimaryText,
                        fontSize: 13,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {galleryProcessing ? 'Processing Images...' : galleryUploading ? 'Uploading...' : 'Publish Product'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Published Items Grid */}
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: 24
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 16 }}>
                  Published Items ({galleryItems.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                  {galleryItems.map(item => (
                    <div key={item.id} style={{
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      overflow: 'hidden',
                      background: theme.canvas
                    }}>
                      {item.image_urls && item.image_urls[0] && (
                        <img src={item.image_urls[0]} alt={item.title} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                      )}
                      <div style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>{item.description}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <button
                            onClick={() => handleDeleteGalleryItem(item)}
                            style={{
                              padding: '3px 10px',
                              borderRadius: 980,
                              background: 'transparent',
                              color: theme.statusRed,
                              border: `1px solid rgba(255,59,48,0.25)`,
                              fontSize: 11,
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. SLIDE-OUT APPLE INSPECTOR SHEET (EXACT MATCH TO SCREENSHOT 1 & 2) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {selectedOrder && (
          <aside style={{
            width: 380,
            background: theme.inspectorBg,
            borderLeft: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 52,
            height: 'calc(100vh - 52px)',
            overflowY: 'auto',
            zIndex: 60
          }}>
            <div style={{ padding: 24 }}>
              {/* Close Button & Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {selectedOrder.tracking_code || `#${String(selectedOrder.id).slice(0, 8)}`}
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0', color: theme.text, letterSpacing: '-0.02em' }}>
                    {selectedOrder.ordername || 'Custom 3D Print'}
                  </h2>
                  <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                    Client: {selectedOrder.name || 'Anonymous'} · {selectedOrder.phone}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.textSecondary,
                    cursor: 'pointer',
                    fontSize: 20,
                    lineHeight: 1
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Apple Action Pills Row (like 'Edit Name' & 'Delete' in screenshot 1) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button
                  onClick={() => handleRecalculateOrderPrice(selectedOrder)}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: 980,
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSecondaryBg,
                    color: theme.buttonSecondaryText,
                    cursor: 'pointer'
                  }}
                >
                  Recalculate Price
                </button>

                <button
                  onClick={() => handleDeleteOrder(selectedOrder.id)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 980,
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid rgba(255, 59, 48, 0.2)`,
                    background: 'rgba(255, 59, 48, 0.06)',
                    color: theme.statusRed,
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Apple Segmented Underline Navigation (Overview, Specs, Payment) */}
              <div style={{
                display: 'flex',
                borderBottom: `1px solid ${theme.border}`,
                marginBottom: 20,
                gap: 16
              }}>
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'specs', label: 'Specifications' },
                  { id: 'payment', label: 'Payment' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setInspectorTab(tab.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 0',
                      fontSize: 13,
                      fontWeight: inspectorTab === tab.id ? 600 : 500,
                      color: inspectorTab === tab.id ? theme.text : theme.textSecondary,
                      borderBottom: inspectorTab === tab.id ? `2px solid ${theme.text}` : '2px solid transparent',
                      cursor: 'pointer',
                      marginBottom: -1
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Overview */}
              {inspectorTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: theme.textSecondary }}>Production Status</span>
                    <select
                      value={selectedOrder.status}
                      onChange={e => handleUpdateStatus(selectedOrder.id, e.target.value)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="queued">Queued</option>
                      <option value="approved">Approved</option>
                      <option value="printing">Printing</option>
                      <option value="done">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: theme.textSecondary }}>Assigned Device</span>
                    <select
                      value={getPrinterFromNotes(selectedOrder.notes) || 'Unassigned'}
                      onChange={e => handleAssignPrinter(selectedOrder.id, e.target.value)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Unassigned">Unassigned</option>
                      <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                      <option value="CC Mazen">CC Mazen (Mazen)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: theme.textSecondary }}>Total Order Amount</span>
                    <strong style={{ fontSize: 16, color: theme.text }}>
                      {Number(selectedOrder.totalprice || 0).toFixed(2)} EGP
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: theme.textSecondary }}>Deposit Status</span>
                    <span style={{ color: theme.statusGreen, fontWeight: 600 }}>
                      {selectedOrder.deposit_required ? `${selectedOrder.deposit_required} EGP Required` : 'Standard 50%'}
                    </span>
                  </div>

                  {selectedOrder.fileurl && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.borderSubtle}` }}>
                      <a
                        href={selectedOrder.fileurl.split(',')[0]}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          padding: '8px 14px',
                          borderRadius: 8,
                          background: theme.buttonSecondaryBg,
                          color: theme.text,
                          textDecoration: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          border: `1px solid ${theme.border}`
                        }}
                      >
                        Download 3D STL Model File &rarr;
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Specifications */}
              {inspectorTab === 'specs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Material</span>
                    <strong style={{ color: theme.text }}>{selectedOrder.material || 'PLA'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Filament Weight</span>
                    <strong style={{ color: theme.text }}>{selectedOrder.weightgrams || 0} grams</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Estimated Print Time</span>
                    <strong style={{ color: theme.text }}>~{Math.max(0.2, (selectedOrder.weightgrams / 35)).toFixed(1)} hours</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Color Choice</span>
                    <strong style={{ color: theme.text }}>{selectedOrder.color || 'White'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>Fulfillment Mode</span>
                    <strong style={{ color: theme.text, textTransform: 'capitalize' }}>{selectedOrder.delivery_mode || 'Pickup'}</strong>
                  </div>
                </div>
              )}

              {/* Tab 3: Payment */}
              {inspectorTab === 'payment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Total Customer Price</span>
                    <strong style={{ color: theme.text }}>{Number(selectedOrder.totalprice || 0).toFixed(2)} EGP</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>50% Deposit Due</span>
                    <strong style={{ color: theme.statusOrange }}>
                      {Math.ceil(Number(selectedOrder.totalprice || 0) * 0.5)} EGP
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>Remaining on Collection</span>
                    <strong style={{ color: theme.text }}>
                      {(Number(selectedOrder.totalprice || 0) - Math.ceil(Number(selectedOrder.totalprice || 0) * 0.5)).toFixed(2)} EGP
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Sheet Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8
            }}>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 980,
                  fontSize: 12,
                  fontWeight: 500,
                  background: 'transparent',
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. MODAL: APPLE QUICK ADD ORDER (LOG OFFLINE/WALK-IN ORDER) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isQuickAddOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 20
        }}>
          <form
            onSubmit={handleCreateQuickOrder}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: 28,
              maxWidth: 460,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>New Print Order</div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: 20 }}
              >
                &times;
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                Part or Job Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Robot Bracket / Mazen Personal"
                value={quickOrder.orderName}
                onChange={e => setQuickOrder({ ...quickOrder, orderName: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Assigned Hardware
                </label>
                <select
                  value={quickOrder.printer}
                  onChange={e => setQuickOrder({ ...quickOrder, printer: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  <option value="CC Abdalla">CC Abdalla (Abdalla)</option>
                  <option value="CC Mazen">CC Mazen (Mazen)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Material
                </label>
                <select
                  value={quickOrder.material}
                  onChange={e => setQuickOrder({ ...quickOrder, material: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
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
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Weight (grams)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={quickOrder.weightGrams}
                  onChange={e => setQuickOrder({ ...quickOrder, weightGrams: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Print Time (hrs)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={quickOrder.printHours}
                  onChange={e => setQuickOrder({ ...quickOrder, printHours: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                Custom Price (Leave empty for dynamic pricing)
              </label>
              <input
                type="number"
                step="1"
                placeholder="Auto-calculated"
                value={quickOrder.customPrice}
                onChange={e => setQuickOrder({ ...quickOrder, customPrice: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 980,
                  fontSize: 12,
                  fontWeight: 500,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.textSecondary,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                style={{
                  padding: '7px 18px',
                  borderRadius: 980,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  background: theme.buttonPrimaryBg,
                  color: theme.buttonPrimaryText,
                  cursor: 'pointer'
                }}
              >
                Add Order
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
