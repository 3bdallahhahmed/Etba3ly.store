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

function setPrinterInNotes(notes, printer) {
  const cleanNotes = (notes || "")
    .replace(/\[PRINTER:[^\]]+\]\s*/gi, "")
    .replace(/\[Assigned Hardware:[^\]]+\]\s*/gi, "")
    .trim();
  if (!printer) return cleanNotes;
  return `[PRINTER:${printer}] ${cleanNotes}`.trim();
}

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

function getOrderDeposit(orderOrNotes) {
  if (!orderOrNotes) return 0;
  if (typeof orderOrNotes === 'object') {
    if (orderOrNotes.deposit_required !== undefined && orderOrNotes.deposit_required !== null && !isNaN(Number(orderOrNotes.deposit_required))) {
      return Number(orderOrNotes.deposit_required);
    }
    const notes = orderOrNotes.notes || '';
    const match = notes.match(/\[DEPOSIT:([^\]]+)\]/i) || notes.match(/(?:\[Deposit:|\|\s*Deposit:)\s*([^\]|EGP\s]+)/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed)) return parsed;
    }
    return Math.round((Number(orderOrNotes.totalprice) || 0) * 0.5);
  }
  const match = String(orderOrNotes).match(/\[DEPOSIT:([^\]]+)\]/i) || String(orderOrNotes).match(/(?:\[Deposit:|\|\s*Deposit:)\s*([^\]|EGP\s]+)/i);
  return match ? (parseFloat(match[1]) || 0) : 0;
}

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

// ─────────────────────────────────────────────────────────────
// Quality & Service Tier Helper Functions
// ─────────────────────────────────────────────────────────────
export function getOrderQuality(orderOrNotes) {
  if (!orderOrNotes) return { tier: 'standard', layerHeight: 0.20, infill: 20, supports: true, label: 'Standard (0.20mm)' };
  const notes = typeof orderOrNotes === 'object'
    ? (orderOrNotes.notes || '')
    : String(orderOrNotes);

  const tierMatch = notes.match(/\[(?:QUALITY|PROFILE|TIER):([^\]]+)\]/i);
  let tier = tierMatch ? tierMatch[1].trim().toLowerCase() : null;

  const layerMatch = notes.match(/\[LAYER:([^\]]+)\]/i);
  let layerHeight = layerMatch ? parseFloat(layerMatch[1].replace(/mm/i, '')) : null;

  const infillMatch = notes.match(/\[INFILL:([^\]]+)\]/i);
  let infill = infillMatch ? parseInt(infillMatch[1].replace(/%/i, ''), 10) : null;

  const supportsMatch = notes.match(/\[SUPPORTS:([^\]]+)\]/i);
  let supports = supportsMatch ? (supportsMatch[1].trim().toLowerCase() !== 'no') : true;

  if (!tier && (layerHeight || infill !== null)) {
    tier = 'custom';
  } else if (!tier) {
    tier = 'standard';
  }

  if (!layerHeight || isNaN(layerHeight)) {
    if (tier === 'economy') layerHeight = 0.28;
    else if (tier === 'professional') layerHeight = 0.12;
    else layerHeight = 0.20;
  }

  if (infill === null || isNaN(infill)) {
    if (tier === 'economy') infill = 15;
    else if (tier === 'professional') infill = 25;
    else infill = 20;
  }

  let label = 'Standard (0.20mm)';
  if (tier === 'economy') label = 'Economy (Draft 0.28mm)';
  else if (tier === 'professional') label = 'Professional (Fine 0.12mm)';
  else if (tier === 'custom') label = `Custom (${layerHeight.toFixed(2)}mm, ${infill}%)`;
  else label = 'Standard (0.20mm)';

  return { tier, layerHeight, infill, supports, label };
}

export function setOrderQualityInNotes(notes, qualityData) {
  let clean = (notes || '')
    .replace(/\[PROFILE:[^\]]+\]/gi, '')
    .replace(/\[TIER:[^\]]+\]/gi, '')
    .replace(/\[QUALITY:[^\]]+\]/gi, '')
    .replace(/\[LAYER:[^\]]+\]/gi, '')
    .replace(/\[INFILL:[^\]]+\]/gi, '')
    .replace(/\[SUPPORTS:[^\]]+\]/gi, '')
    .trim();

  const tier = (qualityData.tier || 'standard').toLowerCase();
  const layerHeight = Number(qualityData.layerHeight || (tier === 'economy' ? 0.28 : tier === 'professional' ? 0.12 : 0.20)).toFixed(2);
  const infill = qualityData.infill !== undefined && qualityData.infill !== null ? qualityData.infill : (tier === 'economy' ? 15 : tier === 'professional' ? 25 : 20);
  const supports = qualityData.supports !== false ? 'yes' : 'no';

  const tags = `[PROFILE:${tier}] [TIER:${tier}] [QUALITY:${tier}] [LAYER:${layerHeight}mm] [INFILL:${infill}%] [SUPPORTS:${supports}]`;
  return clean ? `${clean} ${tags}` : tags;
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
  // Mobile Viewport Detection for clean responsive layouts on phones
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      const goalCached = localStorage.getItem('etba3ly_weekly_grams_goal');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...DEFAULT_PRICING_SETTINGS,
          ...parsed,
          weekly_grams_goal: goalCached ? Number(goalCached) : (Number(parsed.weekly_grams_goal) || 500),
          setup_fee: 0,
          printing_hourly_rate: 0,
          electricity_hourly_rate: 0,
          maintenance_hourly_rate: 0,
          depreciation_hourly_rate: 0,
          failed_print_reserve_pct: 0
        };
      } else if (goalCached) {
        return {
          ...DEFAULT_PRICING_SETTINGS,
          weekly_grams_goal: Number(goalCached) || 500
        };
      }
    } catch {}
    return { ...DEFAULT_PRICING_SETTINGS };
  });

  // Weekly Production Goal State (customizable grams per week in the tab)
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(() => {
    try {
      const goalCached = localStorage.getItem('etba3ly_weekly_grams_goal');
      if (goalCached) return Number(goalCached) || 500;
    } catch {}
    return 500;
  });

  useEffect(() => {
    if (pricingSettings?.weekly_grams_goal) {
      setWeeklyGoalInput(pricingSettings.weekly_grams_goal);
    }
  }, [pricingSettings?.weekly_grams_goal]);

  const handleUpdateWeeklyGoal = async (newGoal) => {
    const val = Math.max(10, Math.round(Number(newGoal) || 500));
    setWeeklyGoalInput(val);
    const updated = { ...pricingSettings, weekly_grams_goal: val };
    setPricingSettings(updated);
    try {
      localStorage.setItem('etba3ly_weekly_grams_goal', String(val));
      localStorage.setItem('etba3ly_pricing_settings', JSON.stringify(updated));
      if (supabase) {
        await supabase.from('pricing_settings').upsert({
          id: 'default',
          ...updated,
          updated_at: new Date().toISOString()
        });
      }
      addToast(`Weekly production goal updated to ${val} g`, 'success');
    } catch (err) {
      console.warn('Error saving weekly goal to cloud:', err);
      addToast(`Weekly production goal set to ${val} g (cached locally)`, 'info');
    }
  };

  const [internalMaterials, setInternalMaterials] = useState(() => {
    try {
      const cached = localStorage.getItem('etba3ly_material_rates');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.pla && Number(parsed.pla.selling_rate) <= 2.0) parsed.pla.selling_rate = 3.5;
        if (parsed.pla_plus && Number(parsed.pla_plus.selling_rate) <= 2.0) parsed.pla_plus.selling_rate = 3.5;
        return { ...DEFAULT_MATERIAL_RATES, ...parsed };
      }
    } catch {}
    return { ...DEFAULT_MATERIAL_RATES };
  });

  const materials = propMaterials || internalMaterials;
  const setMaterials = propSetMaterials || setInternalMaterials;

  const [isAddFilamentOpen, setIsAddFilamentOpen] = useState(false);
  const [newFilament, setNewFilament] = useState({ name: '', selling_rate: 3.0, cost: 0.66 });

  const [colorsList, setColorsList] = useState(() => (config?.colors || 'White, Black, Silver, Red, Orange, Marble White, Sky Blue, Green').split(',').map(c => c.trim()).filter(Boolean));
  const [newColorInput, setNewColorInput] = useState('');
  const [isAddColorOpen, setIsAddColorOpen] = useState(false);

  useEffect(() => {
    if (config && config.colors) {
      setColorsList(config.colors.split(',').map(c => c.trim()).filter(Boolean));
    }
  }, [config?.colors]);

  const [savingSettings, setSavingSettings] = useState(false);

  // Website Content CMS State
  const [cmsData, setCmsData] = useState({
    hero_title: config?.hero_title || "Your Idea.\nMade Real.",
    hero_subtitle: config?.hero_subtitle || "Upload your 3D design, pick your material, and we'll print it for you - fast, affordable, and right here on campus.",
    why_title: config?.why_title || "Why Print With Us?",
    why_text: (config?.why_text || "").replace(/\s*<!--RATES_CATALOG:.*?-->/s, '').trim() || "We're students who love making things. Our setup is tuned for speed and precision, so you get your parts fast without breaking the bank. PLA, PETG, ABS, Carbon Fiber, TPU -- we've got what you need.",
    price_per_gram: config?.price_per_gram || 3.5,
    whatsapp_number: config?.whatsapp_number || ""
  });
  const [savingCMS, setSavingCMS] = useState(false);

  useEffect(() => {
    if (config) {
      setCmsData({
        hero_title: config.hero_title || "Your Idea.\nMade Real.",
        hero_subtitle: config.hero_subtitle || "Upload your 3D design, pick your material, and we'll print it for you - fast, affordable, and right here on campus.",
        why_title: config.why_title || "Why Print With Us?",
        why_text: (config.why_text || "").replace(/\s*<!--RATES_CATALOG:.*?-->/s, '').trim(),
        price_per_gram: config.price_per_gram || 3.5,
        whatsapp_number: config.whatsapp_number || ""
      });
    }
  }, [config?.hero_title, config?.hero_subtitle, config?.why_title, config?.why_text, config?.price_per_gram, config?.whatsapp_number]);

  async function handleSaveCMS(e) {
    if (e) e.preventDefault();
    setSavingCMS(true);
    try {
      const cleanWhyText = (cmsData.why_text || "").replace(/\s*<!--RATES_CATALOG:.*?-->/s, "").trim();
      const newRate = parseFloat(cmsData.price_per_gram) || 3.5;
      const updatePayload = {
        hero_title: cmsData.hero_title,
        hero_subtitle: cmsData.hero_subtitle,
        why_title: cmsData.why_title,
        why_text: cleanWhyText,
        price_per_gram: newRate,
        whatsapp_number: (cmsData.whatsapp_number || "").trim()
      };

      // Synchronize materials so PLA & PLA+ match configured student rate
      const updatedMaterials = { ...materials };
      if (updatedMaterials.pla) {
        updatedMaterials.pla = { ...updatedMaterials.pla, selling_rate: newRate };
      } else {
        updatedMaterials.pla = { name: "PLA", selling_rate: newRate, cost: 0.66, in_stock: true };
      }
      if (updatedMaterials.pla_plus) {
        updatedMaterials.pla_plus = { ...updatedMaterials.pla_plus, selling_rate: newRate };
      } else {
        updatedMaterials.pla_plus = { name: "PLA+", selling_rate: newRate, cost: 0.70, in_stock: true };
      }

      const materialsString = serializeFilamentCatalog(updatedMaterials);
      updatePayload.materials = materialsString;

      if (supabase) {
        const { error } = await supabase.from('site_config').update(updatePayload).eq('id', 1);
        if (error) throw error;
      }

      setMaterials(updatedMaterials);
      try {
        localStorage.setItem('etba3ly_material_rates', JSON.stringify(updatedMaterials));
      } catch (err) {}

      setConfig(prev => ({ ...prev, ...updatePayload }));
      addToast('Website content and student rates updated live!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save website content: ' + (err.message || err), 'error');
    } finally {
      setSavingCMS(false);
    }
  }

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
    tier: 'standard',
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
          const effectiveStudentRate = parseFloat(config?.price_per_gram) || 3.5;
          if (isMounted && mData && mData.length > 0) {
            const mapped = {};
            mData.forEach(m => {
              let sRate = Number(m.selling_rate_per_gram);
              if ((m.material_key === 'pla' || m.material_key === 'pla_plus') && (sRate <= 2.0 || sRate < effectiveStudentRate)) {
                sRate = effectiveStudentRate;
              }
              mapped[m.material_key] = {
                name: m.display_name,
                selling_rate: sRate,
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
          const effectiveStudentRate = parseFloat(config?.price_per_gram) || 3.5;
          const mapped = parseFilamentCatalog(config.materials, config.why_text, effectiveStudentRate);
          if (isMounted && mapped && Object.keys(mapped).length > 0) {
            if (mapped.pla && (mapped.pla.selling_rate <= 2.0 || mapped.pla.selling_rate < effectiveStudentRate)) {
              mapped.pla.selling_rate = effectiveStudentRate;
            }
            if (mapped.pla_plus && (mapped.pla_plus.selling_rate <= 2.0 || mapped.pla_plus.selling_rate < effectiveStudentRate)) {
              mapped.pla_plus.selling_rate = effectiveStudentRate;
            }
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
    const q = getOrderQuality(order);
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
      printer: getPrinterFromNotes(order.notes) || 'CC Abdalla',
      tier: q.tier,
      layerHeight: q.layerHeight,
      infill: q.infill,
      supports: q.supports
    });
    setIsEditModalOpen(true);
  };

  const handleSaveOrderEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingOrderData) return;
    const { id, name, phone, ordername, material, weightgrams, printhours, totalprice, delivery_mode, printer, tier, layerHeight, infill, supports } = editingOrderData;

    const currentOrder = orders.find(o => o.id === id);
    let updatedNotes = setPrinterInNotes(currentOrder?.notes || '', printer);
    updatedNotes = setOrderQualityInNotes(updatedNotes, { tier, layerHeight, infill, supports });
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
        selling_rate: Number(newFilament.selling_rate) || 3.0,
        cost: Number(newFilament.cost) || 0.66,
        in_stock: true
      }
    };
    setMaterials(updated);
    setNewFilament({ name: '', selling_rate: 3.0, cost: 0.66 });
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
      const cleanWhy = (config.why_text || '').replace(/\s*<!--RATES_CATALOG:.*?-->/s, '').trim();

      let cloudSuccess = false;
      let cloudErrorMsg = null;

      if (supabase) {
        const studentRate = materials.pla?.selling_rate || parseFloat(cmsData.price_per_gram) || 3.5;
        const { data, error } = await supabase.from('site_config').update({
          materials: materialsString,
          colors: colorsString,
          why_text: cleanWhy,
          price_per_gram: studentRate
        }).eq('id', 1).select();

        if (error) {
          cloudErrorMsg = error.message;
        } else if (data && data.length > 0) {
          cloudSuccess = true;
        }

        try {
          await supabase.from('pricing_settings').upsert({
            id: 'default',
            ...pricingSettings,
            updated_at: new Date().toISOString()
          });
        } catch (e) {}
      }

      const activeStudentRate = materials.pla?.selling_rate || parseFloat(cmsData.price_per_gram) || 3.5;
      setConfig(prev => ({
        ...prev,
        materials: materialsString,
        colors: colorsString,
        why_text: cleanWhy,
        price_per_gram: activeStudentRate
      }));
      setCmsData(prev => ({ ...prev, price_per_gram: activeStudentRate }));
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

    const qInfo = getOrderQuality(`[PROFILE:${quickOrder.tier || 'standard'}]`);
    const assignedNotes = setPrinterInNotes('', quickOrder.printer);
    const withQualityNotes = setOrderQualityInNotes(assignedNotes, {
      tier: quickOrder.tier || 'standard',
      layerHeight: qInfo.layerHeight,
      infill: qInfo.infill,
      supports: true
    });
    const enrichedNotes = `${withQualityNotes} [DELIVERY:${delivery}] [DEPOSIT:${calculatedQuote.depositRequired}] [HOURS:${h}]`.trim();

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
      const matCostRate = directMat?.cost || materials[matKey]?.cost || 0.66;
      const materialCost = w * matCostRate;
      const directCost = materialCost;

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

  // ─────────────────────────────────────────────────────────────
  // Weekly Production Analytics (Goal Tracking)
  // ─────────────────────────────────────────────────────────────
  const weeklyAnalytics = useMemo(() => {
    const goal = Math.max(10, Number(pricingSettings.weekly_grams_goal) || 500);
    const now = new Date();

    // Start of current week (Monday 00:00:00.000)
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0, 0);
    const startOfWeekMs = startOfWeek.getTime();
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000 - 1);

    let thisWeekGrams = 0;
    let thisWeekAbdallaGrams = 0;
    let thisWeekMazenGrams = 0;
    let thisWeekOtherGrams = 0;
    let thisWeekRevenue = 0;
    let thisWeekDirectCost = 0;
    let thisWeekOrders = [];

    // Daily breakdown for current week Mon-Sun (7 days)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyBreakdown = dayLabels.map((name, i) => {
      const d = new Date(startOfWeek.getTime() + i * 86400000);
      return {
        day: name,
        dateFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: d.toDateString() === now.toDateString(),
        isPastOrToday: d <= now,
        totalGrams: 0,
        abdallaGrams: 0,
        mazenGrams: 0,
        revenue: 0
      };
    });

    orders.forEach(o => {
      const s = (o.status || '').toLowerCase().trim();
      const isDone = s === 'done' || s === 'completed' || s === 'delivered';
      const isPrinting = s === 'printing';
      if (!isDone && !isPrinting) return;

      const orderDate = o.createdat ? new Date(o.createdat) : (o.created_at ? new Date(o.created_at) : null);
      const orderMs = (orderDate && !isNaN(orderDate.getTime())) ? orderDate.getTime() : 0;
      const w = Number(o.weightgrams) || 0;
      const rev = Number(o.totalprice) || 0;
      const printer = getPrinterFromNotes(o.notes);

      const matKey = normalizeMaterialKey(o.material);
      const directMat = Object.values(materials).find(m => m && m.name && m.name.toLowerCase() === String(o.material || '').toLowerCase().trim());
      const matCostRate = directMat?.cost || materials[matKey]?.cost || 0.66;
      const directCost = w * matCostRate;

      // Match current week
      if (orderMs >= startOfWeekMs && orderMs <= endOfWeek.getTime()) {
        thisWeekGrams += w;
        thisWeekRevenue += rev;
        thisWeekDirectCost += directCost;
        thisWeekOrders.push(o);

        if (printer === 'CC Abdalla') {
          thisWeekAbdallaGrams += w;
        } else if (printer === 'CC Mazen') {
          thisWeekMazenGrams += w;
        } else {
          thisWeekOtherGrams += w;
        }

        const dayIdx = Math.floor((orderMs - startOfWeekMs) / 86400000);
        if (dayIdx >= 0 && dayIdx < 7) {
          dailyBreakdown[dayIdx].totalGrams += w;
          dailyBreakdown[dayIdx].revenue += rev;
          if (printer === 'CC Abdalla') dailyBreakdown[dayIdx].abdallaGrams += w;
          else if (printer === 'CC Mazen') dailyBreakdown[dayIdx].mazenGrams += w;
        }
      }
    });

    const percentAchieved = goal > 0 ? Math.min(100, Math.round((thisWeekGrams / goal) * 100)) : 0;
    const remainingGrams = Math.max(0, goal - thisWeekGrams);
    const isGoalMet = thisWeekGrams >= goal;
    const thisWeekProfit = thisWeekRevenue - thisWeekDirectCost;

    return {
      goal,
      thisWeekGrams: Math.round(thisWeekGrams * 10) / 10,
      thisWeekAbdallaGrams: Math.round(thisWeekAbdallaGrams * 10) / 10,
      thisWeekMazenGrams: Math.round(thisWeekMazenGrams * 10) / 10,
      thisWeekOtherGrams: Math.round(thisWeekOtherGrams * 10) / 10,
      percentAchieved,
      remainingGrams: Math.round(remainingGrams * 10) / 10,
      isGoalMet,
      thisWeekRevenue: Math.round(thisWeekRevenue * 100) / 100,
      thisWeekDirectCost: Math.round(thisWeekDirectCost * 100) / 100,
      thisWeekProfit: Math.round(thisWeekProfit * 100) / 100,
      thisWeekOrders: thisWeekOrders.sort((a, b) => new Date(b.createdat || 0) - new Date(a.createdat || 0)),
      dailyBreakdown,
      weekRangeFormatted: `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    };
  }, [orders, pricingSettings.weekly_grams_goal, materials]);

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
        background: theme.canvas,
        borderBottom: `1px solid ${theme.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Top Header Row */}
        <div style={{
          height: isMobile ? 48 : 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 24px'
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={getAssetPath(isAppleDark ? "logo-dark.svg" : "logo-light.svg")}
              alt="Etba3ly"
              style={{ height: isMobile ? 22 : 26, width: 'auto', display: 'block' }}
            />
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '2px 6px',
              borderRadius: 980,
              background: isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              color: theme.textSecondary
            }}>
              Business
            </span>
          </div>

          {/* Desktop Navigation */}
          {!isMobile && (
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
          )}

          {/* User / Theme / Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
            <button
              onClick={toggleAppleTheme}
              title={isAppleDark ? 'Switch to Apple Business Light' : 'Switch to Apple Pro Dark'}
              style={{
                width: isMobile ? 30 : 32,
                height: isMobile ? 30 : 32,
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
                padding: isMobile ? '5px 10px' : '6px 14px',
                borderRadius: 980,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: theme.buttonPrimaryBg,
                color: theme.buttonPrimaryText,
                whiteSpace: 'nowrap'
              }}
            >
              {isMobile ? '+ Order' : '+ New Order'}
            </button>

            <button
              onClick={handleAdminLogout}
              style={{
                padding: isMobile ? '5px 8px' : '6px 12px',
                borderRadius: 980,
                fontSize: 12,
                fontWeight: 500,
                border: `1px solid ${theme.border}`,
                background: 'transparent',
                color: theme.textSecondary,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Scrollable Segmented Navigation */}
        {isMobile && (
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px 8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            borderTop: `1px solid ${theme.borderSubtle}`
          }}>
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
                  padding: '5px 12px',
                  borderRadius: 980,
                  fontSize: 12,
                  fontWeight: activeNav === tab.id ? 600 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  background: activeNav === tab.id ? (isAppleDark ? '#2c2c2e' : '#e5e5ea') : 'transparent',
                  color: activeNav === tab.id ? theme.text : theme.textSecondary
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. MAIN APP CONTAINER (DATA TABLE + SLIDE-OUT INSPECTOR SHEET) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: isMobile ? 'auto' : 'calc(100vh - 52px)',
        position: 'relative',
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'hidden'
      }}>
        {/* Main Content Area */}
        <div style={{
          flex: 1,
          padding: isMobile ? '14px 12px 28px' : '24px 32px',
          overflowY: 'auto',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Subheader / Action Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            marginBottom: isMobile ? 14 : 20,
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 12 : 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: theme.text }}>
                  {activeNav === 'orders' && 'Orders'}
                  {activeNav === 'fleet' && 'Devices'}
                  {activeNav === 'partners' && 'Finance & Production Goals'}
                  {activeNav === 'settings' && 'Workshop Settings'}
                  {activeNav === 'gallery' && 'Showcase Portfolio'}
                </h1>
                <span style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2, display: 'inline-block' }}>
                  {activeNav === 'orders' && `${filteredOrders.length} orders configured`}
                  {activeNav === 'fleet' && '2 CoreXY Elegoo Centauri Carbon devices active'}
                  {activeNav === 'partners' && `Weekly target: ${weeklyAnalytics.goal}g · Track partner production and direct earnings`}
                  {activeNav === 'settings' && 'Dynamic pricing rates and CMS settings'}
                  {activeNav === 'gallery' && `${galleryItems.length} published products`}
                </span>
              </div>

              {/* 4 Small Apple Metric Boxes */}
              {activeNav === 'orders' && (
                <div style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  maxWidth: isMobile ? '100%' : 'auto',
                  paddingBottom: isMobile ? 4 : 0
                }}>
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
                          padding: isMobile ? '4px 8px' : '5px 10px',
                          borderRadius: 8,
                          background: isActive
                            ? (isAppleDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                            : theme.surface,
                          border: `1px solid ${isActive ? (isAppleDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)') : theme.border}`,
                          color: theme.text,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                          flexShrink: 0,
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

            {/* Orders specific filters */}
            {activeNav === 'orders' && (
              <div style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: isMobile ? 'wrap' : 'nowrap',
                width: isMobile ? '100%' : 'auto',
                flexShrink: 0
              }}>
                {/* Search */}
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '5px 10px',
                  flex: isMobile ? '1 1 100%' : 'initial'
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
                      width: isMobile ? '100%' : 180
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
                    cursor: 'pointer',
                    flex: isMobile ? '1 1 calc(50% - 4px)' : 'initial'
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
                    cursor: 'pointer',
                    flex: isMobile ? '1 1 calc(50% - 4px)' : 'initial'
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
                    justifyContent: 'center',
                    gap: 6,
                    flex: isMobile ? '1 1 100%' : 'initial'
                  }}
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: ORDERS (RESPONSIVE CARDS ON PHONE, FULL TABLE ON DESKTOP) */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'orders' && (
            isMobile ? (
              /* Mobile Order Cards (No squishing, fits phone 100%) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredOrders.length === 0 ? (
                  <div style={{
                    padding: '36px 16px',
                    textAlign: 'center',
                    background: theme.surface,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    fontSize: 13
                  }}>
                    No orders found.
                  </div>
                ) : (
                  filteredOrders.map(order => {
                    const isSelected = selectedOrder?.id === order.id;
                    const printer = getPrinterFromNotes(order.notes) || 'Unassigned';
                    const weight = Number(order.weightgrams) || 0;
                    const price = Number(order.totalprice) || 0;
                    const paymentInfo = getOrderPaymentInfo(order);
                    const qualityInfo = getOrderQuality(order);

                    let statusColor = theme.textSecondary;
                    if (order.status === 'printing') statusColor = theme.statusOrange;
                    if (order.status === 'done') statusColor = theme.statusGreen;
                    if (order.status === 'cancelled') statusColor = theme.statusRed;

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          background: isSelected ? (isAppleDark ? '#2c2c2e' : '#f0f0f5') : theme.surface,
                          borderRadius: 12,
                          border: `1px solid ${isSelected ? theme.accent : theme.border}`,
                          padding: '14px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Header: Title & Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {order.ordername || 'Custom 3D Print'}
                            </div>
                            <div style={{ fontSize: 11.5, color: theme.textSecondary, marginTop: 2 }}>
                              {order.name || 'Client'} · {order.tracking_code || `#${String(order.id).slice(0, 6)}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
                            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', color: theme.text }}>
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Middle: Quality Badge & Specs */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: qualityInfo.tier === 'professional'
                              ? (isAppleDark ? 'rgba(175, 82, 222, 0.2)' : 'rgba(175, 82, 222, 0.12)')
                              : qualityInfo.tier === 'economy'
                              ? (isAppleDark ? 'rgba(255, 159, 10, 0.2)' : 'rgba(255, 149, 0, 0.12)')
                              : (isAppleDark ? 'rgba(41, 151, 255, 0.2)' : 'rgba(0, 113, 227, 0.12)'),
                            color: qualityInfo.tier === 'professional' ? '#af52de' : qualityInfo.tier === 'economy' ? theme.statusOrange : theme.accent,
                            letterSpacing: '0.02em'
                          }}>
                            {qualityInfo.label}
                          </span>
                          <span style={{ fontSize: 11.5, color: theme.textSecondary }}>
                            {order.material || 'PLA'} · {weight}g · {qualityInfo.infill}% infill
                          </span>
                        </div>

                        {/* Footer: Device & Price & Payment */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingTop: 8,
                          borderTop: `1px solid ${theme.borderSubtle}`
                        }}>
                          <span style={{
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: printer.includes('Abdalla') ? theme.accent : printer.includes('Mazen') ? '#af52de' : theme.textSecondary
                          }}>
                            {printer}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                              textTransform: 'uppercase'
                            }}>
                              {paymentInfo.status === 'paid' ? 'Paid' : paymentInfo.status === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: theme.text }}>
                              {price.toFixed(2)} EGP
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Desktop Table with scroll wrapper */
              <div style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}>
                <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
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
                      <th style={{ padding: '12px 18px' }}>Specifications & Quality</th>
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
                        const weight = Number(order.weightgrams) || 0;
                        const price = Number(order.totalprice) || 0;
                        const paymentInfo = getOrderPaymentInfo(order);
                        const qualityInfo = getOrderQuality(order);

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

                            {/* Specifications & Quality */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ color: theme.text, fontWeight: 500 }}>
                                {order.material || 'PLA'} · {weight}g
                              </div>
                              <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                                ~{getOrderPrintHours(order).toFixed(1)} hrs
                              </div>
                              {/* Quality Setting Badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: qualityInfo.tier === 'professional'
                                    ? (isAppleDark ? 'rgba(175, 82, 222, 0.2)' : 'rgba(175, 82, 222, 0.12)')
                                    : qualityInfo.tier === 'economy'
                                    ? (isAppleDark ? 'rgba(255, 159, 10, 0.2)' : 'rgba(255, 149, 0, 0.12)')
                                    : (isAppleDark ? 'rgba(41, 151, 255, 0.2)' : 'rgba(0, 113, 227, 0.12)'),
                                  color: qualityInfo.tier === 'professional' ? '#af52de' : qualityInfo.tier === 'economy' ? theme.statusOrange : theme.accent,
                                  letterSpacing: '0.02em'
                                }}>
                                  {qualityInfo.label}
                                </span>
                                <span style={{ fontSize: 10, color: theme.textSecondary }}>
                                  · {qualityInfo.infill}% infill
                                </span>
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
            )
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
                padding: isMobile ? '16px' : '20px 24px',
                display: 'flex',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: theme.buttonSecondaryBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.text,
                    flexShrink: 0
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
                        background: fleetData.abdalla.activeJob ? theme.statusOrange : theme.statusGreen,
                        flexShrink: 0
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
                <div style={{
                  display: isMobile ? 'grid' : 'flex',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : undefined,
                  gap: isMobile ? 12 : 32,
                  alignItems: isMobile ? 'stretch' : 'center',
                  width: isMobile ? '100%' : 'auto'
                }}>
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
                      cursor: 'pointer',
                      gridColumn: isMobile ? '1 / -1' : undefined,
                      width: isMobile ? '100%' : 'auto',
                      marginTop: isMobile ? 4 : 0
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
                padding: isMobile ? '16px' : '20px 24px',
                display: 'flex',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: theme.buttonSecondaryBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.text,
                    flexShrink: 0
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
                        background: fleetData.mazen.activeJob ? theme.statusOrange : theme.statusGreen,
                        flexShrink: 0
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
                <div style={{
                  display: isMobile ? 'grid' : 'flex',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : undefined,
                  gap: isMobile ? 12 : 32,
                  alignItems: isMobile ? 'stretch' : 'center',
                  width: isMobile ? '100%' : 'auto'
                }}>
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
                      cursor: 'pointer',
                      gridColumn: isMobile ? '1 / -1' : undefined,
                      width: isMobile ? '100%' : 'auto',
                      marginTop: isMobile ? 4 : 0
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
                padding: isMobile ? '14px 16px' : '16px 24px',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                gap: 8,
                fontSize: 13,
                color: theme.textSecondary
              }}>
                <div>Total combined fleet operating hours logged: <strong style={{ color: theme.text }}>{fleetData.totalFleetHours} hours</strong></div>
                <div>Active CoreXY Printers: <strong style={{ color: theme.text }}>2 (CC Abdalla, CC Mazen)</strong></div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: FINANCE & PRODUCTION GOALS */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'partners' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Card 1: Apple Production Target & Interactive Goal Setter */}
              <div style={{
                background: theme.surface,
                borderRadius: 14,
                border: `1px solid ${theme.border}`,
                padding: isMobile ? 18 : 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}>
                {/* Header row with headline and interactive goal input */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: isMobile ? 'stretch' : 'flex-start',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: 16
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: theme.textSecondary
                      }}>
                        Weekly Filament Target
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 980,
                        background: weeklyAnalytics.isGoalMet ? 'rgba(48, 209, 88, 0.15)' : 'rgba(41, 151, 255, 0.12)',
                        color: weeklyAnalytics.isGoalMet ? theme.statusGreen : theme.accent
                      }}>
                        {weeklyAnalytics.isGoalMet
                          ? `Goal Met (+${Math.round(weeklyAnalytics.thisWeekGrams - weeklyAnalytics.goal)}g)`
                          : `${weeklyAnalytics.percentAchieved}% of Target`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{
                        fontSize: isMobile ? 30 : 38,
                        fontWeight: 700,
                        color: theme.text,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {weeklyAnalytics.thisWeekGrams}
                      </span>
                      <span style={{ fontSize: 18, color: theme.textSecondary, fontWeight: 500 }}>
                        / {weeklyAnalytics.goal} g
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                      {weeklyAnalytics.isGoalMet
                        ? 'Target achieved for this week. Excellent output!'
                        : `${weeklyAnalytics.remainingGrams} g remaining to hit this week's goal`}
                    </div>
                  </div>

                  {/* Goal Adjustment Controls */}
                  <div style={{
                    background: theme.canvas,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    minWidth: isMobile ? '100%' : 260,
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>
                      Set Weekly Target (Grams)
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="number"
                          min="10"
                          step="50"
                          value={weeklyGoalInput}
                          onChange={e => setWeeklyGoalInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUpdateWeeklyGoal(weeklyGoalInput);
                            }
                          }}
                          placeholder="500"
                          style={{
                            width: '100%',
                            padding: '7px 28px 7px 10px',
                            borderRadius: 8,
                            background: theme.surface,
                            color: theme.text,
                            border: `1px solid ${theme.border}`,
                            fontSize: 13,
                            fontWeight: 600,
                            boxSizing: 'border-box'
                          }}
                        />
                        <span style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 11,
                          color: theme.textSecondary,
                          pointerEvents: 'none',
                          fontWeight: 600
                        }}>
                          g
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateWeeklyGoal(weeklyGoalInput)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 980,
                          background: theme.buttonPrimaryBg,
                          color: theme.buttonPrimaryText,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'opacity 0.15s ease'
                        }}
                      >
                        Save Target
                      </button>
                    </div>

                    {/* Presets */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 500, marginRight: 2 }}>Presets:</span>
                      {[250, 500, 750, 1000, 1500].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleUpdateWeeklyGoal(val)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 980,
                            fontSize: 10,
                            fontWeight: 600,
                            border: `1px solid ${weeklyAnalytics.goal === val ? theme.accent : theme.borderSubtle}`,
                            background: weeklyAnalytics.goal === val ? theme.accent : theme.surface,
                            color: weeklyAnalytics.goal === val ? '#ffffff' : theme.textSecondary,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {val}g
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Apple Multi-segment Progress Bar */}
                <div>
                  <div style={{
                    height: 12,
                    borderRadius: 999,
                    background: isAppleDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    overflow: 'hidden',
                    display: 'flex',
                    position: 'relative'
                  }}>
                    {/* Abdalla portion */}
                    <div
                      title={`Partner Abdalla: ${weeklyAnalytics.thisWeekAbdallaGrams}g`}
                      style={{
                        width: `${weeklyAnalytics.goal > 0 ? Math.min(100, (weeklyAnalytics.thisWeekAbdallaGrams / weeklyAnalytics.goal) * 100) : 0}%`,
                        background: '#2997ff',
                        transition: 'width 0.4s ease'
                      }}
                    />
                    {/* Mazen portion */}
                    <div
                      title={`Partner Mazen: ${weeklyAnalytics.thisWeekMazenGrams}g`}
                      style={{
                        width: `${weeklyAnalytics.goal > 0 ? Math.min(100 - (weeklyAnalytics.thisWeekAbdallaGrams / weeklyAnalytics.goal) * 100, (weeklyAnalytics.thisWeekMazenGrams / weeklyAnalytics.goal) * 100) : 0}%`,
                        background: '#af52de',
                        transition: 'width 0.4s ease'
                      }}
                    />
                    {/* Other unassigned */}
                    {weeklyAnalytics.thisWeekOtherGrams > 0 && (
                      <div
                        title={`Unassigned: ${weeklyAnalytics.thisWeekOtherGrams}g`}
                        style={{
                          width: `${weeklyAnalytics.goal > 0 ? Math.min(100 - ((weeklyAnalytics.thisWeekAbdallaGrams + weeklyAnalytics.thisWeekMazenGrams) / weeklyAnalytics.goal) * 100, (weeklyAnalytics.thisWeekOtherGrams / weeklyAnalytics.goal) * 100) : 0}%`,
                          background: theme.statusOrange,
                          transition: 'width 0.4s ease'
                        }}
                      />
                    )}
                  </div>

                  {/* Legend below bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginTop: 10,
                    fontSize: 12,
                    color: theme.textSecondary
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2997ff', display: 'inline-block' }} />
                        <span>Partner Abdalla: <strong style={{ color: theme.text }}>{weeklyAnalytics.thisWeekAbdallaGrams} g</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#af52de', display: 'inline-block' }} />
                        <span>Partner Mazen: <strong style={{ color: theme.text }}>{weeklyAnalytics.thisWeekMazenGrams} g</strong></span>
                      </div>
                      {weeklyAnalytics.thisWeekOtherGrams > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.statusOrange, display: 'inline-block' }} />
                          <span>Other: <strong style={{ color: theme.text }}>{weeklyAnalytics.thisWeekOtherGrams} g</strong></span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      Current Week: {weeklyAnalytics.weekRangeFormatted}
                    </div>
                  </div>
                </div>

                {/* Daily Production Activity (Mon - Sun) */}
                <div style={{
                  paddingTop: 16,
                  borderTop: `1px solid ${theme.borderSubtle}`
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                    Daily Production Breakdown
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 8,
                    alignItems: 'end',
                    height: 90
                  }}>
                    {weeklyAnalytics.dailyBreakdown.map((item, idx) => {
                      const maxDailyRef = Math.max(100, ...weeklyAnalytics.dailyBreakdown.map(d => d.totalGrams));
                      const barHeightPct = Math.min(100, Math.round((item.totalGrams / maxDailyRef) * 65));
                      const abdallaSharePct = item.totalGrams > 0 ? (item.abdallaGrams / item.totalGrams) * 100 : 0;
                      const mazenSharePct = item.totalGrams > 0 ? (item.mazenGrams / item.totalGrams) * 100 : 0;

                      return (
                        <div key={idx} style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                          gap: 5
                        }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: item.totalGrams > 0 ? theme.text : theme.textMuted
                          }}>
                            {item.totalGrams > 0 ? `${Math.round(item.totalGrams)}g` : '-'}
                          </span>

                          <div style={{
                            width: '100%',
                            maxWidth: 32,
                            height: 50,
                            borderRadius: 6,
                            background: isAppleDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                            display: 'flex',
                            flexDirection: 'column-reverse',
                            overflow: 'hidden',
                            border: item.isToday ? `1px solid ${theme.accent}` : 'none'
                          }}>
                            {item.totalGrams > 0 ? (
                              <div style={{
                                height: `${Math.max(14, barHeightPct)}%`,
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column-reverse',
                                borderRadius: 4,
                                overflow: 'hidden'
                              }}>
                                <div style={{ height: `${abdallaSharePct}%`, width: '100%', background: '#2997ff' }} />
                                <div style={{ height: `${mazenSharePct}%`, width: '100%', background: '#af52de' }} />
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: item.isToday ? 700 : 500,
                              color: item.isToday ? theme.accent : theme.textSecondary
                            }}>
                              {item.day}
                            </span>
                            {item.isToday && (
                              <span style={{ width: 4, height: 4, borderRadius: '50%', background: theme.accent, display: 'inline-block' }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card 2: Partner Performance Cards (Abdalla & Mazen) */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                {/* Partner Abdalla */}
                <div style={{
                  background: theme.surface,
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  padding: isMobile ? 18 : 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2997ff' }} />
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: theme.text }}>Partner Abdalla</h2>
                      </div>
                      <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 3 }}>
                        Hardware: Elegoo Centauri Carbon (CC Abdalla)
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 980,
                      background: fleetData.abdalla.activeJob ? 'rgba(255, 159, 10, 0.15)' : 'rgba(48, 209, 88, 0.15)',
                      color: fleetData.abdalla.activeJob ? theme.statusOrange : theme.statusGreen
                    }}>
                      {fleetData.abdalla.activeJob ? 'Printing' : 'Standby / Ready'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      This Week's Production
                    </div>
                    <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 700, margin: '4px 0', color: theme.text, letterSpacing: '-0.02em' }}>
                      {weeklyAnalytics.thisWeekAbdallaGrams} <span style={{ fontSize: 18, fontWeight: 500, color: theme.textSecondary }}>g</span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      {weeklyAnalytics.thisWeekGrams > 0
                        ? `${Math.round((weeklyAnalytics.thisWeekAbdallaGrams / weeklyAnalytics.thisWeekGrams) * 100)}% of weekly team output`
                        : 'No jobs printed this week yet'}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: '12px 14px',
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Realized Revenue
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginTop: 2 }}>
                        {fleetData.abdalla.revenue.toFixed(2)} EGP
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Machine Profit
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.accent, marginTop: 2 }}>
                        {fleetData.abdalla.profit.toFixed(2)} EGP
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        All-Time Filament
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 2 }}>
                        {fleetData.abdalla.grams} g
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Logged Runtime
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 2 }}>
                        {fleetData.abdalla.hours} hrs
                      </div>
                    </div>
                  </div>
                </div>

                {/* Partner Mazen */}
                <div style={{
                  background: theme.surface,
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  padding: isMobile ? 18 : 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#af52de' }} />
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: theme.text }}>Partner Mazen</h2>
                      </div>
                      <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 3 }}>
                        Hardware: Elegoo Centauri Carbon (CC Mazen)
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 980,
                      background: fleetData.mazen.activeJob ? 'rgba(255, 159, 10, 0.15)' : 'rgba(48, 209, 88, 0.15)',
                      color: fleetData.mazen.activeJob ? theme.statusOrange : theme.statusGreen
                    }}>
                      {fleetData.mazen.activeJob ? 'Printing' : 'Standby / Ready'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      This Week's Production
                    </div>
                    <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 700, margin: '4px 0', color: theme.text, letterSpacing: '-0.02em' }}>
                      {weeklyAnalytics.thisWeekMazenGrams} <span style={{ fontSize: 18, fontWeight: 500, color: theme.textSecondary }}>g</span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      {weeklyAnalytics.thisWeekGrams > 0
                        ? `${Math.round((weeklyAnalytics.thisWeekMazenGrams / weeklyAnalytics.thisWeekGrams) * 100)}% of weekly team output`
                        : 'No jobs printed this week yet'}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: '12px 14px',
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Realized Revenue
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginTop: 2 }}>
                        {fleetData.mazen.revenue.toFixed(2)} EGP
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Machine Profit
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#af52de', marginTop: 2 }}>
                        {fleetData.mazen.profit.toFixed(2)} EGP
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        All-Time Filament
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 2 }}>
                        {fleetData.mazen.grams} g
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        Logged Runtime
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 2 }}>
                        {fleetData.mazen.hours} hrs
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Financial & Production Economics (Replaces 40/40/20 Pools) */}
              <div style={{
                background: theme.surface,
                borderRadius: 14,
                border: `1px solid ${theme.border}`,
                padding: isMobile ? 18 : 24
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>
                      Financial & Production Economics
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      Direct operational performance and cashflow across active workshop orders
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 980,
                    background: theme.buttonSecondaryBg,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    Direct Partner Production Model
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: 12,
                  marginBottom: 20
                }}>
                  <div style={{
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: 14,
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                      Total Realized Revenue
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginTop: 4 }}>
                      {(fleetData.abdalla.revenue + fleetData.mazen.revenue).toFixed(2)} EGP
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      This week: {weeklyAnalytics.thisWeekRevenue.toFixed(2)} EGP
                    </div>
                  </div>

                  <div style={{
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: 14,
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                      Combined Net Profit
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: theme.statusGreen, marginTop: 4 }}>
                      {fleetData.totalNetProfit.toFixed(2)} EGP
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      This week: {weeklyAnalytics.thisWeekProfit.toFixed(2)} EGP
                    </div>
                  </div>

                  <div style={{
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: 14,
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                      Direct Material Costs
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginTop: 4 }}>
                      {((fleetData.abdalla.revenue - fleetData.abdalla.profit) + (fleetData.mazen.revenue - fleetData.mazen.profit)).toFixed(2)} EGP
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      This week: {weeklyAnalytics.thisWeekDirectCost.toFixed(2)} EGP
                    </div>
                  </div>

                  <div style={{
                    background: theme.canvas,
                    borderRadius: 10,
                    padding: 14,
                    border: `1px solid ${theme.borderSubtle}`
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase' }}>
                      Average Realized Rate
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: theme.accent, marginTop: 4 }}>
                      {(fleetData.abdalla.grams + fleetData.mazen.grams) > 0
                        ? ((fleetData.abdalla.revenue + fleetData.mazen.revenue) / (fleetData.abdalla.grams + fleetData.mazen.grams)).toFixed(2)
                        : '3.50'} EGP/g
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      Student baseline: 3.50 EGP/g
                    </div>
                  </div>
                </div>

                {/* Active / Recent Jobs Contributing to Target */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                    Jobs Contributing to Current Week ({weeklyAnalytics.thisWeekOrders.length})
                  </div>

                  {weeklyAnalytics.thisWeekOrders.length === 0 ? (
                    <div style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: theme.canvas,
                      borderRadius: 8,
                      border: `1px solid ${theme.borderSubtle}`,
                      fontSize: 12,
                      color: theme.textSecondary
                    }}>
                      No production jobs logged for the current week yet. Any order marked "Printing" or "Done" will immediately register grams here towards your {weeklyAnalytics.goal}g goal.
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}>
                      {weeklyAnalytics.thisWeekOrders.slice(0, 8).map(order => {
                        const printer = getPrinterFromNotes(order.notes) || 'Unassigned';
                        const w = Number(order.weightgrams) || 0;
                        const rev = Number(order.totalprice) || 0;
                        const orderDate = order.createdat ? new Date(order.createdat) : new Date();

                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 14px',
                              borderRadius: 8,
                              background: theme.canvas,
                              border: `1px solid ${theme.borderSubtle}`,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: printer === 'CC Abdalla' ? '#2997ff' : (printer === 'CC Mazen' ? '#af52de' : theme.textSecondary)
                              }} />
                              <div>
                                <div style={{ fontWeight: 600, color: theme.text }}>
                                  {order.ordername || 'Order'}
                                </div>
                                <div style={{ fontSize: 11, color: theme.textSecondary }}>
                                  {order.name} · {printer} · {orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: theme.text }}>
                                {w} g
                              </div>
                              <div style={{ fontSize: 11, color: theme.textSecondary }}>
                                {rev.toFixed(2)} EGP
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────── */}
          {/* VIEW: SETTINGS (PRICING & CMS) */}
          {/* ───────────────────────────────────────────────────────── */}
          {activeNav === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Website Content & Homepage Copy (CMS) */}
              <form onSubmit={handleSaveCMS} style={{
                background: theme.surface,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>
                      Website Content & Homepage Copy (CMS)
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      Edit headers, hero copy, and the "Why Print With Us?" section live on the website.
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingCMS}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 980,
                      background: theme.buttonPrimaryBg,
                      color: theme.buttonPrimaryText,
                      fontWeight: 600,
                      fontSize: 12,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {savingCMS ? 'Saving...' : 'Save Website Content'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Why Us Section Title
                    </label>
                    <input
                      type="text"
                      value={cmsData.why_title}
                      onChange={e => setCmsData({ ...cmsData, why_title: e.target.value })}
                      placeholder="e.g. Why Print With Us?"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      WhatsApp Contact Number
                    </label>
                    <input
                      type="text"
                      value={cmsData.whatsapp_number}
                      onChange={e => setCmsData({ ...cmsData, whatsapp_number: e.target.value })}
                      placeholder="e.g. 01012345678"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Student Rate (EGP/gram)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={cmsData.price_per_gram}
                      onChange={e => setCmsData({ ...cmsData, price_per_gram: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                    "Why Print With Us?" Paragraph Text
                  </label>
                  <textarea
                    rows={4}
                    value={cmsData.why_text}
                    onChange={e => setCmsData({ ...cmsData, why_text: e.target.value })}
                    placeholder="Describe your student workshop, speed, precision, and available materials..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
                    Clean copy only — raw comments are automatically stripped.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Hero Headline
                    </label>
                    <input
                      type="text"
                      value={cmsData.hero_title}
                      onChange={e => setCmsData({ ...cmsData, hero_title: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Hero Subtitle Description
                    </label>
                    <textarea
                      rows={2}
                      value={cmsData.hero_subtitle}
                      onChange={e => setCmsData({ ...cmsData, hero_subtitle: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 12, lineHeight: 1.4, fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              </form>

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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Micro-Order Threshold (Grams)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={pricingSettings.micro_order_weight_threshold || 17}
                      onChange={e => setPricingSettings({ ...pricingSettings, micro_order_weight_threshold: parseFloat(e.target.value) || 17 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                    <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
                      Orders below this weight activate the 50 EGP flat price.
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Micro-Order Flat Price (EGP)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={pricingSettings.micro_order_flat_price || 50}
                      onChange={e => setPricingSettings({ ...pricingSettings, micro_order_flat_price: parseFloat(e.target.value) || 50 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                    <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
                      Fixed flat rate applied for prints under 17g.
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                      Campus Pickup Minimum (EGP)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={pricingSettings.pickup_minimum}
                      onChange={e => setPricingSettings({ ...pricingSettings, pickup_minimum: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                    />
                    <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
                      Baseline minimum for on-campus student pickup.
                    </div>
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
                    <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
                      Courier shipping minimum order total.
                    </div>
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

                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                    <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse', fontSize: 12 }}>
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
        {/* 3. APPLE INSPECTOR SHEET (DRAWER ON MOBILE, STICKY ON DESKTOP) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {(() => {
          if (!selectedOrder) return null;
          const selectedQuality = getOrderQuality(selectedOrder);

          const inspectorContent = (
            <>
              <div style={{ padding: isMobile ? '16px 18px' : 24 }}>
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
                      fontSize: 22,
                      lineHeight: 1,
                      padding: '0 4px'
                    }}
                  >
                    &times;
                  </button>
                </div>

                {/* Apple Action Pills Row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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

                    {/* Quality Profile Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: theme.textSecondary }}>Quality Profile</span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: selectedQuality.tier === 'professional'
                          ? (isAppleDark ? 'rgba(175, 82, 222, 0.2)' : 'rgba(175, 82, 222, 0.12)')
                          : selectedQuality.tier === 'economy'
                          ? (isAppleDark ? 'rgba(255, 159, 10, 0.2)' : 'rgba(255, 149, 0, 0.12)')
                          : (isAppleDark ? 'rgba(41, 151, 255, 0.2)' : 'rgba(0, 113, 227, 0.12)'),
                        color: selectedQuality.tier === 'professional' ? '#af52de' : selectedQuality.tier === 'economy' ? theme.statusOrange : theme.accent
                      }}>
                        {selectedQuality.label}
                      </span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                      <span style={{ color: theme.textSecondary }}>Fulfillment Mode</span>
                      <strong style={{ color: theme.text, textTransform: 'capitalize' }}>{getDeliveryMode(selectedOrder)}</strong>
                    </div>
                    {/* Quality Settings Detailed Breakdown */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                      <span style={{ color: theme.textSecondary }}>Quality Preset</span>
                      <strong style={{
                        color: selectedQuality.tier === 'professional' ? '#af52de' : selectedQuality.tier === 'economy' ? theme.statusOrange : theme.accent,
                        textTransform: 'capitalize'
                      }}>
                        {selectedQuality.label}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                      <span style={{ color: theme.textSecondary }}>Layer Height</span>
                      <strong style={{ color: theme.text }}>{selectedQuality.layerHeight.toFixed(2)} mm</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.borderSubtle}`, paddingBottom: 8 }}>
                      <span style={{ color: theme.textSecondary }}>Infill Density</span>
                      <strong style={{ color: theme.text }}>{selectedQuality.infill}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>Supports Generation</span>
                      <strong style={{ color: selectedQuality.supports ? theme.statusGreen : theme.textSecondary }}>
                        {selectedQuality.supports ? 'Enabled (Active)' : 'Disabled (None)'}
                      </strong>
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
                padding: '14px 20px',
                borderTop: `1px solid ${theme.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8
              }}>
                <button
                  onClick={() => setSelectedOrder(null)}
                  style={{
                    padding: '6px 16px',
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
            </>
          );

          if (isMobile) {
            return (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.55)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  zIndex: 1000,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center'
                }}
                onClick={() => setSelectedOrder(null)}
              >
                <aside
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: '100%',
                    maxHeight: '88vh',
                    background: theme.inspectorBg,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    borderTop: `1px solid ${theme.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                    paddingBottom: 'env(safe-area-inset-bottom, 12px)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.border }} />
                  </div>
                  {inspectorContent}
                </aside>
              </div>
            );
          }

          return (
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
              {inspectorContent}
            </aside>
          );
        })()}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT ORDER DETAILS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isEditModalOpen && editingOrderData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 210,
          padding: isMobile ? 12 : 20
        }}>
          <form
            onSubmit={handleSaveOrderEdit}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: isMobile ? '20px 16px' : 28,
              maxWidth: 480,
              maxHeight: '90vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>Edit Order Details</div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

            {/* Quality Preset & Supports */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Quality Tier Preset
                </label>
                <select
                  value={editingOrderData.tier || 'standard'}
                  onChange={e => {
                    const newTier = e.target.value;
                    let lh = 0.20;
                    let inf = 20;
                    if (newTier === 'economy') { lh = 0.28; inf = 15; }
                    else if (newTier === 'professional') { lh = 0.12; inf = 25; }
                    setEditingOrderData({
                      ...editingOrderData,
                      tier: newTier,
                      layerHeight: lh,
                      infill: inf
                    });
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  <option value="economy">Economy (Draft 0.28mm)</option>
                  <option value="standard">Standard (0.20mm)</option>
                  <option value="professional">Professional (Fine 0.12mm)</option>
                  <option value="custom">Custom Settings</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Supports Generation
                </label>
                <select
                  value={editingOrderData.supports !== false ? 'yes' : 'no'}
                  onChange={e => setEditingOrderData({ ...editingOrderData, supports: e.target.value === 'yes' })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  <option value="yes">Enabled (Generate Supports)</option>
                  <option value="no">Disabled (No Supports)</option>
                </select>
              </div>
            </div>

            {/* Layer Height & Infill Density */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Layer Height (mm)
                </label>
                <input
                  type="number"
                  step="0.02"
                  value={editingOrderData.layerHeight || 0.20}
                  onChange={e => setEditingOrderData({ ...editingOrderData, layerHeight: parseFloat(e.target.value) || 0.20, tier: 'custom' })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Infill Density (%)
                </label>
                <input
                  type="number"
                  step="5"
                  value={editingOrderData.infill || 20}
                  onChange={e => setEditingOrderData({ ...editingOrderData, infill: parseInt(e.target.value, 10) || 20, tier: 'custom' })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: isMobile ? 12 : 20
        }}>
          <form
            onSubmit={handleCreateQuickOrder}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: isMobile ? '20px 16px' : 28,
              maxWidth: 480,
              maxHeight: '90vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>New Print Order</div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Quality Profile
                </label>
                <select
                  value={quickOrder.tier || 'standard'}
                  onChange={e => setQuickOrder({ ...quickOrder, tier: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: theme.canvas, color: theme.text, border: `1px solid ${theme.border}`, fontSize: 13 }}
                >
                  <option value="economy">Economy (Draft 0.28mm)</option>
                  <option value="standard">Standard (0.20mm)</option>
                  <option value="professional">Professional (Fine 0.12mm)</option>
                </select>
              </div>

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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
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

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                  Custom Price (Leave empty for dynamic)
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
                Create Order
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
