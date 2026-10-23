import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  DEFAULT_SHIPPING_ZONES,
  calculateOrderQuote,
  calculatePartnerDistributions,
  normalizeMaterialKey,
  serializeFilamentCatalog,
  parseFilamentCatalog,
  getColorHex
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
function getAssetPath(file) {
  const clean = (file || "").replace(/^\/+/, "");
  if (typeof window !== "undefined") {
    const p = window.location.pathname.toLowerCase();
    if (p.startsWith("/3d-ejust")) return `/3D-EJUST/${clean}`;
    if (p.startsWith("/etba3ly.store")) return `/Etba3ly.store/${clean}`;
  }
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/+$/, "")}/${clean}`;
}

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

function getDeliveryMode(order) {
  if (!order) return 'pickup';
  if (order.delivery_mode) return order.delivery_mode;
  if (order.notes) {
    const match = order.notes.match(/\[DELIVERY:([^\]]+)\]/i) || order.notes.match(/\[Mode:\s*([^\]|]+)/i);
    if (match) return match[1].trim().toLowerCase();
  }
  return 'pickup';
}

function getOrderDeposit(order) {
  if (!order) return 0;
  if (order.deposit_required !== undefined && order.deposit_required !== null) return Number(order.deposit_required);
  if (order.notes) {
    const match = order.notes.match(/\[DEPOSIT:([^\]]+)\]/i) || order.notes.match(/\[Deposit:\s*([^\]|EGP]+)/i);
    if (match) return parseFloat(match[1]) || 0;
  }
  return Math.round((Number(order.totalprice) || 0) * 0.5);
}

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

function getOrderPaymentInfo(order) {
  if (!order) return { status: 'unpaid', paidAmount: 0 };

  // 1. Direct database column support
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

  // 2. Embedded tag in notes: [PAYMENT:paid:150] or [PAYMENT:partial] or [PAYMENT:unpaid]
  const notes = order.notes || '';
  const match = notes.match(/\[PAYMENT:([^:\]]+)(?::([^\]]+))?\]/i);
  if (match) {
    const s = match[1].toLowerCase().trim();
    const cleanStatus = ['paid', 'partial', 'unpaid'].includes(s) ? s : 'unpaid';
    const amt = match[2] ? parseFloat(match[2]) : (cleanStatus === 'paid' ? Number(order.totalprice || 0) : (cleanStatus === 'partial' ? getOrderDeposit(order) : 0));
    return { status: cleanStatus, paidAmount: isNaN(amt) ? 0 : amt };
  }

  // 3. Fallback to deposit_paid column
  const depositPaid = Number(order.deposit_paid || 0);
  const total = Number(order.totalprice || 0);
  if (depositPaid >= total && total > 0) return { status: 'paid', paidAmount: depositPaid };
  if (depositPaid > 0) return { status: 'partial', paidAmount: depositPaid };

  return { status: 'unpaid', paidAmount: 0 };
}

function setOrderPaymentInNotes(notes, status, paidAmount = 0) {
  const clean = (notes || '').replace(/\[PAYMENT:[^\]]+\]/gi, '').trim();
  const amt = parseFloat(paidAmount) || 0;
  const tag = `[PAYMENT:${status}:${amt}]`;
  return clean ? `${clean} ${tag}` : tag;
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
  isTestingEmail = false,
  materials: propMaterials,
  setMaterials: propSetMaterials
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

  const [internalMaterials, setInternalMaterials] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_material_rates');
      if (cached) return { ...DEFAULT_MATERIAL_RATES, ...JSON.parse(cached) };
    } catch {}
    return { ...DEFAULT_MATERIAL_RATES };
  });

  const materials = propMaterials || internalMaterials;
  const setMaterials = propSetMaterials || setInternalMaterials;

  const [isAddFilamentOpen, setIsAddFilamentOpen] = useState(false);
  const [newFilament, setNewFilament] = useState({ name: '', selling_rate: 2.0, cost: 0.75 });

  const [colorsList, setColorsList] = useState(() => (config?.colors || 'White, Black, Silver, Red, Orange, Marble White, Sky Blue, Green').split(',').map(c => c.trim()).filter(Boolean));
  const [newColorInput, setNewColorInput] = useState('');
  const [isAddColorOpen, setIsAddColorOpen] = useState(false);

  useEffect(() => {
    if (config && config.colors) {
      setColorsList(config.colors.split(',').map(c => c.trim()).filter(Boolean));
    }
  }, [config?.colors]);

  const [savingSettings, setSavingSettings] = useState(false);

  // Edit Order Details Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrderData, setEditingOrderData] = useState(null);

  // Quick Add Order Modal
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickOrder, setQuickOrder] = useState({
    name: '',
    phone: '',
    orderName: '',
    weightGrams: 30,
    printHours: 1.5,
    material: 'PLA',
    printer: 'CC Abdalla',
    customPrice: '',
    deliveryMode: 'pickup'
  });

  // Sync Remote Settings
  useEffect(() => {
    let isMounted = true;
    async function loadRemote() {
      try {
        if (supabase) {
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
                cost: Number(m.cost_per_gram),
                in_stock: m.is_active !== false
              };
            });
            setMaterials(prev => ({ ...prev, ...mapped }));
            localStorage.setItem('etba3ly_material_rates', JSON.stringify(mapped));
            return;
          }
        }
        if (config && (config.materials || config.why_text)) {
          const mapped = parseFilamentCatalog(config.materials, config.why_text);
          if (isMounted && mapped && Object.keys(mapped).length > 0) {
            setMaterials(prev => ({ ...prev, ...mapped }));
          }
        }
      } catch (e) {
        console.warn('Could not sync remote pricing settings:', e);
      }
    }
    loadRemote();
    return () => { isMounted = false; };
  }, [supabase, config?.materials, config?.why_text]);

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
    setSelectedOrder(prev => (prev && prev.id === orderId ? { ...prev, status: newStatus } : prev));
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
    setSelectedOrder(prev => (prev && prev.id === orderId ? { ...prev, notes: updatedNotes } : prev));
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
    const h = getOrderPrintHours(order);
    const mode = getDeliveryMode(order);
    const quote = calculateOrderQuote({
      items: [{ weightGrams: w, printHours: h, materialKey: order.material || 'pla' }],
      deliveryMode: mode,
      customSettings: pricingSettings,
      customMaterials: materials
    });

    const newPrice = quote.customerTotal;
    const newDeposit = quote.depositRequired;
    const newRemaining = quote.remainingBalance;

    let updatedNotes = (order.notes || '')
      .replace(/\[DEPOSIT:[^\]]+\]/gi, '')
      .replace(/\[BALANCE:[^\]]+\]/gi, '')
      .trim();
    updatedNotes = `${updatedNotes} [DEPOSIT:${newDeposit}] [BALANCE:${newRemaining}]`.trim();

    const priceUpdates = {
      totalprice: newPrice,
      notes: updatedNotes,
      deposit_required: newDeposit,
      remaining_balance: newRemaining,
      price_locked: true
    };

    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...priceUpdates } : o));
    setSelectedOrder(prev => (prev && prev.id === order.id ? { ...prev, ...priceUpdates } : prev));

    try {
      if (supabase) {
        const { error } = await supabase.from('orders').update({
          totalprice: newPrice,
          notes: updatedNotes
        }).eq('id', order.id);
        if (error) throw error;
      }
      addToast(`Price updated: ${newPrice.toFixed(2)} EGP`, 'success');
    } catch (err) {
      console.error('Failed to recalculate order price:', err);
      addToast('Failed to save updated price', 'error');
    }
  };

  const handleOpenEditModal = (order) => {
    setEditingOrderData({
      id: order.id,
      name: order.name || '',
      phone: order.phone || '',
      ordername: order.ordername || '',
      material: (order.material || 'PLA').toUpperCase(),
      weightgrams: order.weightgrams || 0,
      printhours: getOrderPrintHours(order),
      totalprice: order.totalprice || 0,
      delivery_mode: getDeliveryMode(order),
      printer: getPrinterFromNotes(order.notes) || 'CC Abdalla'
    });
    setIsEditModalOpen(true);
  };

  const handleSaveOrderEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingOrderData) return;
    const { id, name, phone, ordername, material, weightgrams, printhours, totalprice, delivery_mode, printer } = editingOrderData;

    const currentOrder = orders.find(o => o.id === id);
    let updatedNotes = setPrinterInNotes(currentOrder?.notes || '', printer);
    updatedNotes = updatedNotes
      .replace(/\[DELIVERY:[^\]]+\]/gi, '')
      .replace(/\[HOURS:[^\]]+\]/gi, '')
      .replace(/\[Time:[^\]]+\]/gi, '')
      .replace(/\[Mode:[^\]]+\]/gi, '')
      .trim();
    updatedNotes = `${updatedNotes} [DELIVERY:${delivery_mode || 'pickup'}] [HOURS:${printhours || 1}]`.trim();

    const dbPayload = {
      name,
      phone,
      ordername,
      material,
      weightgrams: Number(weightgrams) || 0,
      totalprice: Number(totalprice) || 0,
      notes: updatedNotes
    };

    const updatedState = {
      ...(currentOrder || {}),
      ...dbPayload,
      printhours: Number(printhours) || 0,
      delivery_mode: delivery_mode || 'pickup'
    };

    setOrders(prev => prev.map(o => o.id === id ? updatedState : o));
    setSelectedOrder(prev => (prev && prev.id === id ? updatedState : prev));
    setIsEditModalOpen(false);

    try {
      if (supabase) {
        const { error: updateErr } = await supabase.from('orders').update(dbPayload).eq('id', id);
        if (updateErr) throw updateErr;
      }
      addToast('Order details updated', 'success');
      fetchOrders();
    } catch (err) {
      console.error('Error updating order:', err);
      addToast('Failed to save order details: ' + (err.message || err), 'error');
      fetchOrders();
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

  const handleUpdatePaymentStatus = async (orderId, targetStatus) => {
    const targetOrder = orders.find(o => o.id === orderId) || selectedOrder;
    if (!targetOrder) return;

    const validStatus = ['paid', 'partial', 'unpaid'].includes(targetStatus) ? targetStatus : 'unpaid';
    const totalPrice = Number(targetOrder.totalprice || 0);
    const depositReq = getOrderDeposit(targetOrder) || Math.ceil(totalPrice * 0.5);

    let paidAmount = 0;
    if (validStatus === 'paid') {
      paidAmount = totalPrice;
    } else if (validStatus === 'partial') {
      paidAmount = depositReq;
    } else {
      paidAmount = 0;
    }

    const remainingBalance = Math.max(0, totalPrice - paidAmount);
    const updatedNotes = setOrderPaymentInNotes(targetOrder.notes, validStatus, paidAmount);

    const updatedOrderFields = {
      payment_status: validStatus,
      paid_amount: paidAmount,
      deposit_paid: paidAmount,
      remaining_balance: remainingBalance,
      notes: updatedNotes
    };

    // Immediate optimistic state update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedOrderFields } : o));
    setSelectedOrder(prev => (prev && prev.id === orderId ? { ...prev, ...updatedOrderFields } : prev));

    try {
      if (supabase) {
        // Primary update including all columns
        const { error: fullError } = await supabase.from('orders').update({
          payment_status: validStatus,
          paid_amount: paidAmount,
          deposit_paid: paidAmount,
          remaining_balance: remainingBalance,
          notes: updatedNotes
        }).eq('id', orderId);

        if (fullError) {
          // Schema fallback if custom payment_status column does not exist
          console.warn('Payment update falling back to core columns:', fullError.message);
          const { error: coreError } = await supabase.from('orders').update({
            deposit_paid: paidAmount,
            remaining_balance: remainingBalance,
            notes: updatedNotes
          }).eq('id', orderId);

          if (coreError) {
            await supabase.from('orders').update({ notes: updatedNotes }).eq('id', orderId);
          }
        }
      }
      const labelMap = { paid: 'Paid', partial: 'Partially Paid', unpaid: 'Unpaid' };
      addToast(`Payment marked as ${labelMap[validStatus]}`, 'success');
    } catch (err) {
      console.error('Payment update error:', err);
      addToast('Failed to update payment status', 'error');
      fetchOrders();
    }
  };

  const handleAddFilament = (e) => {
    if (e) e.preventDefault();
    const nameTrimmed = (newFilament.name || '').trim();
    if (!nameTrimmed) {
      addToast('Please enter a filament name', 'error');
      return;
    }
    const key = nameTrimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (materials[key]) {
      addToast('A filament with this key or name already exists', 'error');
      return;
    }
    const updated = {
      ...materials,
      [key]: {
        name: nameTrimmed,
        selling_rate: Number(newFilament.selling_rate) || 2.0,
        cost: Number(newFilament.cost) || 0.75,
        in_stock: true
      }
    };
    setMaterials(updated);
    setNewFilament({ name: '', selling_rate: 2.0, cost: 0.75 });
    setIsAddFilamentOpen(false);
    addToast(`Added ${nameTrimmed}. Click Save to publish live.`, 'success');
  };

  const handleDeleteFilament = (key, matName) => {
    if (!window.confirm(`Permanently delete filament "${matName}" from workshop and ordering website?`)) return;
    const updated = { ...materials };
    delete updated[key];
    setMaterials(updated);
    addToast(`Deleted ${matName}. Click Save to publish live.`, 'info');
  };

  const handleToggleFilamentStock = (key) => {
    const current = materials[key];
    if (!current) return;
    const nextStock = current.in_stock === false ? true : false;
    const updated = {
      ...materials,
      [key]: {
        ...current,
        in_stock: nextStock
      }
    };
    setMaterials(updated);
    addToast(`${current.name} marked as ${nextStock ? 'In Stock' : 'Restocking Soon'}. Click Save to publish.`, 'info');
  };

  const handleAddColor = (e) => {
    if (e) e.preventDefault();
    const trimmed = (newColorInput || '').trim();
    if (!trimmed) {
      addToast('Please enter a color name', 'error');
      return;
    }
    if (colorsList.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      addToast('A color with this name already exists', 'error');
      return;
    }
    const updated = [...colorsList, trimmed];
    setColorsList(updated);
    setNewColorInput('');
    setIsAddColorOpen(false);
    addToast(`Added ${trimmed}. Click Save Parameters to publish live.`, 'success');
  };

  const handleDeleteColor = (colorToDelete) => {
    if (colorsList.length <= 1) {
      addToast('Must keep at least one active color', 'error');
      return;
    }
    const updated = colorsList.filter(c => c !== colorToDelete);
    setColorsList(updated);
    addToast(`Removed ${colorToDelete}. Click Save Parameters to publish live.`, 'info');
  };

  const handleSaveFinancials = async (e) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      localStorage.setItem('etba3ly_pricing_settings', JSON.stringify(pricingSettings));
      localStorage.setItem('etba3ly_material_rates', JSON.stringify(materials));

      const materialsString = serializeFilamentCatalog(materials);
      const colorsString = colorsList.join(', ');
      const cleanWhy = (config.why_text || '').replace(/\n?<!--RATES_CATALOG:.*?-->/s, '').trim();
      const updatedWhy = `${cleanWhy}\n<!--RATES_CATALOG:${JSON.stringify(materials)}-->`;

      let cloudSuccess = false;
      let cloudErrorMsg = null;

      if (supabase) {
        const { data, error } = await supabase.from('site_config').update({
          materials: materialsString,
          colors: colorsString,
          why_text: updatedWhy
        }).eq('id', 1).select();

        if (error) {
          cloudErrorMsg = error.message;
        } else if (data && data.length > 0) {
          cloudSuccess = true;
        }
      }

      setConfig(prev => ({
        ...prev,
        materials: materialsString,
        colors: colorsString,
        why_text: updatedWhy
      }));
      setMaterials(materials);

      if (cloudSuccess) {
        addToast('Filaments, colors & pricing synced live to ordering website', 'success');
      } else if (cloudErrorMsg) {
        addToast(`Saved locally. Cloud sync warning: ${cloudErrorMsg}`, 'info');
      } else {
        addToast('Parameters saved locally. Log into Admin account to sync cloud database.', 'info');
      }
    } catch (err) {
      console.error('Error saving pricing:', err);
      addToast('Saved locally: ' + (err.message || err), 'info');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateQuickOrder = async (e) => {
    e.preventDefault();
    const w = Number(quickOrder.weightGrams) || 0;
    const h = Number(quickOrder.printHours) || 0.5;
    const cleanMatName = Object.values(materials).find(m => m.name.toLowerCase() === String(quickOrder.material || '').toLowerCase())?.name || quickOrder.material || 'PLA';
    const delivery = quickOrder.deliveryMode || 'pickup';

    const calculatedQuote = calculateOrderQuote({
      items: [{ weightGrams: w, printHours: h, materialKey: cleanMatName }],
      deliveryMode: delivery,
      customSettings: pricingSettings,
      customMaterials: materials
    });

    const finalPrice = quickOrder.customPrice !== '' ? Number(quickOrder.customPrice) : calculatedQuote.customerTotal;
    const trackingCode = 'ETB-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const assignedNotes = setPrinterInNotes('', quickOrder.printer);
    const enrichedNotes = `${assignedNotes} [DELIVERY:${delivery}] [DEPOSIT:${calculatedQuote.depositRequired}] [HOURS:${h}]`.trim();

    const dbPayload = {
      name: quickOrder.name || 'Direct Client',
      phone: quickOrder.phone || '01000000000',
      email: 'direct@etba3ly.store',
      ordername: quickOrder.orderName || 'Workshop Print Job',
      material: cleanMatName,
      color: 'Standard',
      notes: enrichedNotes,
      status: 'queued',
      weightgrams: w,
      totalprice: finalPrice,
      tracking_code: trackingCode,
      createdat: new Date().toISOString()
    };

    const newOrderState = {
      id: 'ETB-' + Date.now(),
      ...dbPayload,
      delivery_mode: delivery,
      deposit_required: calculatedQuote.depositRequired,
      deposit_paid: finalPrice,
      remaining_balance: 0,
      printhours: h
    };

    setOrders(prev => [newOrderState, ...prev]);
    setSelectedOrder(newOrderState);
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

    try {
      if (supabase) {
        const { error: insertErr } = await supabase.from('orders').insert([dbPayload]);
        if (insertErr) throw insertErr;
      }
      addToast(`Order assigned to ${quickOrder.printer}`, 'success');
      fetchOrders();
    } catch (err) {
      console.error('Failed to log order:', err);
      addToast('Error saving order to database: ' + (err.message || err), 'error');
      fetchOrders();
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
      const h = getOrderPrintHours(o);
      const rev = Number(o.totalprice) || 0;

      const matKey = normalizeMaterialKey(o.material);
      const directMat = Object.values(materials).find(m => m && m.name && m.name.toLowerCase() === String(o.material || '').toLowerCase().trim());
      const matCostRate = directMat?.cost || materials[matKey]?.cost || 0.65;
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

  // 4 Apple Top Metric Counters
  const orderCounts = useMemo(() => {
    let total = orders.length;
    let queued = 0;
    let printing = 0;
    let completed = 0;
    orders.forEach(o => {
      const s = (o.status || '').toLowerCase().trim();
      if (s === 'queued') queued++;
      else if (s === 'printing') printing++;
      else if (s === 'done' || s === 'completed' || s === 'delivered') completed++;
    });
    return { total, queued, printing, completed };
  }, [orders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== 'all') {
        const s = (o.status || '').toLowerCase().trim();
        if (statusFilter === 'done') {
          if (s !== 'done' && s !== 'completed' && s !== 'delivered') return false;
        } else if (s !== statusFilter) {
          return false;
        }
      }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={getAssetPath(isAppleDark ? "logo-dark.svg" : "logo-light.svg")}
            alt="Etba3ly"
            style={{ height: 26, width: 'auto', display: 'block' }}
          />
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '2px 8px',
            borderRadius: 980,
            background: isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            color: theme.textSecondary
          }}>
            Business
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
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
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

              {/* 4 Small Apple Metric Boxes */}
              {activeNav === 'orders' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[
                    { id: 'total', label: 'Total', count: orderCounts.total, filter: 'all' },
                    { id: 'queued', label: 'Queued', count: orderCounts.queued, filter: 'queued', dot: '#2997ff' },
                    { id: 'printing', label: 'Printing', count: orderCounts.printing, filter: 'printing', dot: theme.statusOrange },
                    { id: 'completed', label: 'Completed', count: orderCounts.completed, filter: 'done', dot: theme.statusGreen }
                  ].map(box => {
                    const isActive = box.filter === 'all'
                      ? statusFilter === 'all'
                      : statusFilter === box.filter;
                    return (
                      <button
                        key={box.id}
                        type="button"
                        onClick={() => setStatusFilter(prev => (prev === box.filter && box.filter !== 'all' ? 'all' : box.filter))}
                        title={`Filter by ${box.label} orders`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: isActive
                            ? (isAppleDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                            : theme.surface,
                          border: `1px solid ${isActive ? (isAppleDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)') : theme.border}`,
                          color: theme.text,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                          boxShadow: isActive ? (isAppleDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.06)') : 'none',
                          userSelect: 'none'
                        }}
                      >
                        {box.dot && (
                          <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: box.dot,
                            flexShrink: 0
                          }} />
                        )}
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: isActive ? theme.text : theme.textSecondary
                        }}>
                          {box.label}
                        </span>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isActive ? (isAppleDark ? '#ffffff' : '#000000') : theme.text,
                          background: isActive
                            ? (isAppleDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)')
                            : (isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                          padding: '1px 6px',
                          borderRadius: 980,
                          minWidth: 16,
                          textAlign: 'center'
                        }}>
                          {box.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Orders specific filters - EXACT SAME ORIGINAL PLACE & SIZES */}
            {activeNav === 'orders' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
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

                <button
                  onClick={exportCSV}
                  title="Export orders to CSV"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                    color: theme.text,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  Export CSV
                </button>
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
                      const paymentInfo = getOrderPaymentInfo(order);

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
                              ~{getOrderPrintHours(order).toFixed(1)} hrs
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

                          {/* Price & Payment */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: 600, color: theme.text }}>{price.toFixed(2)} EGP</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: paymentInfo.status === 'paid'
                                  ? (isAppleDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.12)')
                                  : paymentInfo.status === 'partial'
                                  ? (isAppleDark ? 'rgba(255, 159, 10, 0.15)' : 'rgba(255, 149, 0, 0.12)')
                                  : (isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                color: paymentInfo.status === 'paid'
                                  ? theme.statusGreen
                                  : paymentInfo.status === 'partial'
                                  ? theme.statusOrange
                                  : theme.textSecondary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em'
                              }}>
                                {paymentInfo.status === 'paid' ? 'Paid' : paymentInfo.status === 'partial' ? 'Partial' : 'Unpaid'}
                              </span>
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
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Workshop Filaments & Rates</div>
                      <div style={{ fontSize: 11, color: theme.textSecondary }}>Configure pricing, purchase costs, and live availability for customers.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddFilamentOpen(!isAddFilamentOpen)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 980,
                        fontSize: 12,
                        fontWeight: 600,
                        background: theme.buttonSecondaryBg,
                        color: theme.buttonSecondaryText,
                        border: `1px solid ${theme.border}`,
                        cursor: 'pointer'
                      }}
                    >
                      {isAddFilamentOpen ? 'Cancel' : '+ Add Filament'}
                    </button>
                  </div>

                  {isAddFilamentOpen && (
                    <div style={{
                      background: theme.canvas,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      alignItems: 'flex-end'
                    }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                          Filament Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. ASA, Silk Gold"
                          value={newFilament.name}
                          onChange={e => setNewFilament({ ...newFilament, name: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                        />
                      </div>

                      <div style={{ width: 110 }}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                          Selling (EGP/g)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          value={newFilament.selling_rate}
                          onChange={e => setNewFilament({ ...newFilament, selling_rate: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                        />
                      </div>

                      <div style={{ width: 110 }}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                          Cost (EGP/g)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          value={newFilament.cost}
                          onChange={e => setNewFilament({ ...newFilament, cost: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddFilament}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: theme.buttonPrimaryBg,
                          color: theme.buttonPrimaryText,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Filament Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Selling Rate (EGP/g)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Cost (EGP/g)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Availability</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(materials).map(([key, data]) => {
                        const isInStock = data.in_stock !== false;
                        return (
                          <tr key={key} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                value={data.name || key}
                                onChange={e => setMaterials({ ...materials, [key]: { ...data, name: e.target.value } })}
                                style={{ width: 140, padding: '4px 8px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                step="0.05"
                                value={data.selling_rate}
                                onChange={e => setMaterials({ ...materials, [key]: { ...data, selling_rate: parseFloat(e.target.value) || 0 } })}
                                style={{ width: 90, padding: '4px 8px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                step="0.05"
                                value={data.cost}
                                onChange={e => setMaterials({ ...materials, [key]: { ...data, cost: parseFloat(e.target.value) || 0 } })}
                                style={{ width: 90, padding: '4px 8px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleFilamentStock(key)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 980,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  border: isInStock ? '1px solid rgba(52, 199, 89, 0.3)' : '1px solid rgba(255, 149, 0, 0.3)',
                                  background: isInStock ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 149, 0, 0.1)',
                                  color: isInStock ? theme.statusGreen : theme.statusOrange
                                }}
                              >
                                {isInStock ? 'In Stock' : 'Restocking Soon'}
                              </button>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteFilament(key, data.name || key)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 980,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  border: '1px solid rgba(255, 59, 48, 0.2)',
                                  background: 'rgba(255, 59, 48, 0.08)',
                                  color: theme.statusRed
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Filament Colors Catalog */}
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${theme.borderSubtle}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Filament Colors Catalog</div>
                      <div style={{ fontSize: 11, color: theme.textSecondary }}>Color swatches displayed to customers during ordering.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddColorOpen(!isAddColorOpen)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 980,
                        fontSize: 12,
                        fontWeight: 600,
                        background: theme.buttonSecondaryBg,
                        color: theme.buttonSecondaryText,
                        border: `1px solid ${theme.border}`,
                        cursor: 'pointer'
                      }}
                    >
                      {isAddColorOpen ? 'Cancel' : '+ Add Color'}
                    </button>
                  </div>

                  {isAddColorOpen && (
                    <div style={{
                      background: theme.canvas,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center'
                    }}>
                      <input
                        type="text"
                        placeholder="Color name (e.g. Sky Blue, Emerald Green, Silk Gold, Black)"
                        value={newColorInput}
                        onChange={e => setNewColorInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 6, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                      />
                      <button
                        type="button"
                        onClick={handleAddColor}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: theme.buttonPrimaryBg,
                          color: theme.buttonPrimaryText,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {colorsList.map(c => {
                      const hex = getColorHex(c);
                      return (
                        <div
                          key={c}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            borderRadius: 980,
                            background: theme.canvas,
                            border: `1px solid ${theme.border}`,
                            fontSize: 12,
                            color: theme.text
                          }}
                        >
                          <span style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: hex,
                            border: '1px solid rgba(255,255,255,0.3)',
                            display: 'inline-block'
                          }} />
                          <span style={{ fontWeight: 500 }}>{c}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteColor(c)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: theme.textTertiary,
                              cursor: 'pointer',
                              fontSize: 14,
                              padding: '0 2px',
                              lineHeight: 1
                            }}
                            title={`Remove ${c}`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
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
                  onClick={() => handleOpenEditModal(selectedOrder)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 980,
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSecondaryBg,
                    color: theme.buttonSecondaryText,
                    cursor: 'pointer'
                  }}
                >
                  Edit Details
                </button>

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
                      {getOrderDeposit(selectedOrder) ? `${getOrderDeposit(selectedOrder).toFixed(2)} EGP Required` : 'Standard 50%'}
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
                    <strong style={{ color: theme.text }}>~{getOrderPrintHours(selectedOrder).toFixed(1)} hours</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                    <span style={{ color: theme.textSecondary }}>Color Choice</span>
                    <strong style={{ color: theme.text }}>{selectedOrder.color || 'White'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>Fulfillment Mode</span>
                    <strong style={{ color: theme.text, textTransform: 'capitalize' }}>{getDeliveryMode(selectedOrder)}</strong>
                  </div>
                </div>
              )}

              {/* Tab 3: Payment */}
              {inspectorTab === 'payment' && (() => {
                const paymentInfo = getOrderPaymentInfo(selectedOrder);
                const totalPrice = Number(selectedOrder.totalprice || 0);
                const depositReq = getOrderDeposit(selectedOrder) || Math.ceil(totalPrice * 0.5);
                const paidAmount = paymentInfo.status === 'paid'
                  ? totalPrice
                  : paymentInfo.status === 'partial'
                  ? (paymentInfo.paidAmount > 0 ? paymentInfo.paidAmount : depositReq)
                  : 0;
                const remainingDue = Math.max(0, totalPrice - paidAmount);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
                    {/* Apple Segmented Payment Selector */}
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8
                      }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: theme.textSecondary,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}>
                          Payment Status
                        </span>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 980,
                          background: paymentInfo.status === 'paid'
                            ? (isAppleDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.12)')
                            : paymentInfo.status === 'partial'
                            ? (isAppleDark ? 'rgba(255, 159, 10, 0.15)' : 'rgba(255, 149, 0, 0.12)')
                            : (isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                          color: paymentInfo.status === 'paid'
                            ? theme.statusGreen
                            : paymentInfo.status === 'partial'
                            ? theme.statusOrange
                            : theme.textSecondary,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em'
                        }}>
                          {paymentInfo.status === 'paid' ? 'Paid' : paymentInfo.status === 'partial' ? 'Partially Paid' : 'Unpaid'}
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 3,
                        background: isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                        padding: 3,
                        borderRadius: 9,
                        border: `1px solid ${theme.borderSubtle}`
                      }}>
                        {[
                          { id: 'unpaid', label: 'Unpaid', dot: theme.textSecondary },
                          { id: 'partial', label: 'Partially Paid', dot: theme.statusOrange },
                          { id: 'paid', label: 'Paid', dot: theme.statusGreen }
                        ].map(segment => {
                          const isActive = paymentInfo.status === segment.id;
                          return (
                            <button
                              key={segment.id}
                              type="button"
                              onClick={() => handleUpdatePaymentStatus(selectedOrder.id, segment.id)}
                              style={{
                                padding: '7px 4px',
                                borderRadius: 7,
                                border: 'none',
                                fontSize: 11.5,
                                fontWeight: isActive ? 600 : 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                transition: 'all 0.15s ease',
                                background: isActive ? theme.surface : 'transparent',
                                color: isActive ? theme.text : theme.textSecondary,
                                boxShadow: isActive
                                  ? (isAppleDark ? '0 1px 3px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)')
                                  : 'none',
                                outline: 'none',
                                userSelect: 'none'
                              }}
                            >
                              <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: segment.dot,
                                flexShrink: 0
                              }} />
                              <span>{segment.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Financial Snapshot */}
                    <div style={{
                      background: isAppleDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      borderRadius: 10,
                      border: `1px solid ${theme.borderSubtle}`,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                        <span style={{ color: theme.textSecondary }}>Total Customer Price</span>
                        <strong style={{ color: theme.text }}>{totalPrice.toFixed(2)} EGP</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                        <span style={{ color: theme.textSecondary }}>50% Deposit Due</span>
                        <strong style={{ color: theme.text }}>{depositReq.toFixed(2)} EGP</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                        <span style={{ color: theme.textSecondary }}>Collected Amount</span>
                        <strong style={{ color: paidAmount > 0 ? theme.statusGreen : theme.textSecondary }}>
                          {paidAmount.toFixed(2)} EGP
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
                        <span style={{ color: theme.textSecondary }}>Remaining on Collection</span>
                        <strong style={{
                          color: remainingDue > 0 ? (paymentInfo.status === 'partial' ? theme.statusOrange : theme.text) : theme.statusGreen,
                          fontSize: 14
                        }}>
                          {remainingDue.toFixed(2)} EGP
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
      {/* MODAL: EDIT ORDER DETAILS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isEditModalOpen && editingOrderData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 210,
          padding: 20
        }}>
          <form
            onSubmit={handleSaveOrderEdit}
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
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>Edit Order Details</div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: 20 }}
              >
                &times;
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                Job / Item Title
              </label>
              <input
                type="text"
                required
                value={editingOrderData.ordername}
                onChange={e => setEditingOrderData({ ...editingOrderData, ordername: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Client Name
                </label>
                <input
                  type="text"
                  value={editingOrderData.name}
                  onChange={e => setEditingOrderData({ ...editingOrderData, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Phone
                </label>
                <input
                  type="text"
                  value={editingOrderData.phone}
                  onChange={e => setEditingOrderData({ ...editingOrderData, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Assigned Hardware
                </label>
                <select
                  value={editingOrderData.printer}
                  onChange={e => setEditingOrderData({ ...editingOrderData, printer: e.target.value })}
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
                  value={editingOrderData.material}
                  onChange={e => setEditingOrderData({ ...editingOrderData, material: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  {Object.entries(materials).map(([k, d]) => (
                    <option key={k} value={d.name || k}>{d.name || k}</option>
                  ))}
                  {editingOrderData.material && !Object.values(materials).some(m => m.name.toLowerCase() === String(editingOrderData.material).toLowerCase()) && (
                    <option value={editingOrderData.material}>{editingOrderData.material}</option>
                  )}
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
                  value={editingOrderData.weightgrams}
                  onChange={e => setEditingOrderData({ ...editingOrderData, weightgrams: parseFloat(e.target.value) || 0 })}
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
                  value={editingOrderData.printhours}
                  onChange={e => setEditingOrderData({ ...editingOrderData, printhours: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Total Price (EGP)
                </label>
                <input
                  type="number"
                  step="1"
                  value={editingOrderData.totalprice}
                  onChange={e => setEditingOrderData({ ...editingOrderData, totalprice: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Fulfillment
                </label>
                <select
                  value={editingOrderData.delivery_mode}
                  onChange={e => setEditingOrderData({ ...editingOrderData, delivery_mode: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  <option value="pickup">Campus Pickup (E-JUST)</option>
                  <option value="shipping">Nationwide Shipping</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
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
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

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
                  {Object.entries(materials).map(([k, d]) => (
                    <option key={k} value={d.name || k}>{d.name || k}</option>
                  ))}
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
