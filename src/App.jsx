import AdminDashboard from "./components/AdminDashboard";
import ServiceTierSelector, { SERVICE_TIERS } from "./components/ServiceTierSelector";
import ReviewInvoiceCard from "./components/ReviewInvoiceCard";
import {
  calculateOrderQuote,
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_MATERIAL_RATES,
  DEFAULT_SHIPPING_ZONES,
  parseFilamentCatalog,
  serializeFilamentCatalog,
  normalizeMaterialKey
} from "./utils/pricingEngine";
import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Html, useProgress, useGLTF, useEnvironment } from "@react-three/drei";
import * as THREE from "three";
import STLViewer from "./slicer/STLViewer.jsx";
import GalleryStudioUploader from "./utils/GalleryStudioUploader.jsx";
import { processPartImageFile } from "./utils/partImageProcessor.js";
import { upscaleImageFile } from "./utils/imageUpscaler.js";

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

const BENCHY_URL = getAssetPath("benchy.glb");
useGLTF.preload(BENCHY_URL);

const ENV_HDR_URL = getAssetPath("potsdamer_platz_1k.hdr");
try {
  useEnvironment.preload({ files: ENV_HDR_URL });
} catch {
  // Ignore preload error in SSR or headless testing
}

// ---------------------------------------------------------
// Supabase
// ---------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://gfswtgvsbvmuxywewxij.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PRINTERS = ["CC Abdalla", "CC Mazen"];
const VALID_ROUTES = ["", "home", "order", "track", "full-gallery", "boss", "why", "about", "contact", "gallery"];
const VALID_HASHES = ["", "#home", "#order", "#track", "#full-gallery", "#boss", "#why", "#about", "#contact", "#gallery"];

function parseCurrentRoute() {
  if (typeof window === "undefined") return "home";
  let path = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const base = (import.meta.env.BASE_URL || "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (base && path.startsWith(base)) {
    path = path.slice(base.length).replace(/^\/+/, "");
  }

  // Handle GitHub Pages project subpath (/3D-EJUST/ or /Etba3ly.store/)
  if (path.toLowerCase().startsWith("3d-ejust")) {
    path = path.slice("3d-ejust".length).replace(/^\/+/, "");
  } else if (path.toLowerCase().startsWith("etba3ly.store")) {
    path = path.slice("etba3ly.store".length).replace(/^\/+/, "");
  }

  const rawHash = (window.location.hash || "").replace(/^#\/?/, "");

  let route = path || rawHash || "home";
  route = route.toLowerCase();
  if (route === "gallery") route = "full-gallery";
  if (route === "" || route === "index.html") route = "home";
  return route;
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function getColorHex(colorName = "") {
  const c = String(colorName || "").toLowerCase().trim();
  if (c.startsWith("#")) return c;
  if (c.includes("white") || c.includes("marble")) return "#f8fafc";
  if (c.includes("black") || c.includes("carbon") || c.includes("obsidian")) return "#1e232a";
  if (c.includes("orange") || c.includes("mclaren")) return "#ff8000";
  if (c.includes("silver") || c.includes("grey") || c.includes("gray") || c.includes("titanium")) return "#94a3b8";
  if (c.includes("red") || c.includes("crimson")) return "#ef4444";
  if (c.includes("blue") || c.includes("sky") || c.includes("cobalt")) return "#3b82f6";
  if (c.includes("green") || c.includes("emerald")) return "#10b981";
  if (c.includes("yellow")) return "#eab308";
  if (c.includes("purple")) return "#8b5cf6";
  return "#1e232a";
}

function generateTrackingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "JP-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // continue to fallback
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.fontSize = "12pt";
    ta.style.border = "0";
    ta.style.padding = "0";
    ta.style.margin = "0";
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, 99999);
    const success = document.execCommand("copy");
    document.body.removeChild(ta);
    return success;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  }
}

// ---------------------------------------------------------
// Printer helpers -- parse/set printer tag in notes field
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// Payment helpers -- internal cash payment status (Admin Only)
// ---------------------------------------------------------
function getOrderPaymentInfo(order) {
  if (!order) return { status: "unpaid", paidAmount: 0 };

  // Direct database column support (if column exists in Supabase table)
  if (order.payment_status) {
    const status = String(order.payment_status).toLowerCase().trim();
    const cleanStatus = ["paid", "partial", "unpaid"].includes(status) ? status : "unpaid";
    const orderTotal = Number(order.totalprice || 0);
    const paidAmount = order.paid_amount !== undefined && order.paid_amount !== null && !isNaN(order.paid_amount)
      ? Number(order.paid_amount)
      : (cleanStatus === "paid" ? orderTotal : 0);
    return { status: cleanStatus, paidAmount };
  }

  // Graceful metadata fallback: check embedded tag in notes [PAYMENT:<status>:<amount>]
  const notes = order.notes || "";
  const match = notes.match(/\[PAYMENT:([^:\]]+)(?::([^\]]+))?\]/i);
  if (match) {
    const status = match[1].toLowerCase().trim();
    const cleanStatus = ["paid", "partial", "unpaid"].includes(status) ? status : "unpaid";
    const amt = match[2] ? parseFloat(match[2]) : (cleanStatus === "paid" ? Number(order.totalprice || 0) : 0);
    return { status: cleanStatus, paidAmount: isNaN(amt) ? 0 : amt };
  }

  return { status: "unpaid", paidAmount: 0 };
}

function setOrderPaymentInNotes(notes, status, paidAmount = 0) {
  const clean = (notes || "").replace(/\[PAYMENT:[^\]]+\]/gi, "").trim();
  const amt = parseFloat(paidAmount) || 0;
  const tag = `[PAYMENT:${status}:${amt}]`;
  return clean ? `${clean} ${tag}` : tag;
}

function getCleanNotes(notes) {
  if (!notes) return "";
  return notes
    .replace(/^\[PRINTER:[^\]]+\]\s*/, "")
    .replace(/^\[PROFILE:[^\]]+\]\s*/, "")
    .replace(/\[PAYMENT:[^\]]+\]/gi, "")
    .trim();
}

// ---------------------------------------------------------
// URL & Model Link Helpers
// ---------------------------------------------------------
function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  try {
    const parsed = new URL(s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.includes(".");
  } catch (_) {
    return false;
  }
}

function normalizeUrl(str) {
  if (!str) return "";
  const trimmed = str.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function getPlatformFromUrl(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  if (lower.includes("printables.com")) return { name: "Printables", color: "#FA6B1A" };
  if (lower.includes("makerworld.com")) return { name: "MakerWorld", color: "#00AE42" };
  if (lower.includes("thingiverse.com")) return { name: "Thingiverse", color: "#248BFB" };
  if (lower.includes("thangs.com")) return { name: "Thangs", color: "#6C5CE7" };
  if (lower.includes("cults3d.com")) return { name: "Cults3D", color: "#A020F0" };
  if (lower.includes("drive.google.com")) return { name: "Google Drive", color: "#34A853" };
  if (lower.includes("dropbox.com")) return { name: "Dropbox", color: "#0061FF" };
  if (lower.includes("onedrive.live.com") || lower.includes("1drv.ms")) return { name: "OneDrive", color: "#0078D4" };
  if (lower.includes("github.com")) return { name: "GitHub", color: "#8b949e" };
  return { name: "Web Link", color: "#FF8000" };
}

function AdminOrderCardFooter({ order, config, onUpdateWeight, onUpdatePrice }) {
  const rate = parseFloat(config.price_per_gram) || 0;

  const getComputedPrice = (w, p) => {
    if (p !== null && p !== undefined && !isNaN(Number(p))) {
      return Number(p).toFixed(2);
    }
    const weightNum = parseFloat(w) || 0;
    return (weightNum * rate).toFixed(2);
  };

  const [weightVal, setWeightVal] = useState(
    order.weightgrams !== null && order.weightgrams !== undefined ? String(order.weightgrams) : ""
  );
  const [priceVal, setPriceVal] = useState(getComputedPrice(order.weightgrams, order.totalprice));
  const [isManualPrice, setIsManualPrice] = useState(false);

  useEffect(() => {
    setWeightVal(order.weightgrams !== null && order.weightgrams !== undefined ? String(order.weightgrams) : "");
    setPriceVal(getComputedPrice(order.weightgrams, order.totalprice));
    setIsManualPrice(false);
  }, [order.id, order.weightgrams, order.totalprice, config.price_per_gram]);

  const handleWeightChange = (e) => {
    const val = e.target.value;
    setWeightVal(val);
    const w = parseFloat(val) || 0;
    const newAutoPrice = (w * rate).toFixed(2);
    setPriceVal(newAutoPrice);
    setIsManualPrice(false);
  };

  const commitWeight = () => {
    const w = parseFloat(weightVal) || 0;
    const p = parseFloat(priceVal) || (w * rate);
    onUpdateWeight(order.id, w, p);
  };

  const handlePriceChange = (e) => {
    setPriceVal(e.target.value);
    setIsManualPrice(true);
  };

  const commitPrice = () => {
    const p = parseFloat(priceVal);
    if (!isNaN(p)) {
      onUpdatePrice(order.id, Math.max(0, p));
    }
  };

  return (
    <div className="admin-order-footer" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ margin: 0, whiteSpace: "nowrap", fontSize: 12 }}>Weight (g)</label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={weightVal}
          placeholder="0"
          onChange={handleWeightChange}
          onBlur={commitWeight}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
              commitWeight();
            }
          }}
          style={{ width: 85, padding: "6px 10px", fontSize: 13 }}
          title="Change weight in grams - price updates automatically"
        />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        Rate: <strong style={{ color: "var(--text-primary)" }}>{config.price_per_gram} EGP/g</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <label style={{ margin: 0, whiteSpace: "nowrap", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
          Price (EGP)
        </label>
        <input
          type="number"
          step="0.5"
          min="0"
          value={priceVal}
          placeholder="0.00"
          onChange={handlePriceChange}
          onBlur={commitPrice}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
              commitPrice();
            }
          }}
          style={{
            width: 110,
            padding: "6px 10px",
            fontSize: 14,
            fontWeight: 900,
            color: isManualPrice ? "#60a5fa" : "var(--accent)",
            borderColor: isManualPrice ? "rgba(96, 165, 250, 0.4)" : undefined,
            textAlign: "right"
          }}
          title={isManualPrice ? "Custom manual price override" : "Calculated automatically from weight x rate"}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Archive (.zip & .rar) & STL validation helpers
// ---------------------------------------------------------
function inspectArchiveBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 7) {
    return { valid: false, hasStl: false, error: "File too small to be a valid archive." };
  }

  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isRar4 = bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1a && bytes[5] === 0x07 && bytes[6] === 0x00;
  const isRar5 = bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1a && bytes[5] === 0x07 && bytes[6] === 0x01 && bytes[7] === 0x00;

  if (!isZip && !isRar4 && !isRar5) {
    return { valid: false, hasStl: false, error: "Unsupported or corrupt archive format. Expected .zip or .rar." };
  }

  const stlFiles = [];

  // Method 1: Local file headers and central directory parsing for ZIP
  if (isZip) {
    let offset = 0;
    while (offset < bytes.length - 30) {
      if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
        const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
        const nameStart = offset + 30;
        if (nameStart + nameLen <= bytes.length) {
          const nameBytes = bytes.slice(nameStart, nameStart + nameLen);
          const name = new TextDecoder().decode(nameBytes);
          if (name.toLowerCase().endsWith(".stl") && !stlFiles.includes(name)) {
            stlFiles.push(name);
          }
        }
        offset += 30 + nameLen + extraLen;
      } else if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x01 && bytes[offset + 3] === 0x02) {
        const nameLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
        const extraLen = bytes[offset + 30] | (bytes[offset + 31] << 8);
        const commentLen = bytes[offset + 32] | (bytes[offset + 33] << 8);
        const nameStart = offset + 46;
        if (nameStart + nameLen <= bytes.length) {
          const nameBytes = bytes.slice(nameStart, nameStart + nameLen);
          const name = new TextDecoder().decode(nameBytes);
          if (name.toLowerCase().endsWith(".stl") && !stlFiles.includes(name)) {
            stlFiles.push(name);
          }
        }
        offset += 46 + nameLen + extraLen + commentLen;
      } else {
        offset++;
      }
    }
  }

  // Method 2: Comprehensive string scan across buffer for any .stl file references (covers RAR4, RAR5, and ZIP central directories)
  if (stlFiles.length === 0) {
    const text = new TextDecoder("latin1").decode(bytes);
    const matches = text.match(/[a-zA-Z0-9_\-\.\s\/\\]+\.stl\b/gi) || [];
    for (const match of matches) {
      const clean = match.trim().replace(/^[\x00-\x1F]+/, "");
      if (clean.toLowerCase().endsWith(".stl") && clean.length >= 5 && !clean.includes("\n") && !clean.includes("\r")) {
        const baseName = clean.split(/[\/\\]/).pop();
        if (baseName && baseName.toLowerCase().endsWith(".stl") && !stlFiles.includes(baseName)) {
          stlFiles.push(baseName);
        }
      }
    }
  }

  return {
    valid: true,
    type: isZip ? "zip" : "rar",
    stlFiles,
    hasStl: stlFiles.length > 0
  };
}

async function inspectArchiveForStl(file) {
  try {
    const startBytes = Math.min(file.size, 4 * 1024 * 1024);
    const startBuf = await file.slice(0, startBytes).arrayBuffer();
    const startCheck = inspectArchiveBuffer(startBuf);
    if (startCheck.hasStl) {
      return { hasStl: true, stlFiles: startCheck.stlFiles, type: startCheck.type };
    }

    if (file.size > startBytes) {
      const tailBytes = Math.min(file.size, 1024 * 1024);
      const tailBuf = await file.slice(file.size - tailBytes).arrayBuffer();
      const tailCheck = inspectArchiveBuffer(tailBuf);
      if (tailCheck.hasStl) {
        return { hasStl: true, stlFiles: tailCheck.stlFiles, type: tailCheck.type || startCheck.type };
      }
    }

    return { hasStl: false, type: startCheck.type || (file.name.toLowerCase().endsWith(".rar") ? "rar" : "zip"), error: "No .stl models found in archive." };
  } catch (err) {
    console.warn("Archive inspection error:", err);
    return { hasStl: true, fallback: true };
  }
}

function uploadFileWithProgress(file, fileName, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/stl-files/${encodeURIComponent(fileName)}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", "true");
    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    } else {
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress(pct, evt.loaded, evt.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ error: null });
      } else {
        supabase.storage.from("stl-files").upload(fileName, file)
          .then(res => {
            if (res.error) reject(res.error);
            else resolve(res);
          })
          .catch(reject);
      }
    };

    xhr.onerror = () => {
      supabase.storage.from("stl-files").upload(fileName, file)
        .then(res => {
          if (res.error) reject(res.error);
          else resolve(res);
        })
        .catch(reject);
    };

    xhr.send(file);
  });
}

// ---------------------------------------------------------
// 3D SCENE -- Abstract Geometry + 3D Print Icons
// ---------------------------------------------------------
class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.warn("Canvas 3D scene warning/fallback:", err);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

function SceneLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ color: "var(--accent)", fontWeight: "bold", fontSize: 20, whiteSpace: "nowrap", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{progress.toFixed(0)}%</div>
        <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.12em" }}>Loading</div>
      </div>
    </Html>
  );
}

function SceneReadyNotifier({ onReady }) {
  const renderedCount = useRef(0);
  useFrame(() => {
    if (renderedCount.current < 2) {
      renderedCount.current += 1;
      if (renderedCount.current === 2 && onReady) {
        onReady();
      }
    }
  });
  return null;
}

/* -- Gear Shape (3D printing icon) -- */
function GearShape({ position, scale = 1, color = "#FF8000" }) {
  const meshRef = useRef();
  const gearGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const teeth = 12;
    const innerR = 0.6;
    const outerR = 1.0;
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * Math.PI * 2;
      const a2 = ((i + 0.3) / teeth) * Math.PI * 2;
      const a3 = ((i + 0.5) / teeth) * Math.PI * 2;
      const a4 = ((i + 0.8) / teeth) * Math.PI * 2;
      const fn = i === 0 ? "moveTo" : "lineTo";
      shape[fn](Math.cos(a1) * innerR, Math.sin(a1) * innerR);
      shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
      shape.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
    }
    // Center hole
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.25, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.z += delta * 0.3;
  });

  return (
    <mesh ref={meshRef} geometry={gearGeo} position={position} scale={scale}>
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} />
    </mesh>
  );
}

/* -- 3DBenchy Floating Model (shared geometry + persistent per-user random filament colors) -- */
const BENCHY_COLOR_PALETTE = [
  "#FFFFFF", // Pure White
  "#00A8FF", // Electric Cyan
  "#2ECC71", // Emerald Green
  "#FF3B30", // Crimson Red
  "#A855F7", // Royal Purple
  "#FFD60A", // Cyber Yellow
  "#00D2D3", // Teal Mint
  "#FF6B81", // Coral Pink
  "#3B82F6", // Cobalt Blue
];

function getPersistentBenchyColors() {
  const STORAGE_KEY = "etba3ly_benchy_colors_v1";
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      Array.isArray(saved) &&
      saved.length === 3 &&
      saved.every((c) => typeof c === "string" && c.startsWith("#"))
    ) {
      return saved;
    }
  } catch {
    // ignore storage read errors
  }

  const pool = [...BENCHY_COLOR_PALETTE];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
  } catch {
    // ignore storage write errors
  }
  return picked;
}

function BenchyShape({ position, rotation = [0, 0, 0], scale = 0.66, spinSpeed = 0.25, color = "#ffffff" }) {
  const meshRef = useRef();
  const { nodes } = useGLTF(BENCHY_URL);
  const benchyGeo = useMemo(() => {
    const firstMesh = Object.values(nodes).find((n) => n && n.isMesh);
    return firstMesh ? firstMesh.geometry : null;
  }, [nodes]);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.22,
        metalness: 0.06,
        clearcoat: 0.45,
        clearcoatRoughness: 0.18,
        reflectivity: 0.6,
        envMapIntensity: 1.15,
        emissive: color,
        emissiveIntensity: 0.06,
      }),
    [color]
  );

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * spinSpeed;
    }
  });

  if (!benchyGeo) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={benchyGeo}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
    />
  );
}

/* -- Main 3D Scene -- */
function PrintScene() {
  const groupRef = useRef();
  const benchyColors = useMemo(() => getPersistentBenchyColors(), []);

  useFrame(() => {
    if (!groupRef.current) return;
    const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));

    // Responsive scale and position across phone, tablet, laptop, and desktop viewports
    const vw = window.innerWidth;
    const vh = Math.max(1, window.innerHeight);
    const aspect = vw / vh;
    const isMobile = vw <= 768;
    const isSmallPhone = vw <= 480;

    const frustumHalfHeight = 2.55; // camera z=7, fov=40deg
    const frustumHalfWidth = frustumHalfHeight * aspect;

    const desktopBaseScale = Math.min(0.95, Math.max(0.65, aspect * 0.55));
    const scale = isMobile
      ? (isSmallPhone ? 0.48 : 0.55)
      : desktopBaseScale * (1 - progress * 0.35);

    const maxSafePosX = Math.max(0.9, frustumHalfWidth - 2.35 * scale);
    const posX = isMobile ? 0 : Math.min(2.2 + progress * 0.6, maxSafePosX);
    const posY = isMobile ? (isSmallPhone ? 1.05 : 1.18) : 0;
    const rotY = progress * Math.PI * 0.5;

    groupRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.08);
    groupRef.current.position.lerp(new THREE.Vector3(posX, posY, 0), 0.08);
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    groupRef.current.quaternion.slerp(targetQuat, 0.08);
  });

  return (
    <group ref={groupRef}>
      {/* Central Torus Knot -- abstract hero piece */}
      <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.45}>
        <mesh position={[0, 0, 0]}>
          <torusKnotGeometry args={[0.8, 0.25, 128, 32]} />
          <meshPhysicalMaterial
            color="#FF8000"
            metalness={0.88}
            roughness={0.12}
            clearcoat={0.65}
            clearcoatRoughness={0.15}
            reflectivity={0.85}
            envMapIntensity={2.2}
          />
        </mesh>
      </Float>

      {/* 3 Same-Size Floating 3DBenchy Models in non-colliding orbits */}
      {/* Benchy 1 -- Top sector */}
      <Float speed={1.6} rotationIntensity={0.3} floatIntensity={0.35}>
        <BenchyShape
          position={[0.1, 1.92, 0.2]}
          rotation={[0.2, -0.65, -0.1]}
          scale={0.66}
          spinSpeed={-0.25}
          color={benchyColors[0]}
        />
      </Float>

      {/* Benchy 2 -- Bottom-left sector */}
      <Float speed={1.7} rotationIntensity={0.3} floatIntensity={0.35}>
        <BenchyShape
          position={[-1.58, -1.22, 0.35]}
          rotation={[-0.14, 0.85, 0.12]}
          scale={0.66}
          spinSpeed={0.22}
          color={benchyColors[1]}
        />
      </Float>

      {/* Benchy 3 -- Right sector */}
      <Float speed={1.8} rotationIntensity={0.3} floatIntensity={0.35}>
        <BenchyShape
          position={[1.95, 0.08, 0.25]}
          rotation={[0.15, -2.15, 0.1]}
          scale={0.66}
          spinSpeed={-0.22}
          color={benchyColors[2]}
        />
      </Float>

      {/* Gear 1 -- Top-left sector */}
      <Float speed={1.8} rotationIntensity={0.4} floatIntensity={0.4}>
        <GearShape position={[-1.92, 1.2, -0.45]} scale={0.5} color="#333333" />
      </Float>

      {/* Gear 2 -- Bottom-right sector */}
      <Float speed={1.6} rotationIntensity={0.4} floatIntensity={0.4}>
        <GearShape position={[1.65, -1.25, 0.25]} scale={0.35} color="#FFB347" />
      </Float>

      {/* Floating Octahedron -- Upper-right sector */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.35}>
        <mesh position={[1.82, 1.42, -0.35]} rotation={[0.3, 0.4, 0]}>
          <octahedronGeometry args={[0.38]} />
          <meshStandardMaterial color="#FF8000" metalness={0.9} roughness={0.05} envMapIntensity={3} />
        </mesh>
      </Float>

      {/* Small Torus -- Front-left detail */}
      <Float speed={1.3} rotationIntensity={0.25} floatIntensity={0.3}>
        <mesh position={[-0.55, -0.15, 1.2]} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.28, 0.075, 16, 32]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.2} />
        </mesh>
      </Float>

      {/* Cylinder -- Bottom nozzle detail */}
      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.35}>
        <mesh position={[0.55, -1.85, -0.35]} rotation={[0.2, 0, 0.5]}>
          <cylinderGeometry args={[0.06, 0.15, 0.6, 16]} />
          <meshStandardMaterial color="#FF8000" metalness={0.8} roughness={0.15} />
        </mesh>
      </Float>
    </group>
  );
}

// ===========================================================
// SVG ICONS
// ===========================================================
const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
);
const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const EyeSlashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);
const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
);
const WhatsAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
);
const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const CubeIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
);


// ===========================================================
// STATUS STEPPER
// ===========================================================
function StatusStepper({ status }) {
  const normalized = (status || "").toLowerCase().trim();
  const stepKeys = ["queued", "printing", "done"];
  const currentIdx = stepKeys.indexOf(normalized);
  const effectiveIdx = currentIdx === -1 ? 0 : currentIdx;
  const isDone = normalized === "done";

  const steps = [
    { key: "queued", label: "Queued", activeColor: "var(--status-queued)" },
    { key: "printing", label: "Printing", activeColor: "var(--status-printing)" },
    { key: "done", label: "Ready", activeColor: "var(--status-done)" }
  ];

  return (
    <div className="stepper">
      {steps.map((st, i) => {
        const isCompleted = isDone || i < effectiveIdx;
        const isActive = !isDone && i === effectiveIdx;
        const lineFilled = isDone || i <= effectiveIdx;

        return (
          <React.Fragment key={st.key}>
            {i > 0 && (
              <div 
                className={`stepper-line ${lineFilled ? "filled" : ""}`} 
                style={lineFilled ? { background: isDone ? "var(--status-done)" : "var(--status-printing)" } : {}}
              />
            )}
            <div className={`stepper-step ${isCompleted ? "completed" : ""} ${isActive ? `active status-${st.key}` : ""}`}>
              <div 
                className="stepper-dot"
                style={
                  isCompleted 
                    ? { background: "var(--status-done)", borderColor: "var(--status-done)", color: "#fff" }
                    : isActive 
                      ? { background: st.activeColor, borderColor: st.activeColor, color: "#fff", boxShadow: `0 0 16px ${st.activeColor}` }
                      : {}
                }
              >
                {isCompleted ? <CheckIcon /> : i + 1}
              </div>
              <span 
                className="stepper-label"
                style={isActive ? { color: st.activeColor, fontWeight: 800 } : isCompleted ? { color: "var(--text-primary)", fontWeight: 700 } : {}}
              >
                {st.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ===========================================================
// COPYABLE CODE
// ===========================================================
function CopyableCode({ code }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    const success = await copyToClipboard(code);
    if (success !== false) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }
  return (
    <div onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>{code}</span>
      <button type="button" className="copy-btn" onClick={(e) => { e.stopPropagation(); handleCopy(); }}>
        {copied ? "Copied!" : "Tap to Copy"}
      </button>
    </div>
  );
}

// ===========================================================
// 404 NOT FOUND PAGE
// ===========================================================
function NotFoundPage({ onGoHome }) {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onGoHome) onGoHome();
          else window.location.pathname = "/home";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onGoHome]);

  return (
    <section className="not-found-container animate-in">
      <div className="not-found-card">
        <div className="not-found-number">404</div>
        <h2 style={{ marginBottom: 12 }}>Page Not Found</h2>
        <p style={{ marginBottom: 16 }}>The page you're looking for doesn't exist or has been moved.</p>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
          Redirecting to home in <strong style={{ color: 'var(--accent)', fontSize: 18 }}>{countdown}</strong> seconds...
        </p>
        <a
          href="/home"
          className="btn btn-accent"
          onClick={(e) => {
            e.preventDefault();
            if (onGoHome) onGoHome();
            else window.location.pathname = "/home";
          }}
        >
          &larr; Go Home Now
        </a>
      </div>
    </section>
  );
}

// ===========================================================
// MAIN APPLICATION
// ===========================================================

const DEFAULT_CONFIG = {
  id: 1,
  brand_name: "Etba3ly",
  hero_title: "Your Idea.\nMade Real.",
  hero_subtitle: "Upload your 3D design, pick your material, and we'll print it for you -- fast, affordable, and right here on campus.",
  why_title: "Why Print With Us?",
  why_text: "We're students who love making things. Our setup is tuned for speed and precision, so you get your parts fast without breaking the bank. PLA, PETG, TPU -- we've got what you need.",
  price_per_gram: 3.5,
  micro_order_weight_threshold: 17,
  micro_order_flat_price: 50,
  pickup_minimum: 50,
  price_review_threshold: 300,
  materials: "PLA, PLA+, PETG, ABS, TPU, Carbon Fiber",
  colors: "White, Black, Silver, Red, Orange, Blue, Gray",
  whatsapp_number: "",
  whatsapp_api_key: "",
  telegram_bot_token: "8667555636:AAHo8iluJWpdDJjwKbo18TfqmRwh9wF_KD0",
  telegram_chat_id: "655459922",
  discord_webhook_url: "",
  instagram_link: "https://www.instagram.com/etba3ly_3d/",
  email_address: "3bdallahhahmed@gmail.com",
  show_socials: true,
  privacy_policy: ""
};

function FullGalleryView({ items, onItemClick, onGoHome }) {
  const fallbackItems = [
    { id: 'p1', title: "Custom Gears", description: "PLA -- Mechanical parts" },
    { id: 'p2', title: "Phone Stand", description: "PETG -- Functional design" },
    { id: 'p3', title: "Miniature Model", description: "PLA -- High detail" },
    { id: 'p4', title: "Drone Mount", description: "Carbon Fiber -- Lightweight" },
    { id: 'p5', title: "Enclosure", description: "ABS -- Heat resistant" },
    { id: 'p6', title: "Art Piece", description: "TPU -- Flexible material" },
    { id: 'p7', title: "Keycaps", description: "Resin -- Custom profile" },
    { id: 'p8', title: "Planter", description: "PLA -- Home decor" },
    { id: 'p9', title: "Robot Arm", description: "PETG -- Robotics" },
  ];
  const displayItems = items.length > 0 ? items : fallbackItems;

  return (
    <section className="gallery-section animate-in" style={{ paddingTop: 160, minHeight: "100vh", position: "relative", zIndex: 10 }}>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <h1>Full Gallery</h1>
        <p style={{ maxWidth: 500, margin: "0 auto" }}>Explore everything we've printed. From functional mechanical parts to beautiful art pieces.</p>
        <div style={{ marginTop: 24 }}>
          <a
            href="/home"
            className="btn btn-glass"
            onClick={(e) => {
              e.preventDefault();
              if (onGoHome) onGoHome();
              else window.location.pathname = "/home";
            }}
          >
            Back to Home
          </a>
        </div>
      </div>
      <div className="gallery-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {displayItems.map((item, i) => (
          <div key={item.id || i} className="gallery-card" style={{ cursor: item.media_urls ? 'pointer' : 'default' }} onClick={() => { if (item.media_urls && onItemClick) onItemClick(item); }}>
            <div className="gallery-card-img">{item.cover_url ? <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CubeIcon />}</div>
            <div className="gallery-card-body">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  // Capture ElectraGo referral code from URL (?ref=electrago)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) {
        localStorage.setItem("etba3ly_referral", ref.toLowerCase().trim());
      }
    } catch {}
  }, []);
  const [config, setConfig] = useState(() => {
    try {
      const cached = localStorage.getItem("etba3ly_cached_config");
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return DEFAULT_CONFIG;
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [queuedOrdersCount, setQueuedOrdersCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [materialRates, setMaterialRates] = useState(() => {
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
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("theme") !== "light";
    } catch {
      return true;
    }
  });
  const [currentRoute, setCurrentRoute] = useState(parseCurrentRoute);
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(() => setCanvasReady(true), []);

  useEffect(() => {
    // Safety fallback: ensure 3D canvas reveals even if network or WebGL stalls
    const timer = setTimeout(() => {
      setCanvasReady(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const hash = useMemo(() => {
    let r = currentRoute.toLowerCase();
    if (r === "home" || !r) return "#home";
    if (r === "gallery") r = "full-gallery";
    return `#${r}`;
  }, [currentRoute]);

  const navigateTo = useCallback((target) => {
    let clean = (target || "").replace(/^#\/?/, "").replace(/^\/+/, "");
    if (!clean || clean === "home") clean = "home";
    if (clean === "gallery") clean = "full-gallery";

    const isGhOld = typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/3d-ejust");
    const isGhNew = typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/etba3ly.store");
    const prefix = isGhOld ? "/3D-EJUST" : (isGhNew ? "/Etba3ly.store" : "");
    const targetPath = clean === "home" ? `${prefix}/home` : `${prefix}/${clean}`;
    try {
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, "", targetPath);
      }
    } catch (e) {
      window.location.hash = `#${clean}`;
    }

    setCurrentRoute(clean);

    if (clean !== "order") setOrderStep(1);
    setEditingGalleryItem(null);
    setActiveGalleryItem(null);
    setConfirmModal(null);
    setEditingOrder(null);
    setMobileMenuOpen(false);

    if (["why", "about", "contact"].includes(clean)) {
      setTimeout(() => {
        const el = document.getElementById(clean);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    active: false,
    percent: 0,
    currentFile: "",
    fileIndex: 0,
    totalFiles: 0,
    loadedBytes: 0,
    totalBytes: 0,
    stage: ""
  });
  const savedUserInfo = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("jp_user_info") || "{}"); } catch { return {}; }
  }, []);
  const [newOrder, setNewOrder] = useState({ name: savedUserInfo.name || "", phone: savedUserInfo.phone || "", email: savedUserInfo.email || "", orderName: "", material: "", color: "", notes: "", fileName: "", fileLink: "" });
  const [orderSourceTab, setOrderSourceTab] = useState("file");
  const [fileError, setFileError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [trackSearch, setTrackSearch] = useState("");
  const [trackResults, setTrackResults] = useState(null);
  const [adminTab, setAdminTab] = useState("orders");
  const [savingCMS, setSavingCMS] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [adminSearch, setAdminSearch] = useState("");
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [adminStatusFilter, setAdminStatusFilter] = useState("all");
  const [lastSubmittedQuote, setLastSubmittedQuote] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  // Gallery & Part Photo Studio state
  const [galleryItems, setGalleryItems] = useState([]);
  const [activeGalleryItem, setActiveGalleryItem] = useState(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [editingGalleryItem, setEditingGalleryItem] = useState(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryProcessing, setGalleryProcessing] = useState(false);
  const [convertingMediaUrl, setConvertingMediaUrl] = useState(null);
  const [upscalingMediaUrl, setUpscalingMediaUrl] = useState(null);
  const [editUploadUpscale, setEditUploadUpscale] = useState(false);
  const [newGalleryItem, setNewGalleryItem] = useState({ title: "", description: "" });
  const [newGalleryFiles, setNewGalleryFiles] = useState([]);

  // 3D Slicer, Estimation & Hardware Dispatch State
  const [selectedTier, setSelectedTier] = useState("standard");
  const [enableSupports, setEnableSupports] = useState(true);
  const [orderInfill, setOrderInfill] = useState(20);
  const [orderLayerHeight, setOrderLayerHeight] = useState(0.20);
  const [orderNozzle, setOrderNozzle] = useState(0.40);
  const [clientMetrics, setClientMetrics] = useState(null);
  const [copiedTrackingCode, setCopiedTrackingCode] = useState(false);
  const [adminSlicerOrder, setAdminSlicerOrder] = useState(null);
  const [moonrakerOrder, setMoonrakerOrder] = useState(null);
  const [moonrakerGcode, setMoonrakerGcode] = useState("");
  const [fleetLogs, setFleetLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jp_printer_fleet_logs_v1") || "[]"); } catch { return []; }
  });
  const [externalPrinterStates, setExternalPrinterStates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jp_external_printer_states") || "{}"); } catch { return {}; }
  });
  const [externalPromptPrinter, setExternalPromptPrinter] = useState(null);
  const [externalJobInput, setExternalJobInput] = useState("");
  const [externalJobWeight, setExternalJobWeight] = useState("");
  const [externalJobHours, setExternalJobHours] = useState("");
  const [emailDiagnosticStatus, setEmailDiagnosticStatus] = useState(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);

  // Admin Direct Order Creation State
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [newAdminOrder, setNewAdminOrder] = useState({
    name: "",
    phone: "",
    email: "",
    ordername: "",
    material: "",
    color: "",
    weightgrams: "",
    pricepergram: "",
    totalprice: "",
    fileurl: "",
    status: "queued",
    printer: PRINTERS[0] || "CC Abdalla",
    payment_status: "unpaid",
    paid_amount: 0,
    notes: ""
  });
  const [isCreatingAdminOrder, setIsCreatingAdminOrder] = useState(false);

  // Moonraker / Printer History Audit State
  const [isScanHistoryOpen, setIsScanHistoryOpen] = useState(false);
  const [moonrakerHost, setMoonrakerHost] = useState(() => localStorage.getItem("jp_moonraker_host") || "192.168.1.50");
  const [scanTargetPrinter, setScanTargetPrinter] = useState(PRINTERS[0] || "CC Abdalla");
  const [scannedJobs, setScannedJobs] = useState([]);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [isScanningHistory, setIsScanningHistory] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanTab, setScanTab] = useState("moonraker");

  function handleSetExternalJob(printer) {
    setExternalPromptPrinter(printer);
    setExternalJobInput("");
    setExternalJobWeight("");
    setExternalJobHours("");
  }

  function handleSaveExternalJob() {
    if (!externalPromptPrinter) return;
    const jobTitle = externalJobInput.trim() || "Direct USB / Offline Print";
    const weightNum = parseFloat(externalJobWeight) || 0;
    const speed = 35; // CoreXY average speed (g/hr)
    const hoursNum = parseFloat(externalJobHours) || (speed > 0 ? weightNum / speed : 0);
    const now = new Date().toISOString();
    const logId = `usb_${Date.now()}`;

    const newLog = {
      id: logId,
      printer: externalPromptPrinter,
      jobName: jobTitle,
      grams: weightNum,
      hours: hoursNum,
      timestamp: now
    };

    const updatedLogs = [newLog, ...fleetLogs];
    setFleetLogs(updatedLogs);
    localStorage.setItem("jp_printer_fleet_logs_v1", JSON.stringify(updatedLogs));

    const updatedStates = {
      ...externalPrinterStates,
      [externalPromptPrinter]: {
        status: "working",
        jobName: jobTitle,
        grams: weightNum,
        hours: hoursNum,
        timestamp: now,
        logId
      }
    };
    setExternalPrinterStates(updatedStates);
    localStorage.setItem("jp_external_printer_states", JSON.stringify(updatedStates));

    setExternalPromptPrinter(null);
    setExternalJobInput("");
    setExternalJobWeight("");
    setExternalJobHours("");
    addToast(`Marked ${externalPromptPrinter} as active (${weightNum > 0 ? `${weightNum}g, ` : ''}${hoursNum.toFixed(1)}h)`, "success");
  }

  function handleClearExternalJob(printer) {
    const updated = { ...externalPrinterStates };
    delete updated[printer];
    setExternalPrinterStates(updated);
    localStorage.setItem("jp_external_printer_states", JSON.stringify(updated));
    addToast(`${printer} marked as ready`, "info");
  }

  function handleDeleteFleetLog(logId) {
    const updated = fleetLogs.filter(l => l.id !== logId);
    setFleetLogs(updated);
    localStorage.setItem("jp_printer_fleet_logs_v1", JSON.stringify(updated));
    addToast("Fleet print log entry removed", "info");
  }

  function handleOpenMoonrakerForOrder(order, gcode = null) {
    setMoonrakerOrder(order);
    if (gcode) {
      setMoonrakerGcode(gcode);
    } else {
      setMoonrakerGcode(`; Centauri Job: ${order.ordername || 'Order'}\n; Tracking: ${order.tracking_code}\nG28\nM104 S220\nM140 S60\n`);
    }
  }

  async function handleMoonrakerDispatchSuccess(printerName) {
    if (moonrakerOrder) {
      await handleUpdateOrderStatus(moonrakerOrder.id, "printing", printerName);
      addToast(`Order ${moonrakerOrder.tracking_code} sent to ${printerName}`, "success");
    }
    setMoonrakerOrder(null);
  }

  const addToast = (msg, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Preload both logo variants for instant dark/light switching
  useEffect(() => {
    const dark = new Image();
    dark.src = getAssetPath("logo-dark.svg");
    const light = new Image();
    light.src = getAssetPath("logo-light.svg");
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  useEffect(() => {
    const brand = (config.brand_name && config.brand_name !== "JUST print" && config.brand_name !== "PrintQueue") ? config.brand_name : "Etba3ly";
    const routeTitles = {
      home: `${brand} Store -- 3D Printing Service Egypt & On-Demand 3D Store`,
      order: `Order 3D Print | ${brand} Store -- Instant Slicing & Quote`,
      track: `Track Order | ${brand} Store -- Live 3D Print Queue`,
      "full-gallery": `3D Print Gallery | ${brand} Store -- Custom Parts & Prototypes`,
      why: `Why Print With Us | ${brand} Store -- Rapid 3D Prototyping`,
      about: `About Us | ${brand} Store -- Student Engineering 3D Printing`,
      contact: `Contact Us | ${brand} Store -- WhatsApp & Email Support`,
      boss: `${brand} Admin Dashboard`
    };
    const newTitle = routeTitles[currentRoute] || `${brand} Store -- 3D Printing Service Egypt`;
    document.title = newTitle;
  }, [config.brand_name, currentRoute]);



  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsAdmin(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setIsAdmin(!!session));
    function handleLocationChange() {
      const nextRoute = parseCurrentRoute();
      if (nextRoute !== "order") {
        setOrderStep(1);
      }
      setEditingGalleryItem(null);
      setActiveGalleryItem(null);
      setConfirmModal(null);
      setEditingOrder(null);
      setMobileMenuOpen(false);
      setCurrentRoute(nextRoute);
    }
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchConfig();
    fetchGallery();

    // Only establish persistent Realtime WebSocket connections for admin or tracking views
    // to prevent saturating Supabase connection limits on general website traffic
    const shouldSubscribeRealtime = isAdmin || hash === "#track";
    if (!shouldSubscribeRealtime) return;

    let debounceOrdersTimer = null;
    const handleRealtimeOrders = () => {
      if (debounceOrdersTimer) clearTimeout(debounceOrdersTimer);
      debounceOrdersTimer = setTimeout(() => {
        fetchOrders();
      }, 500);
    };

    const sub = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleRealtimeOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, fetchConfig)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, fetchGallery)
      .subscribe();

    return () => {
      if (debounceOrdersTimer) clearTimeout(debounceOrdersTimer);
      supabase.removeChannel(sub);
    };
  }, [isAdmin, hash]);

  // Auto-load user's past orders if they exist
  useEffect(() => {
    async function loadSavedOrders() {
      try {
        const savedCodes = JSON.parse(localStorage.getItem("jp_tracking_codes") || "[]");
        if (savedCodes.length > 0 && trackSearch === "" && !trackResults) {
          const { data } = await supabase.rpc("get_saved_orders", { codes: savedCodes });
          if (data && data.length > 0) {
            setTrackResults(data);
          }
        }
      } catch (e) { console.error(e); }
    }
    loadSavedOrders();
  }, []);

  // Synchronize newOrder initial material and color with active CMS configuration
  useEffect(() => {
    const available = Object.values(materialRates).filter(m => m && m.in_stock !== false);
    setNewOrder(prev => {
      let updatedMaterial = prev.material;
      let updatedColor = prev.color;

      if (available.length > 0) {
        const isCurrentValid = prev.material && available.some(m => m.name.toLowerCase() === prev.material.toLowerCase());
        if (!isCurrentValid) {
          updatedMaterial = available[0].name;
        }
      } else if (config.materials) {
        const activeMats = config.materials.split(',').map(m => m.replace(/\[restocking\]/gi, '').trim()).filter(Boolean);
        if (activeMats.length > 0 && (!prev.material || !activeMats.some(m => m.toLowerCase() === prev.material.toLowerCase()))) {
          updatedMaterial = activeMats[0];
        }
      }

      if (config.colors) {
        const activeCols = config.colors.split(',').map(c => c.trim()).filter(Boolean);
        if (activeCols.length > 0 && (!prev.color || !activeCols.some(c => c.toLowerCase() === prev.color.toLowerCase()))) {
          updatedColor = activeCols[0];
        }
      }

      if (updatedMaterial !== prev.material || updatedColor !== prev.color) {
        return { ...prev, material: updatedMaterial, color: updatedColor };
      }
      return prev;
    });
  }, [materialRates, config.materials, config.colors]);

  // Scroll reveal -- re-run when hash/admin changes so newly-rendered sections get observed
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("active"); });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    // Small delay ensures the DOM has rendered new sections after a state change
    const timer = setTimeout(() => {
      document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    }, 100);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [hash, isAdmin]);

  // Handle cross-page hash scrolling
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (hash && !["#full-gallery", "#boss", "#order", "#track", "#home", ""].includes(hash)) {
      const el = document.getElementById(hash.replace("#", ""));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [hash]);

  async function fetchOrders() {
    if (isAdmin) {
      const { data } = await supabase.from("orders").select("*").order("createdat", { ascending: false });
      if (data) setOrders(data);
    } else {
      setOrders([]);
    }
    const { data: countData } = await supabase.rpc("get_queued_count");
    if (countData !== null) setQueuedOrdersCount(countData);
  }

  async function fetchConfig() {
    try {
      const { data, error } = await supabase.from("site_config").select("*").eq("id", 1).single();
      const storedThreshold = localStorage.getItem("centurai_price_review_threshold");
      const storedTelegramToken = localStorage.getItem("centurai_telegram_bot_token") || "8667555636:AAHo8iluJWpdDJjwKbo18TfqmRwh9wF_KD0";
      const storedTelegramChatId = localStorage.getItem("centurai_telegram_chat_id") || "655459922";
      const storedDiscordWebhook = localStorage.getItem("centurai_discord_webhook_url") || "";
      const storedWhatsappApiKey = localStorage.getItem("centurai_whatsapp_api_key") || "";

      if (data && !error) {
        const effectiveThreshold = data.price_review_threshold !== undefined && data.price_review_threshold !== null
          ? Number(data.price_review_threshold)
          : (storedThreshold ? parseFloat(storedThreshold) : 300);

        const cleanWhy = (data.why_text || DEFAULT_CONFIG.why_text)
          .replace(/\s*<!--RATES_CATALOG:.*?-->/s, '')
          .trim();

        const isLegacy =
          !data.hero_title ||
          data.hero_title.includes("F1") ||
          data.brand_name === "JUST print" ||
          data.brand_name === "PrintQueue" ||
          (data.why_title && data.why_title.includes("Speed"));

        const finalConfig = isLegacy ? {
          ...DEFAULT_CONFIG,
          ...data,
          telegram_bot_token: data.telegram_bot_token || storedTelegramToken,
          telegram_chat_id: data.telegram_chat_id || storedTelegramChatId,
          discord_webhook_url: data.discord_webhook_url || storedDiscordWebhook,
          whatsapp_api_key: data.whatsapp_api_key || storedWhatsappApiKey,
          brand_name: "Etba3ly",
          hero_title: DEFAULT_CONFIG.hero_title,
          hero_subtitle: DEFAULT_CONFIG.hero_subtitle,
          why_title: DEFAULT_CONFIG.why_title,
          why_text: cleanWhy || DEFAULT_CONFIG.why_text,
          materials: DEFAULT_CONFIG.materials,
          colors: DEFAULT_CONFIG.colors,
          price_per_gram: data.price_per_gram || DEFAULT_CONFIG.price_per_gram,
          price_review_threshold: effectiveThreshold,
        } : {
          ...data,
          why_text: cleanWhy || DEFAULT_CONFIG.why_text,
          telegram_bot_token: data.telegram_bot_token || storedTelegramToken,
          telegram_chat_id: data.telegram_chat_id || storedTelegramChatId,
          discord_webhook_url: data.discord_webhook_url || storedDiscordWebhook,
          whatsapp_api_key: data.whatsapp_api_key || storedWhatsappApiKey,
          price_review_threshold: effectiveThreshold,
        };

        setConfig(finalConfig);
        if (data.materials || data.why_text) {
          const effectiveStudentRate = parseFloat(finalConfig.price_per_gram) || 3.5;
          const activeRates = parseFilamentCatalog(data.materials, data.why_text, effectiveStudentRate);
          if (activeRates.pla && (Number(activeRates.pla.selling_rate) <= 2.0 || Number(activeRates.pla.selling_rate) < effectiveStudentRate)) {
            activeRates.pla.selling_rate = effectiveStudentRate;
          }
          if (activeRates.pla_plus && (Number(activeRates.pla_plus.selling_rate) <= 2.0 || Number(activeRates.pla_plus.selling_rate) < effectiveStudentRate)) {
            activeRates.pla_plus.selling_rate = effectiveStudentRate;
          }
          setMaterialRates(prev => ({ ...prev, ...activeRates }));
          try { localStorage.setItem('etba3ly_material_rates', JSON.stringify(activeRates)); } catch (e) {}
        }
        try { localStorage.setItem("etba3ly_cached_config", JSON.stringify(finalConfig)); } catch (e) {}
      } else {
        setConfig(prev => ({
          ...prev,
          telegram_bot_token: prev.telegram_bot_token || storedTelegramToken,
          telegram_chat_id: prev.telegram_chat_id || storedTelegramChatId,
          discord_webhook_url: prev.discord_webhook_url || storedDiscordWebhook,
          whatsapp_api_key: prev.whatsapp_api_key || storedWhatsappApiKey,
          ...(storedThreshold ? { price_review_threshold: parseFloat(storedThreshold) || 300 } : {})
        }));
      }
    } catch (err) {
      console.error("fetchConfig error:", err);
    } finally {
      setConfigLoaded(true);
    }
  }


  async function fetchGallery() {
    const { data } = await supabase.from("gallery_items").select("*").order("created_at", { ascending: false });
    if (data) setGalleryItems(data);
  }

  async function handleAddGalleryItem() {
    if (!newGalleryItem.title.trim()) { addToast("Title is required.", "error"); return; }
    if (newGalleryFiles.length === 0) { addToast("Upload at least one image.", "error"); return; }
    setGalleryUploading(true);
    try {
      const urls = [];
      for (const file of newGalleryFiles) {
        const ext = file.name.split('.').pop();
        const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('gallery-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('gallery-media').getPublicUrl(path);
        urls.push(publicUrl);
      }
      const cover = urls[0];
      const { error } = await supabase.from("gallery_items").insert({
        title: newGalleryItem.title,
        description: newGalleryItem.description,
        media_urls: urls.join(','),
        cover_url: cover
      });
      if (error) {
        console.error('Gallery insert error:', error);
        addToast("Failed to add: " + error.message, "error");
        return;
      }
      setNewGalleryItem({ title: "", description: "" });
      setNewGalleryFiles([]);
      fetchGallery();
      addToast("Gallery item added!", "success");
    } catch (err) {
      console.error('Add gallery item error:', err);
      addToast("Failed to add gallery item: " + err.message, "error");
    }
    setGalleryUploading(false);
  }

  async function handleDeleteGalleryItem(item) {
    if (!window.confirm(`Permanently delete "${item.title || 'item'}" from gallery?`)) return;
    try {
      if (item.media_urls) {
        const urls = item.media_urls.split(',').filter(Boolean);
        for (const url of urls) {
          const parts = url.split('/storage/v1/object/public/gallery-media/');
          const storagePath = parts.length > 1 ? decodeURIComponent(parts[1]) : url.split('/').pop();
          const { error: storageErr } = await supabase.storage.from('gallery-media').remove([storagePath]);
          if (storageErr) console.error('Storage delete error:', storagePath, storageErr);
        }
      }
      const { error: dbErr } = await supabase.from("gallery_items").delete().eq("id", item.id);
      if (dbErr) {
        console.error('DB delete error:', dbErr);
        addToast("Failed to delete: " + dbErr.message, "error");
      } else {
        addToast("Gallery item deleted permanently.", "success");
      }
      fetchGallery();
    } catch (err) {
      console.error('Delete gallery item error:', err);
      addToast("Delete failed: " + err.message, "error");
    }
  }

  async function handleSaveGalleryItem() {
    if (!editingGalleryItem) return;
    try {
      const { error } = await supabase.from("gallery_items").update({
        title: editingGalleryItem.title,
        description: editingGalleryItem.description,
        media_urls: editingGalleryItem.media_urls,
        cover_url: editingGalleryItem.cover_url
      }).eq("id", editingGalleryItem.id);
      if (error) {
        console.error('Gallery update error:', error);
        addToast("Failed to save: " + error.message, "error");
        return;
      }
      fetchGallery();
      setEditingGalleryItem(null);
      addToast("Gallery item updated.", "success");
    } catch (err) {
      console.error('Save gallery item error:', err);
      addToast("Save failed: " + err.message, "error");
    }
  }

  async function handleAddMediaToGalleryItem(files, shouldUpscale = false) {
    if (!editingGalleryItem || !files.length) return;
    setGalleryUploading(true);
    try {
      const existingUrls = editingGalleryItem.media_urls ? editingGalleryItem.media_urls.split(',').filter(Boolean) : [];
      for (const rawFile of files) {
        let fileToUpload = rawFile;
        if (shouldUpscale) {
          try {
            const upscaled = await upscaleImageFile(rawFile, 2);
            fileToUpload = upscaled.file;
            if (upscaled.previewUrl) URL.revokeObjectURL(upscaled.previewUrl);
          } catch (uErr) {
            console.warn("Could not upscale gallery image, uploading original:", uErr);
          }
        }
        const ext = fileToUpload.name ? fileToUpload.name.split('.').pop() : 'png';
        const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('gallery-media').upload(path, fileToUpload);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('gallery-media').getPublicUrl(path);
        existingUrls.push(publicUrl);
      }
      const updatedItem = { ...editingGalleryItem, media_urls: existingUrls.join(',') };
      if (!updatedItem.cover_url && existingUrls.length > 0) updatedItem.cover_url = existingUrls[0];
      setEditingGalleryItem(updatedItem);
      addToast(`Added ${files.length} photo(s).`, "success");
    } catch (err) {
      addToast("Upload failed: " + err.message, "error");
    }
    setGalleryUploading(false);
  }

  async function handleUpscaleExistingGalleryUrl(urlToUpscale, factor = 2) {
    if (!editingGalleryItem || !urlToUpscale) return;
    setUpscalingMediaUrl(urlToUpscale);
    try {
      const resp = await fetch(urlToUpscale);
      if (!resp.ok) throw new Error("Could not fetch image");
      const blob = await resp.blob();
      const ext = urlToUpscale.split('.').pop().split('?')[0] || (blob.type === 'image/jpeg' ? 'jpg' : 'png');
      const tempFile = new File([blob], `gallery_part.${ext}`, { type: blob.type || "image/png" });
      const upscaled = await upscaleImageFile(tempFile, factor);
      if (upscaled.previewUrl) URL.revokeObjectURL(upscaled.previewUrl);

      const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}_upscaled_${factor}x.${ext}`;
      const { error: uploadError } = await supabase.storage.from("gallery-media").upload(path, upscaled.file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("gallery-media").getPublicUrl(path);

      const urls = editingGalleryItem.media_urls
        .split(",")
        .filter(Boolean)
        .map((u) => (u === urlToUpscale ? publicUrl : u));
      const updatedItem = {
        ...editingGalleryItem,
        media_urls: urls.join(","),
        cover_url: editingGalleryItem.cover_url === urlToUpscale ? publicUrl : editingGalleryItem.cover_url,
      };
      setEditingGalleryItem(updatedItem);
      addToast(`Image upscaled to ${factor}x HD!`, "success");
    } catch (err) {
      console.error("Upscale existing image error:", err);
      addToast("Failed to upscale image: " + err.message, "error");
    }
    setUpscalingMediaUrl(null);
  }

  async function handleConvertExistingGalleryUrlToGlow(urlToConvert) {
    if (!editingGalleryItem || !urlToConvert) return;
    setConvertingMediaUrl(urlToConvert);
    try {
      const resp = await fetch(urlToConvert);
      if (!resp.ok) throw new Error("Could not fetch image");
      const blob = await resp.blob();
      const tempFile = new File([blob], "gallery_part.png", { type: blob.type || "image/png" });
      const processed = await processPartImageFile(tempFile);
      if (processed.previewUrl) URL.revokeObjectURL(processed.previewUrl);

      const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}_glow.png`;
      const { error: uploadError } = await supabase.storage.from("gallery-media").upload(path, processed.file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("gallery-media").getPublicUrl(path);

      const urls = editingGalleryItem.media_urls
        .split(",")
        .filter(Boolean)
        .map((u) => (u === urlToConvert ? publicUrl : u));
      const updatedItem = {
        ...editingGalleryItem,
        media_urls: urls.join(","),
        cover_url: editingGalleryItem.cover_url === urlToConvert ? publicUrl : editingGalleryItem.cover_url,
      };
      setEditingGalleryItem(updatedItem);
      addToast("Converted image to Etba3ly Glowing Orange background!", "success");
    } catch (err) {
      console.error("Convert existing image error:", err);
      addToast("Failed to convert image: " + err.message, "error");
    }
    setConvertingMediaUrl(null);
  }

  async function handleRemoveMediaFromGalleryItem(urlToRemove) {
    if (!editingGalleryItem) return;
    try {
      // Extract actual storage path from URL
      const parts = urlToRemove.split('/storage/v1/object/public/gallery-media/');
      const storagePath = parts.length > 1 ? decodeURIComponent(parts[1]) : urlToRemove.split('/').pop();
      const { error: storageErr } = await supabase.storage.from('gallery-media').remove([storagePath]);
      if (storageErr) console.error('Storage remove error:', storagePath, storageErr);
      
      const urls = editingGalleryItem.media_urls.split(',').filter(u => u !== urlToRemove);
      const updatedItem = { ...editingGalleryItem, media_urls: urls.join(',') };
      if (editingGalleryItem.cover_url === urlToRemove) {
        updatedItem.cover_url = urls[0] || '';
      }
      setEditingGalleryItem(updatedItem);
      addToast("Media file permanently deleted.", "success");
    } catch (err) {
      console.error('Remove media error:', err);
      addToast("Failed to remove media: " + err.message, "error");
    }
  }

  async function handleAdminLogin() {
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setLoginError(error.message);
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const invalid = files.filter(f => {
      const name = f.name.toLowerCase();
      return !name.endsWith(".stl") && !name.endsWith(".zip") && !name.endsWith(".rar");
    });
    if (invalid.length > 0) {
      setFileError("Only .stl, .zip, or .rar files accepted.");
      return;
    }

    // Inspect archives for STL models
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".zip") || lower.endsWith(".rar")) {
        const inspection = await inspectArchiveForStl(file);
        if (!inspection.hasStl) {
          setFileError(`No .stl 3D model files found inside archive "${file.name}". Please ensure your archive contains at least one .stl file.`);
          setSelectedFiles([]);
          setNewOrder(p => ({ ...p, fileName: "" }));
          return;
        }
      }
    }

    setFileError("");
    setSelectedFiles(files);
    setNewOrder(p => ({ ...p, fileName: files.map(f => f.name).join(", ") }));
  }

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 11) val = val.slice(0, 11);
    let formatted = val;
    if (val.length > 3 && val.length <= 7) formatted = `${val.slice(0, 3)} ${val.slice(3)}`;
    else if (val.length > 7) formatted = `${val.slice(0, 3)} ${val.slice(3, 7)} ${val.slice(7)}`;
    setNewOrder(p => ({ ...p, phone: formatted }));
  };

  async function handleOrderSubmit() {
    const errors = {};
    if (!newOrder.name) errors.name = "Name is required.";
    if (!newOrder.email) errors.email = "Email is required.";
    else if (!isValidEmail(newOrder.email)) errors.email = "Please enter a valid email.";
    if (!newOrder.phone) errors.phone = "Phone is required.";
    else if (!isValidEgyptPhone(newOrder.phone)) errors.phone = "Enter a valid Egyptian number (e.g. 01012345678).";
    
    const cleanLink = (newOrder.fileLink || "").trim();
    const hasFiles = selectedFiles.length > 0;
    const hasLink = Boolean(cleanLink);

    if (!hasFiles && !hasLink) {
      errors.file = "Please upload a 3D file (.stl, .zip, .rar) or share a model link.";
    }
    if (hasLink && !isValidUrl(cleanLink)) {
      errors.fileLink = "Please enter a valid URL (e.g. https://www.printables.com/model/...)";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsUploading(true);
    const totalBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    setUploadProgress({
      active: true,
      percent: hasFiles ? 5 : 50,
      currentFile: hasFiles ? (selectedFiles[0]?.name || "") : "Saving model link...",
      fileIndex: 1,
      totalFiles: selectedFiles.length || 1,
      loadedBytes: 0,
      totalBytes: totalBytes || 1,
      stage: hasFiles ? "uploading" : "saving"
    });

    try {
      let totalSize = 0;
      let uploadedBytesSoFar = 0;
      const urls = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;

        await uploadFileWithProgress(file, fileName, (filePercent, fileLoaded) => {
          const currentTotal = uploadedBytesSoFar + fileLoaded;
          const overallPercent = totalBytes > 0 ? Math.min(96, Math.round((currentTotal / totalBytes) * 100)) : filePercent;
          setUploadProgress({
            active: true,
            percent: Math.max(5, overallPercent),
            currentFile: file.name,
            fileIndex: i + 1,
            totalFiles: selectedFiles.length,
            loadedBytes: currentTotal,
            totalBytes,
            stage: "uploading"
          });
        });

        uploadedBytesSoFar += file.size;
        const { data: urlData } = supabase.storage.from("stl-files").getPublicUrl(fileName);
        urls.push(urlData.publicUrl);
        totalSize += file.size;
      }

      if (hasLink) {
        urls.push(normalizeUrl(cleanLink));
      }

      setUploadProgress(prev => ({ ...prev, percent: 98, stage: "saving" }));

      const trackingCode = generateTrackingCode();
      const modelWeightGrams = clientMetrics
        ? Number(clientMetrics.modelWeightGrams ?? clientMetrics.weightGrams ?? clientMetrics.filamentWeightGrams ?? 0)
        : 0;
      const supportWeightGrams = clientMetrics && enableSupports
        ? Number(clientMetrics.supportWeightGrams ?? 0)
        : 0;
      const weightGrams = clientMetrics
        ? Math.round((modelWeightGrams + (enableSupports ? supportWeightGrams : 0)) * 100) / 100
        : 0;
      const printHours = clientMetrics && clientMetrics.printingTimeSeconds
        ? (clientMetrics.printingTimeSeconds / 3600)
        : (weightGrams > 0 ? (weightGrams / 35) : 0.2);
      const deliveryMode = newOrder.deliveryMode || "pickup";
      const referralCode = typeof window !== "undefined" ? (localStorage.getItem("etba3ly_referral") || null) : null;

      const normMatKey = normalizeMaterialKey(newOrder.material || "PLA");
      const baseRate = parseFloat(config.price_per_gram) || 3.5;
      const customMatsWithActiveRate = { ...materialRates };
      const existingMatObj = customMatsWithActiveRate[normMatKey] || {};
      let resolvedRate = Number(existingMatObj.selling_rate) || baseRate;
      if ((normMatKey === "pla" || normMatKey === "pla_plus") && (resolvedRate < baseRate || resolvedRate <= 2.0)) {
        resolvedRate = baseRate;
      }
      customMatsWithActiveRate[normMatKey] = {
        ...existingMatObj,
        name: existingMatObj.name || newOrder.material || "PLA",
        selling_rate: resolvedRate,
        cost: Number(existingMatObj.cost) || 0.66
      };

      const quote = calculateOrderQuote({
        items: [{ weightGrams, printHours, materialKey: normMatKey }],
        deliveryMode,
        referralCode,
        customMaterials: customMatsWithActiveRate,
        customSettings: {
          micro_order_weight_threshold: parseFloat(config.micro_order_weight_threshold) || 17,
          micro_order_flat_price: parseFloat(config.micro_order_flat_price) || 50,
          pickup_minimum: parseFloat(config.pickup_minimum) || 50
        }
      });
      const microThreshold = parseFloat(config.micro_order_weight_threshold) || 17.0;
      const microFlatPrice = parseFloat(config.micro_order_flat_price) || 50.0;
      const isMicro = weightGrams > 0 && weightGrams < microThreshold;
      const calculatedTotal = deliveryMode === "shipping"
        ? quote.customerTotal
        : (weightGrams > 0 ? (isMicro ? microFlatPrice : Math.ceil(weightGrams * resolvedRate)) : microFlatPrice);
      const depositRequired = Math.ceil(calculatedTotal * 0.5);
      const remainingBalance = calculatedTotal - depositRequired;
      const cleanNotes = (newOrder.notes || "").trim();

      const firstAvailable = Object.values(materialRates).find(m => m && m.in_stock !== false);
      const defMat = firstAvailable ? firstAvailable.name : (config.materials ? config.materials.split(',')[0].trim() : "PLA");
      const defCol = config.colors ? config.colors.split(',')[0].trim() : "White";
      const finalMaterial = (newOrder.material || defMat).trim();
      const finalColor = (newOrder.color || defCol).trim();
      const fallbackName = hasLink && !hasFiles ? `${getPlatformFromUrl(cleanLink)?.name || 'Online'} 3D Model` : "Untitled Part";
      const orientedDimsStr = clientMetrics?.metrics
        ? `${clientMetrics.metrics.width}x${clientMetrics.metrics.depth}x${clientMetrics.metrics.height}mm`
        : null;

      const dynamicTags = [
        `[PROFILE:${selectedTier || "standard"}]`,
        `[TIER:${selectedTier || "standard"}]`,
        `[QUALITY:${selectedTier || "standard"}]`,
        `[LAYER:${Number(orderLayerHeight || 0.20).toFixed(2)}mm]`,
        `[INFILL:${orderInfill || 20}%]`,
        `[SUPPORTS:${enableSupports ? "yes" : "no"}]`,
        `[MODEL_G:${modelWeightGrams.toFixed(2)}]`,
        `[SUPPORT_G:${supportWeightGrams.toFixed(2)}]`,
        `[TOTAL_G:${weightGrams.toFixed(2)}]`,
        orientedDimsStr ? `[DIM:${orientedDimsStr}]` : null,
        `[DELIVERY:${deliveryMode || "pickup"}]`,
        `[DEPOSIT:${depositRequired || 0}]`,
        `[BALANCE:${remainingBalance || 0}]`,
        `[HOURS:${(quote.totalPrintHours || quote.printTimeHours || (weightGrams > 0 ? Number((weightGrams / 35).toFixed(1)) : 0.5)).toFixed(1)}]`,
        referralCode ? `[REF:${referralCode}]` : null
      ].filter(Boolean).join(" ");

      const fullNotes = `${cleanNotes ? cleanNotes + " " : ""}${dynamicTags}`.trim();

      const payload = {
        name: newOrder.name,
        phone: newOrder.phone.replace(/[\s\-()]/g, ""),
        email: newOrder.email || null,
        ordername: newOrder.orderName || fallbackName,
        material: finalMaterial,
        color: finalColor,
        notes: fullNotes,
        fileurl: urls.join(","),
        filesize: totalSize,
        status: "queued",
        priority: queuedOrdersCount,
        weightgrams: weightGrams,
        pricepergram: Math.round((quote.materialCharge / (weightGrams || 1)) * 100) / 100,
        totalprice: calculatedTotal,
        tracking_code: trackingCode,
        createdat: new Date().toISOString()
      };

      const { error: insertErr } = await supabase.from("orders").insert([payload]);
      if (insertErr) throw new Error(insertErr.message);

      // Dispatch automated order alerts across all configured channels (Email, Telegram, Discord, WhatsApp)
      dispatchAllOrderAlerts(payload);

      // Save user info for next time
      localStorage.setItem("jp_user_info", JSON.stringify({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email }));
      
      // Save tracking code for auto-tracking
      try {
        const savedCodes = JSON.parse(localStorage.getItem("jp_tracking_codes") || "[]");
        savedCodes.push(trackingCode);
        localStorage.setItem("jp_tracking_codes", JSON.stringify([...new Set(savedCodes)]));
      } catch (err) { console.error("Could not save tracking code", err); }

      setLastSubmittedQuote({
        orderName: payload.ordername,
        trackingCode,
        weightGrams,
        modelWeightGrams,
        supportWeightGrams,
        enableSupports,
        dimensions: orientedDimsStr,
        totalPrice: calculatedTotal,
        name: newOrder.name,
        material: finalMaterial,
        color: finalColor,
        tier: selectedTier
      });

      setUploadProgress({ active: false, percent: 100, currentFile: "", fileIndex: 0, totalFiles: 0, loadedBytes: 0, totalBytes: 0, stage: "" });
      setOrderStep(4);
      setSuccessModal(trackingCode);
      setCopiedTrackingCode(false);
      setNewOrder({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email, orderName: "", material: defMat, color: defCol, notes: "", fileName: "", fileLink: "" });
      setClientMetrics(null);
      setSelectedTier("standard");
      setEnableSupports(true);
      setOrderInfill(20);
      setOrderLayerHeight(0.20);
      setOrderNozzle(0.40);
      setFormErrors({});
      setSelectedFiles([]);
      fetchOrders();
    } catch (err) {
      console.error(err);
      addToast("Failed to submit order:\n" + (err.message || err), "error");
      setUploadProgress({ active: false, percent: 0, currentFile: "", fileIndex: 0, totalFiles: 0, loadedBytes: 0, totalBytes: 0, stage: "" });
    }
    setIsUploading(false);
  }

  async function triggerOrderEmail(type, orderRecord, oldRecord = null) {
    try {
      if (!orderRecord && type !== 'TEST' && type !== 'TEST_WHATSAPP') return;
      const { data, error } = await supabase.functions.invoke("email-notifier", {
        body: {
          type,
          table: "orders",
          record: orderRecord,
          old_record: oldRecord,
          admin_email: config.email_address || undefined,
          whatsapp_api_key: (config.whatsapp_api_key || "").trim() || undefined,
          whatsapp_number: (config.whatsapp_number || "").trim() || undefined,
          telegram_bot_token: (config.telegram_bot_token || localStorage.getItem("centurai_telegram_bot_token") || "8667555636:AAHo8iluJWpdDJjwKbo18TfqmRwh9wF_KD0").trim() || undefined,
          telegram_chat_id: (config.telegram_chat_id || localStorage.getItem("centurai_telegram_chat_id") || "655459922").trim() || undefined,
          discord_webhook_url: (config.discord_webhook_url || "").trim() || undefined
        }
      });
      if (error) {
        console.warn("Email notifier invocation returned notice:", error);
        return { success: false, error: error.message || error };
      }
      return { success: true, data };
    } catch (err) {
      console.warn("Could not trigger email notification:", err);
      return { success: false, error: err.message || String(err) };
    }
  }

  async function dispatchAllOrderAlerts(order) {
    if (!order) return;
    const trackingCode = order.tracking_code || order.id || "N/A";
    const clientName = order.name || "Customer";
    const clientPhone = order.phone || "N/A";
    const partName = order.ordername || order.orderName || "Custom Part";
    const material = order.material || "PLA";
    const color = order.color || "Standard";
    const weight = order.weightgrams ? `${order.weightgrams}g` : "Pending review";
    const total = order.totalprice !== undefined && order.totalprice !== null
      ? `${Number(order.totalprice).toFixed(2)} EGP`
      : "Pending review";
    const trackUrl = `https://etba3ly.store/#track?id=${encodeURIComponent(trackingCode)}`;

    const notesStr = order.notes || "";
    const tierMatch = notesStr.match(/\[(?:QUALITY|PROFILE|TIER):([^\]]+)\]/i);
    const tier = tierMatch ? tierMatch[1].trim().toLowerCase() : "standard";
    const layerMatch = notesStr.match(/\[LAYER:([^\]]+)\]/i);
    const layer = layerMatch ? layerMatch[1].trim() : (tier === "economy" ? "0.28mm" : tier === "professional" ? "0.12mm" : "0.20mm");
    const infillMatch = notesStr.match(/\[INFILL:([^\]]+)\]/i);
    const infill = infillMatch ? infillMatch[1].trim() : (tier === "economy" ? "15%" : tier === "professional" ? "25%" : "20%");
    const supportsMatch = notesStr.match(/\[SUPPORTS:([^\]]+)\]/i);
    const supports = supportsMatch ? supportsMatch[1].trim().toLowerCase() !== "no" : true;
    const tierLabel = tier === "economy" ? "Economy (Draft 0.28mm)" : tier === "professional" ? "Professional (Fine 0.12mm)" : tier === "custom" ? `Custom (${layer}, ${infill})` : "Standard (0.20mm)";

    // 1. Send confirmation & invoice email + cloud Telegram alert via backend edge function
    triggerOrderEmail("INSERT", order);

    // 2. Direct Telegram push fallback (with non-blocking 2s timeout)
    const tgToken = (config.telegram_bot_token || localStorage.getItem("centurai_telegram_bot_token") || "8667555636:AAHo8iluJWpdDJjwKbo18TfqmRwh9wF_KD0").trim();
    const tgChatId = (config.telegram_chat_id || localStorage.getItem("centurai_telegram_chat_id") || "655459922").trim();
    if (tgToken && tgChatId) {
      const tgText = `[NEW 3D PRINT ORDER]\n\n` +
        `Tracking: ${trackingCode}\n` +
        `Client: ${clientName}\n` +
        `Phone: ${clientPhone}\n` +
        `Part: ${partName}\n` +
        `Material: ${material} (${color})\n` +
        `Quality Profile: ${tierLabel} | Infill: ${infill} | Supports: ${supports ? "Yes" : "No"}\n` +
        `Weight: ${weight}\n` +
        `Total: ${total}\n\n` +
        (order.fileurl ? `Model / File Link:\n${order.fileurl}\n\n` : '') +
        `Live Tracking:\n${trackUrl}`;
      try {
        const ctl = new AbortController();
        const tid = setTimeout(() => ctl.abort(), 2000);
        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctl.signal,
          body: JSON.stringify({
            chat_id: tgChatId,
            text: tgText
          })
        }).then(() => clearTimeout(tid)).catch(() => clearTimeout(tid));
      } catch (e) {
        // Ignored; cloud edge function already dispatched
      }
    }

    // 3. Instant Discord webhook alert (100% free channel card)
    const dcWebhook = (config.discord_webhook_url || localStorage.getItem("centurai_discord_webhook_url") || "").trim();
    if (dcWebhook) {
      const discordFields = [
        { name: "Customer", value: `${clientName} (${clientPhone})`, inline: true },
        { name: "Material", value: `${material} - ${color}`, inline: true },
        { name: "Quality Profile", value: `${tierLabel} (${infill} infill)`, inline: true },
        { name: "Estimated Weight", value: weight, inline: true },
        { name: "Total Price", value: total, inline: true },
        { name: "Tracking Code", value: trackingCode, inline: true },
        { name: "Track Order", value: `[Open Tracking](${trackUrl})`, inline: true }
      ];
      if (order.fileurl) {
        discordFields.push({ name: "Model / File Link", value: String(order.fileurl).slice(0, 1000), inline: false });
      }

      fetch(dcWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `[NEW 3D PRINT ORDER] Tracking #${trackingCode}`,
          embeds: [{
            title: `Order: ${partName}`,
            color: 0xFF8000,
            fields: discordFields,
            footer: { text: "Centurai Print OS | Etba3ly" },
            timestamp: new Date().toISOString()
          }]
        })
      }).catch(err => console.warn("Discord alert error:", err));
    }

    // 4. Automated WhatsApp notification via CallMeBot (if configured)
    try {
      const rawAdminPhone = (config.whatsapp_number || "").replace(/\D/g, "");
      const intlAdminPhone = rawAdminPhone.startsWith("0") ? "2" + rawAdminPhone : rawAdminPhone;
      if (config.whatsapp_api_key && intlAdminPhone) {
        const alertMsg = `[Centurai Workshop Alert] New Order Received!\n` +
          `Tracking: ${trackingCode}\n` +
          `Client: ${clientName}\n` +
          `Phone: ${clientPhone}\n` +
          `Part: ${partName}\n` +
          `Material: ${material} (${color})\n` +
          `Quality: ${tierLabel} (${infill} infill)\n` +
          `Weight: ${weight}\n` +
          `Total: ${total}`;
        const botUrl = `https://api.callmebot.com/whatsapp.php?phone=${intlAdminPhone}&text=${encodeURIComponent(alertMsg)}&apikey=${encodeURIComponent(config.whatsapp_api_key.trim())}`;
        fetch(botUrl, { mode: "no-cors" }).catch(e => console.warn("CallMeBot alert dispatch warning:", e));
      }
    } catch (botErr) {
      console.warn("Could not dispatch automated WhatsApp notification:", botErr);
    }
  }

  async function handleTestEmail() {
    if (!config.email_address || !config.email_address.includes('@')) {
      addToast("Please configure a valid email address in Content Management first.", "error");
      return;
    }
    setIsTestingEmail(true);
    setEmailDiagnosticStatus({ state: "testing", message: "Sending test invoice email..." });
    try {
      const { data, error } = await supabase.functions.invoke("email-notifier", {
        body: {
          type: "TEST",
          email: config.email_address,
          admin_email: config.email_address,
          name: "Workshop Diagnostic",
          order: {
            name: "Workshop Diagnostic",
            email: config.email_address,
            phone: config.whatsapp_number || "01012345678",
            ordername: "Centurai Calibration Cube (20mm)",
            material: "PLA",
            color: "McLaren Orange",
            weightgrams: 45,
            pricepergram: parseFloat(config.price_per_gram) || 3,
            totalprice: 135,
            tracking_code: "JP-TEST99",
            fileurl: "https://www.printables.com/model/12345",
            status: "queued"
          }
        }
      });
      if (error) {
        throw new Error(error.message || "Failed to invoke email-notifier function");
      }
      if (data && data.error) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      setEmailDiagnosticStatus({
        state: "success",
        message: `Diagnostic test invoice sent successfully to ${config.email_address}! (Delivery ID: ${data?.id || "OK"})`
      });
      addToast("Test email invoice sent successfully! Check your inbox.", "success");
    } catch (err) {
      console.error("Test email diagnostic error:", err);
      setEmailDiagnosticStatus({
        state: "error",
        message: err.message || "Failed to send email. Check Supabase RESEND_API_KEY secret."
      });
      addToast("Email test failed: " + (err.message || "Check function logs"), "error");
    } finally {
      setIsTestingEmail(false);
    }
  }

  async function handleTestTelegram() {
    const token = (config.telegram_bot_token || localStorage.getItem("centurai_telegram_bot_token") || "8667555636:AAHo8iluJWpdDJjwKbo18TfqmRwh9wF_KD0").trim();
    const chatId = (config.telegram_chat_id || localStorage.getItem("centurai_telegram_chat_id") || "655459922").trim();
    if (!token || !chatId) {
      addToast("Please enter both your Telegram Bot Token and Chat ID first.", "error");
      return;
    }
    setIsTestingTelegram(true);
    try {
      // Dispatch via Supabase Edge Function in Frankfurt (bypasses Egyptian ISP blocks)
      const { data, error } = await supabase.functions.invoke("email-notifier", {
        body: {
          type: "TEST_TELEGRAM",
          telegram_bot_token: token,
          telegram_chat_id: chatId
        }
      });
      if (error) {
        throw new Error(error.message || "Failed to reach Telegram notification service.");
      }
      if (data && data.error) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      if (data && data.ok === false) {
        throw new Error(data.description || "Telegram API rejected the request.");
      }
      addToast("Telegram test message sent! Check your Telegram app.", "success");
    } catch (err) {
      console.error("Telegram test error:", err);
      addToast("Telegram test failed: " + (err.message || String(err)), "error");
    } finally {
      setIsTestingTelegram(false);
    }
  }

  async function handleTestDiscord() {
    const url = (config.discord_webhook_url || localStorage.getItem("centurai_discord_webhook_url") || "").trim();
    if (!url || !url.startsWith("https://discord.com/api/webhooks/")) {
      addToast("Please enter a valid Discord Webhook URL first.", "error");
      return;
    }
    setIsTestingDiscord(true);
    try {
      // 1. Dispatch via cloud edge function
      const { data, error } = await supabase.functions.invoke("email-notifier", {
        body: {
          type: "TEST_DISCORD",
          discord_webhook_url: url
        }
      });
      if (error) {
        // Fallback to direct client fetch
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "[Centurai Print OS] Test alert: Discord Webhook is connected successfully! New 3D printing orders will appear here automatically."
          })
        });
        if (!res.ok) throw new Error(`Discord returned status ${res.status}`);
      }
      addToast("Discord test message sent! Check your Discord channel.", "success");
    } catch (err) {
      console.error("Discord test error:", err);
      addToast("Discord test failed: " + err.message, "error");
    } finally {
      setIsTestingDiscord(false);
    }
  }

  async function handleTestWhatsApp() {
    const rawPhone = (config.whatsapp_number || "").replace(/\D/g, "");
    if (!rawPhone) {
      addToast("Please enter a WhatsApp phone number first.", "error");
      return;
    }
    if (!config.whatsapp_api_key || !config.whatsapp_api_key.trim()) {
      addToast("Please enter your CallMeBot WhatsApp API Key first.", "error");
      return;
    }
    const intlPhone = rawPhone.startsWith("0") ? "2" + rawPhone : rawPhone;
    setIsTestingWhatsApp(true);
    try {
      // 1. Dispatch cloud WhatsApp alert directly via backend edge function
      const { error } = await supabase.functions.invoke("email-notifier", {
        body: {
          type: "TEST_WHATSAPP",
          whatsapp_api_key: config.whatsapp_api_key.trim(),
          whatsapp_number: intlPhone
        }
      });

      // 2. Direct client-side fetch fallback
      const testMsg = `[Centurai Workshop Test] WhatsApp automated notification is configured and connected! Your workshop alerts will appear here.`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${intlPhone}&text=${encodeURIComponent(testMsg)}&apikey=${encodeURIComponent(config.whatsapp_api_key.trim())}`;
      fetch(url, { mode: "no-cors" }).catch(() => {});

      if (error) {
        console.warn("Backend WhatsApp test warning:", error);
      }
      addToast("WhatsApp test notification triggered! Check your WhatsApp.", "success");
    } catch (err) {
      console.error("CallMeBot test error:", err);
      addToast("Could not send WhatsApp test: " + err.message, "error");
    } finally {
      setIsTestingWhatsApp(false);
    }
  }

  async function handleUpdatePayment(id, status, paidAmount) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const cleanAmt = parseFloat(paidAmount) || 0;
    const updatedNotes = setOrderPaymentInNotes(order.notes, status, cleanAmt);

    // Optimistic local state update
    setOrders(prev => prev.map(o => o.id === id ? {
      ...o,
      payment_status: status,
      paid_amount: cleanAmt,
      notes: updatedNotes
    } : o));

    try {
      // Try updating direct columns first
      const { error: colErr } = await supabase.from("orders").update({
        payment_status: status,
        paid_amount: cleanAmt,
        notes: updatedNotes
      }).eq("id", id);

      if (colErr) {
        // Fallback: If payment columns are missing in DB, update notes only
        const { error: notesErr } = await supabase.from("orders").update({
          notes: updatedNotes
        }).eq("id", id);
        if (notesErr) throw notesErr;
      }
      addToast(`Payment updated: ${status.toUpperCase()}${status === 'partial' ? ` (${cleanAmt.toFixed(2)} EGP)` : ''}`, "success");
    } catch (err) {
      console.error("Could not update payment status:", err);
      addToast("Failed to update payment: " + (err.message || String(err)), "error");
      fetchOrders();
    }
  }

  async function handleAdminCreateOrder() {
    if (!newAdminOrder.name || !newAdminOrder.name.trim()) {
      addToast("Customer name is required.", "error");
      return;
    }
    if (!newAdminOrder.phone || !newAdminOrder.phone.trim()) {
      addToast("Customer phone number is required.", "error");
      return;
    }
    if (!isValidEgyptPhone(newAdminOrder.phone)) {
      addToast("Please enter a valid Egyptian phone number (e.g. 01012345678).", "error");
      return;
    }

    setIsCreatingAdminOrder(true);
    try {
      const trackingCode = generateTrackingCode();
      const weightNum = parseFloat(newAdminOrder.weightgrams) || 0;
      const rateNum = parseFloat(newAdminOrder.pricepergram) || (parseFloat(config.price_per_gram) || 3);
      const calculatedTotal = newAdminOrder.totalprice !== "" && !isNaN(parseFloat(newAdminOrder.totalprice))
        ? parseFloat(newAdminOrder.totalprice)
        : (weightNum * rateNum);
      const paidAmt = parseFloat(newAdminOrder.paid_amount) || (newAdminOrder.payment_status === "paid" ? calculatedTotal : 0);

      let finalNotes = (newAdminOrder.notes || "").trim();
      if (newAdminOrder.status === "printing" && newAdminOrder.printer) {
        finalNotes = setPrinterInNotes(finalNotes, newAdminOrder.printer);
      }
      finalNotes = setOrderPaymentInNotes(finalNotes, newAdminOrder.payment_status, paidAmt);

      const payload = {
        name: newAdminOrder.name.trim(),
        phone: newAdminOrder.phone.replace(/[\s\-()]/g, ""),
        email: (newAdminOrder.email || "").trim(),
        ordername: (newAdminOrder.ordername || "").trim() || "Manual Workshop Order",
        material: newAdminOrder.material || "PLA",
        color: newAdminOrder.color || "White",
        notes: finalNotes,
        fileurl: (newAdminOrder.fileurl || "").trim(),
        filesize: 0,
        status: newAdminOrder.status,
        priority: orders.length,
        weightgrams: weightNum,
        pricepergram: rateNum,
        totalprice: calculatedTotal,
        tracking_code: trackingCode,
        payment_status: newAdminOrder.payment_status,
        paid_amount: paidAmt
      };

      // 1. Try insert with payment columns
      const { error: insertErr } = await supabase.from("orders").insert([payload]);
      if (insertErr) {
        // Fallback: If payment_status/paid_amount columns do not exist in database, omit them and rely on notes tag
        const { payment_status, paid_amount, ...cleanPayload } = payload;
        const { error: fallbackErr } = await supabase.from("orders").insert([cleanPayload]);
        if (fallbackErr) throw fallbackErr;
      }

      // 2. Dispatch automated notifications across all configured channels (Email, Telegram, Discord, WhatsApp)
      dispatchAllOrderAlerts(payload);

      // 3. Refresh and toast
      await fetchOrders();
      setIsCreateOrderOpen(false);
      addToast(`Order ${trackingCode} created successfully!`, "success");
    } catch (err) {
      console.error("Admin create order error:", err);
      addToast("Failed to create order: " + (err.message || String(err)), "error");
    } finally {
      setIsCreatingAdminOrder(false);
    }
  }

  async function handleScanMoonraker() {
    if (!moonrakerHost || !moonrakerHost.trim()) {
      addToast("Please enter your printer's Moonraker IP address", "error");
      return;
    }
    setIsScanningHistory(true);
    setScanError(null);
    setScannedJobs([]);
    setSelectedJobIds([]);

    let rawHost = moonrakerHost.trim();
    if (!rawHost.startsWith("http://") && !rawHost.startsWith("https://")) {
      rawHost = `http://${rawHost}`;
    }
    // Default to port 7125 if not specified in host/IP
    try {
      const parsed = new URL(rawHost);
      if (!parsed.port) {
        parsed.port = "7125";
        rawHost = parsed.toString().replace(/\/$/, "");
      }
    } catch (e) {
      // Continue with rawHost
    }

    const savedLoggedIds = (() => {
      try { return JSON.parse(localStorage.getItem("jp_logged_moonraker_job_ids") || "[]"); } catch { return []; }
    })();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      const endpoint = `${rawHost}/server/history/list?limit=50`;
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const jobs = (json && json.result && Array.isArray(json.result.jobs)) ? json.result.jobs : [];
      
      if (jobs.length === 0) {
        addToast("Moonraker returned 0 print history jobs.", "info");
        setScannedJobs([]);
        return;
      }

      const parsedJobs = jobs.map(job => {
        const idStr = String(job.job_id);
        const isLogged = savedLoggedIds.includes(idStr);
        const durationSec = job.print_duration || 0;
        const durationHours = durationSec / 3600;
        
        let grams = 0;
        if (job.metadata && job.metadata.filament_weight_total) {
          grams = Number(job.metadata.filament_weight_total);
        } else if (job.filament_used) {
          grams = Number(job.filament_used) * 0.003;
        }

        const isCompleted = (job.status || "").toLowerCase() === "completed";
        const dateStr = job.end_time 
          ? new Date(job.end_time * 1000).toLocaleString() 
          : (job.start_time ? new Date(job.start_time * 1000).toLocaleString() : "Recent");

        return {
          jobId: idStr,
          filename: job.filename || "Untitled Print",
          status: job.status || "unknown",
          durationHours,
          grams,
          dateStr,
          isCompleted,
          isLogged
        };
      });

      setScannedJobs(parsedJobs);
      const defaultSelected = parsedJobs
        .filter(j => j.isCompleted && !j.isLogged)
        .map(j => j.jobId);
      setSelectedJobIds(defaultSelected);
      addToast(`Found ${jobs.length} history jobs (${defaultSelected.length} new completed)`, "success");

    } catch (err) {
      console.error("Moonraker history scan error:", err);
      setScanError(
        `Could not connect to Moonraker at ${rawHost}. Reason: ${err.name === 'AbortError' ? 'Connection timed out' : err.message}. ` +
        `Ensure your device is connected to the same workshop Wi-Fi network and your printer's moonraker.conf allows CORS (cors_domains: *).`
      );
    } finally {
      setIsScanningHistory(false);
    }
  }

  function handleApproveMoonrakerJobs() {
    const selectedJobs = scannedJobs.filter(j => selectedJobIds.includes(j.jobId));
    if (selectedJobs.length === 0) {
      addToast("Please select at least one job to add.", "error");
      return;
    }
    const totalHours = selectedJobs.reduce((sum, j) => sum + j.durationHours, 0);
    const totalGrams = selectedJobs.reduce((sum, j) => sum + j.grams, 0);
    
    const newLog = {
      id: `mr_${Date.now()}`,
      printer: scanTargetPrinter,
      jobName: `Moonraker Audit (${selectedJobs.length} jobs): ${selectedJobs.map(j => j.filename).slice(0, 2).join(', ')}${selectedJobs.length > 2 ? '...' : ''}`,
      grams: Math.round(totalGrams),
      hours: parseFloat(totalHours.toFixed(2)),
      notes: `Moonraker auto-audit at ${moonrakerHost}. Job IDs: ${selectedJobIds.join(', ')}`,
      timestamp: new Date().toISOString()
    };

    const updatedFleet = [newLog, ...(fleetLogs || [])];
    setFleetLogs(updatedFleet);
    localStorage.setItem("jp_printer_fleet_logs_v1", JSON.stringify(updatedFleet));

    const savedLoggedIds = (() => {
      try { return JSON.parse(localStorage.getItem("jp_logged_moonraker_job_ids") || "[]"); } catch { return []; }
    })();
    const newLogged = Array.from(new Set([...savedLoggedIds, ...selectedJobIds]));
    localStorage.setItem("jp_logged_moonraker_job_ids", JSON.stringify(newLogged));

    addToast(`Added ${totalHours.toFixed(1)} hrs and ${Math.round(totalGrams)}g to ${scanTargetPrinter} odometers!`, "success");
    setIsScanHistoryOpen(false);
  }

  async function handleAdminLogout() {
    await supabase.auth.signOut();
    navigateTo("home");
  }

  async function handleUpdateOrderStatus(id, newStatus, printer) {
    const updateData = { status: newStatus };
    const order = orders.find(o => o.id === id);
    if (order) {
      if (newStatus === "printing" && printer) {
        updateData.notes = setPrinterInNotes(order.notes, printer);
      } else if (newStatus !== "printing") {
        // Clear printer assignment when leaving printing status
        updateData.notes = setPrinterInNotes(order.notes, null);
      }
    }
    // Optimistic update: instantly reflect new status and printer notes
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updateData } : o));

    const { error } = await supabase.from("orders").update(updateData).eq("id", id);
    if (error) {
      addToast("Failed to update status: " + error.message, "error");
      fetchOrders();
    } else {
      if (order) {
        triggerOrderEmail("UPDATE", { ...order, ...updateData }, order);
      }
    }
  }

  async function handleDeleteOrder(id) {
    setConfirmModal({
      message: "Delete this order permanently?",
      onConfirm: async () => {
        try {
          // Optimistically remove from state
          setOrders(prev => prev.filter(o => o.id !== id));

          // Find the order to get its file URLs
          const order = orders.find(o => o.id === id);
          if (order && order.fileurl) {
            const fileUrls = order.fileurl.split(',').filter(Boolean);
            for (const url of fileUrls) {
              if (url.includes('/storage/v1/object/public/stl-files/')) {
                const parts = url.split('/storage/v1/object/public/stl-files/');
                const storagePath = parts.length > 1 ? decodeURIComponent(parts[1]) : url.split('/').pop();
                const { error: storageErr } = await supabase.storage.from('stl-files').remove([storagePath]);
                if (storageErr) console.error('STL storage delete error:', storagePath, storageErr);
              }
            }
          }
          const { error } = await supabase.from("orders").delete().eq("id", id);
          if (error) {
            addToast("Delete failed: " + error.message, "error");
            fetchOrders();
          } else {
            addToast("Order deleted permanently", "success");
          }
        } catch (err) {
          console.error('Delete order error:', err);
          addToast("Delete failed: " + err.message, "error");
          fetchOrders();
        }
        setConfirmModal(null);
      }
    });
  }

  async function handleUpdateWeight(id, weightStr, customPrice = null) {
    const weight = parseFloat(weightStr) || 0;
    const price = customPrice !== null && customPrice !== undefined && !isNaN(customPrice)
      ? parseFloat(customPrice)
      : weight * (parseFloat(config.price_per_gram) || 0);

    // Optimistic update: instantly reflect new weight and price
    setOrders(prev => prev.map(o => o.id === id ? { ...o, weightgrams: weight, pricepergram: config.price_per_gram, totalprice: price } : o));

    const { error } = await supabase.from("orders").update({ weightgrams: weight, pricepergram: config.price_per_gram, totalprice: price }).eq("id", id);
    if (error) {
      addToast("Failed to update weight: " + error.message, "error");
      fetchOrders();
    }
  }

  async function handleUpdatePrice(id, priceStr) {
    const price = parseFloat(priceStr);
    if (isNaN(price)) return;
    const finalPrice = Math.max(0, price);

    // Optimistic update: instantly reflect new totalprice
    setOrders(prev => prev.map(o => o.id === id ? { ...o, totalprice: finalPrice } : o));

    const { error } = await supabase.from("orders").update({ totalprice: finalPrice }).eq("id", id);
    if (error) {
      addToast("Failed to update price: " + error.message, "error");
      fetchOrders();
    } else {
      addToast(`Updated order price to ${finalPrice.toFixed(2)} EGP`, "success");
    }
  }

  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function isValidEgyptPhone(phone) { return /^01[0125]\d{8}$/.test(phone.replace(/[\s\-()]/g, "")); }

  function exportCSV() {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "ID,Name,Email,Phone,Order Name,Status,Material,Color,Weight,Total Price,Payment Status,Paid Amount,Tracking Code,Created At\n"
      + getSortedOrders().map(o => {
          const finalP = o.totalprice !== null && o.totalprice !== undefined ? o.totalprice : ((o.weightgrams || 0) * (config.price_per_gram || 0));
          const pay = getOrderPaymentInfo(o);
          return `"${o.id}","${o.name || ''}","${o.email || ''}","${o.phone || ''}","${o.ordername || ''}","${o.status}","${o.material || ''}","${o.color || ''}",${o.weightgrams || 0},${finalP},"${pay.status.toUpperCase()}",${pay.paidAmount.toFixed(2)},"${o.tracking_code || ''}","${o.createdat}"`;
        }).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getSortedOrders() {
    let result = [...orders];
    if (adminStatusFilter && adminStatusFilter !== "all") {
      result = result.filter(o => (o.status || "").toLowerCase().trim() === adminStatusFilter);
    }
    if (adminSearch.trim()) {
      const q = adminSearch.toLowerCase();
      result = result.filter(o => 
        (o.name && o.name.toLowerCase().includes(q)) || 
        (o.phone && o.phone.includes(q)) || 
        (o.ordername && o.ordername.toLowerCase().includes(q)) ||
        (o.tracking_code && o.tracking_code.toLowerCase().includes(q))
      );
    }
    switch (sortBy) {
      case "weight": return result.sort((a, b) => (b.weightgrams || 0) - (a.weightgrams || 0));
      case "filesize": return result.sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
      case "price": return result.sort((a, b) => (b.totalprice || 0) - (a.totalprice || 0));
      default: return result.sort((a, b) => new Date(b.createdat || 0) - new Date(a.createdat || 0));
    }
  }

  async function handleBulkStatus(newStatus) {
    if (selectedOrders.length === 0) return;
    const ordersToUpdate = orders.filter(o => selectedOrders.includes(o.id));
    await supabase.from("orders").update({ status: newStatus }).in("id", selectedOrders);
    fetchOrders();
    ordersToUpdate.forEach(o => {
      triggerOrderEmail("UPDATE", { ...o, status: newStatus }, o);
    });
    setSelectedOrders([]);
    addToast(`Updated ${selectedOrders.length} orders`, "success");
  }
  
  async function handleBulkDelete() {
    setConfirmModal({
      message: `Delete ${selectedOrders.length} orders permanently?`,
      onConfirm: async () => {
        await supabase.from("orders").delete().in("id", selectedOrders);
        fetchOrders();
        setSelectedOrders([]);
        setConfirmModal(null);
        addToast("Orders deleted", "success");
      }
    });
  }

  async function handleUpdateCMS(e) {
    e.preventDefault();
    setSavingCMS(true);
    const thresholdVal = Number(config.price_review_threshold) || 300;
    localStorage.setItem("centurai_price_review_threshold", String(thresholdVal));
    localStorage.setItem("centurai_telegram_bot_token", (config.telegram_bot_token || "").trim());
    localStorage.setItem("centurai_telegram_chat_id", (config.telegram_chat_id || "").trim());
    localStorage.setItem("centurai_discord_webhook_url", (config.discord_webhook_url || "").trim());
    localStorage.setItem("centurai_whatsapp_api_key", (config.whatsapp_api_key || "").trim());
    
    const dbPayload = { ...config, price_review_threshold: thresholdVal, id: 1 };
    let { error } = await supabase.from("site_config").upsert(dbPayload);
    if (error && error.message && error.message.toLowerCase().includes("column")) {
      const safeConfig = { ...dbPayload };
      delete safeConfig.telegram_bot_token;
      delete safeConfig.telegram_chat_id;
      delete safeConfig.discord_webhook_url;
      delete safeConfig.whatsapp_api_key;
      delete safeConfig.price_review_threshold;
      const retry = await supabase.from("site_config").upsert(safeConfig);
      error = retry.error;
    }

    if (error) {
      addToast("Failed to save config: " + error.message, "error");
    } else {
      try { localStorage.setItem("etba3ly_cached_config", JSON.stringify(dbPayload)); } catch (e) {}
      addToast("Configuration saved!", "success");
    }
    setSavingCMS(false);
  }

  async function handleTrackSearch() {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return;
    const { data } = await supabase.rpc("search_orders", { q });
    setTrackResults(data && data.length > 0 ? data : "NOT_FOUND");
  }

  // ===========================================================
  // LOGIN VIEW
  // ===========================================================
  if (hash === "#boss" && !isAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-page)' }}>
        <div className="bg-orbs"><div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/></div>
        <div className="card" style={{ maxWidth: 420, width: "100%", position: "relative", zIndex: 10, textAlign: "center" }}>
          <img src={getAssetPath(darkMode ? "logo-dark.svg" : "logo-light.svg")} alt="Etba3ly" className="brand-logo-img admin-logo" style={{ height: 42, margin: '0 auto 20px', display: 'block' }} />
          <h2 style={{ fontSize: 26, marginBottom: 8 }}>Admin Access</h2>
          <p style={{ fontSize: 14, marginBottom: 24 }}>Log in with your Supabase credentials.</p>
          <div style={{ marginBottom: 16 }}><input placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
          <div style={{ marginBottom: 24 }}><input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdminLogin()} /></div>
          {loginError && <div style={{ color: "#FF3B30", marginBottom: 16, fontSize: 13, fontWeight: 700 }}>{loginError}</div>}
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleAdminLogin}>Authenticate</button>
        </div>
      </div>
    );
  }

  // ===========================================================
  // ADMIN DASHBOARD (STRIPE / SHOPIFY REDESIGNED INTERFACE)
  // ===========================================================
  if (hash === "#boss" && isAdmin) {
    return (
      <AdminDashboard
        orders={orders}
        setOrders={setOrders}
        config={config}
        setConfig={setConfig}
        supabase={supabase}
        PRINTERS={PRINTERS}
        darkMode={darkMode}
        fetchOrders={fetchOrders}
        fetchConfig={fetchConfig}
        handleAdminLogout={handleAdminLogout}
        addToast={addToast}
        exportCSV={exportCSV}
        galleryItems={galleryItems}
        newGalleryItem={newGalleryItem}
        setNewGalleryItem={setNewGalleryItem}
        newGalleryFiles={newGalleryFiles}
        setNewGalleryFiles={setNewGalleryFiles}
        galleryUploading={galleryUploading}
        galleryProcessing={galleryProcessing}
        setGalleryProcessing={setGalleryProcessing}
        handleAddGalleryItem={handleAddGalleryItem}
        handleDeleteGalleryItem={handleDeleteGalleryItem}
        handleTestTelegram={handleTestTelegram}
        isTestingTelegram={isTestingTelegram}
        handleTestDiscord={handleTestDiscord}
        isTestingDiscord={isTestingDiscord}
        handleTestEmail={handleTestEmail}
        isTestingEmail={isTestingEmail}
        materials={materialRates}
        setMaterials={setMaterialRates}
      />
    );
  }

  // ===========================================================
  // PUBLIC WEBSITE
  // ===========================================================
  const brandName = (config.brand_name && config.brand_name !== "JUST print" && config.brand_name !== "PrintQueue") ? config.brand_name : "Etba3ly";

  return (
    <>
      {/* Animated Background Orbs */}
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
        <div className="bg-orb bg-orb-4" />
      </div>

      {/* 3D Canvas */}
      {hash !== "#order" && hash !== "#boss" && (
        <div className={`canvas-wrapper ${canvasReady ? "canvas-ready" : ""}`}>
          <div style={{ position: "sticky", top: 0, height: "100vh", width: "100%" }}>
            <CanvasErrorBoundary fallback={null}>
              <Canvas
                shadows={typeof window !== "undefined" && window.innerWidth > 768}
                dpr={[1, typeof window !== "undefined" && window.innerWidth <= 768 ? 1.5 : 2]}
                camera={{ position: [0, 0, 7], fov: 40 }}
                gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4, powerPreference: "high-performance" }}
                performance={{ min: 0.5 }}
              >
                <ambientLight intensity={0.4} />
                <directionalLight position={[8, 10, 5]} intensity={2.0} color="#ffffff" castShadow={typeof window !== "undefined" && window.innerWidth > 768} />
                <directionalLight position={[-6, -4, -6]} intensity={0.6} color="#FFB347" />
                <directionalLight position={[0, -8, 2]} intensity={0.3} color="#FF8000" />
                <pointLight position={[3, 3, 3]} intensity={0.8} color="#FF8000" distance={12} decay={2} />
                <Suspense fallback={null}>
                  <Environment files={ENV_HDR_URL} />
                  <PrintScene />
                  <SceneReadyNotifier onReady={handleCanvasReady} />
                </Suspense>
              </Canvas>
            </CanvasErrorBoundary>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="header">
        <a href="/home" className="logo" style={{ textDecoration: "none" }} onClick={(e) => { e.preventDefault(); navigateTo("home"); }} aria-label={brandName}>
          <img src={getAssetPath(darkMode ? "logo-dark.svg" : "logo-light.svg")} alt={brandName} className="brand-logo-img nav-logo" />
        </a>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="theme-toggle mobile-theme-toggle" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle Dark Mode" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "8px", display: "flex", alignItems: "center" }}>
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          
          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
            <span className={`hamburger ${mobileMenuOpen ? "open" : ""}`}>
              <span /><span /><span />
            </span>
          </button>
        </div>

        <div className={`nav-links ${mobileMenuOpen ? "nav-open" : ""}`}>
          <button className="theme-toggle desktop-theme-toggle" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle Dark Mode" title="Toggle Light/Dark Theme">
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <a href="/why" onClick={(e) => { e.preventDefault(); navigateTo("why"); }}>Why Us</a>
          <a href="/gallery" onClick={(e) => { e.preventDefault(); navigateTo("full-gallery"); }}>Gallery</a>
          <a href="/order" onClick={(e) => { e.preventDefault(); navigateTo("order"); }}>Order</a>
          <a href="/track" onClick={(e) => { e.preventDefault(); navigateTo("track"); }}>Track</a>
          <a href="/contact" onClick={(e) => { e.preventDefault(); navigateTo("contact"); }}>Contact</a>
        </div>
      </nav>

      {config.announcement_active && config.announcement_text && hash !== "#boss" && (
        <div style={{ background: "var(--accent-gradient)", color: "#fff", textAlign: "center", padding: "12px 24px", fontSize: 13.5, fontWeight: 700, marginTop: 96, maxWidth: 1280, marginInline: "auto", borderRadius: "var(--radius-sm)", position: "relative", zIndex: 50, boxShadow: "var(--accent-glow)" }}>
          {config.announcement_text}
        </div>
      )}

      <main>
        {hash === "#full-gallery" && <FullGalleryView items={galleryItems} onGoHome={() => navigateTo("home")} onItemClick={(item) => { setActiveGalleryItem(item); setActiveMediaIndex(0); }} />}
        
        {hash === "#order" && (
          <section className="section-container animate-in" style={{ paddingTop: 130, minHeight: "100vh", position: "relative", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div className="eyebrow-tag">3D SLICER & ORDER WORKSTATION</div>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 8 }}>{orderStep === 4 ? "Order Dispatched" : "Configure Your 3D Print"}</h1>
              {orderStep < 4 && <p style={{ margin: 0 }}>Step {orderStep} of 3 -- Instant STL Geometry & Weight Analysis</p>}
              {orderStep === 1 && <a href="/home" onClick={(e) => { e.preventDefault(); navigateTo("home"); }} style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>Return to Studio Home</a>}
            </div>
            
            {orderStep < 4 && (
              <div className="stepper" style={{ marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
                <div className={`stepper-step ${orderStep > 1 ? "completed" : ""} ${orderStep === 1 ? "active" : ""}`}>
                  <div className="stepper-dot">{orderStep > 1 ? <CheckIcon /> : "1"}</div>
                  <span className="stepper-label">Contact</span>
                </div>
                <div className={`stepper-line ${orderStep > 1 ? "filled" : ""}`} />
                <div className={`stepper-step ${orderStep > 2 ? "completed" : ""} ${orderStep === 2 ? "active" : ""}`}>
                  <div className="stepper-dot">{orderStep > 2 ? <CheckIcon /> : "2"}</div>
                  <span className="stepper-label">CAD & Slicer</span>
                </div>
                <div className={`stepper-line ${orderStep > 2 ? "filled" : ""}`} />
                <div className={`stepper-step ${orderStep > 3 ? "completed" : ""} ${orderStep === 3 ? "active" : ""}`}>
                  <div className="stepper-dot">{orderStep > 3 ? <CheckIcon /> : "3"}</div>
                  <span className="stepper-label">Review</span>
                </div>
              </div>
            )}

            <div className="card" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
              {orderStep === 1 && (
                <div className="animate-in">
                  <div className="form-row">
                    <div>
                      <label>Name *</label>
                      <input value={newOrder.name} onChange={e => setNewOrder(p => ({ ...p, name: e.target.value }))} placeholder="Your name" style={formErrors.name ? { borderColor: '#FF3B30' } : {}} />
                      {formErrors.name && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 6, fontWeight: 600 }}>{formErrors.name}</div>}
                    </div>
                    <div>
                      <label>Email *</label>
                      <input type="email" value={newOrder.email} onChange={e => setNewOrder(p => ({ ...p, email: e.target.value }))} placeholder="you@example.com" style={formErrors.email ? { borderColor: '#FF3B30' } : {}} />
                      {formErrors.email && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 6, fontWeight: 600 }}>{formErrors.email}</div>}
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Phone (Egypt) *</label>
                      <input value={newOrder.phone} onChange={handlePhoneChange} placeholder="010 1234 5678" style={formErrors.phone ? { borderColor: '#FF3B30' } : {}} />
                      {formErrors.phone && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 6, fontWeight: 600 }}>{formErrors.phone}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                    <button className="btn btn-accent" onClick={() => {
                      const errors = {};
                      if (!newOrder.name) errors.name = "Name is required.";
                      if (!newOrder.email) errors.email = "Email is required.";
                      else if (!isValidEmail(newOrder.email)) errors.email = "Please enter a valid email.";
                      if (!newOrder.phone) errors.phone = "Phone is required.";
                      else if (!isValidEgyptPhone(newOrder.phone)) errors.phone = "Enter a valid Egyptian number (e.g. 01012345678).";
                      setFormErrors(errors);
                      if (Object.keys(errors).length === 0) setOrderStep(2);
                    }}>Continue to CAD Upload</button>
                  </div>
                </div>
              )}

              {orderStep === 2 && (
                <div className="animate-in">
                  <div className="form-row">
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label>Project Name</label>
                      <input value={newOrder.orderName} onChange={e => setNewOrder(p => ({ ...p, orderName: e.target.value }))} placeholder="My Part" />
                    </div>
                  </div>
                  
                  <div className="form-row" style={{ marginBottom: 16 }}>
                    <div style={{ width: "100%" }}>
                      <label>Material</label>
                      <select value={newOrder.material} onChange={e => setNewOrder(p => ({ ...p, material: e.target.value }))}>
                        {materialRates && Object.keys(materialRates).length > 0 ? (
                          Object.entries(materialRates).map(([k, m]) => {
                            const isRestocking = m.in_stock === false;
                            return (
                              <option key={k} value={m.name} disabled={isRestocking}>
                                {m.name}{isRestocking ? ' (Restocking soon)' : ''}
                              </option>
                            );
                          })
                        ) : config.materials ? (
                          config.materials.split(',').map(m => {
                            const raw = m.trim();
                            const isRestocking = raw.toLowerCase().includes('[restocking]');
                            const cleanName = raw
                              .replace(/\[restocking\]/gi, '')
                              .replace(/\[rate:[\d.]+\]/gi, '')
                              .replace(/\[cost:[\d.]+\]/gi, '')
                              .trim();
                            if (!cleanName) return null;
                            return (
                              <option key={cleanName} value={cleanName} disabled={isRestocking}>
                                {cleanName}{isRestocking ? ' (Restocking soon)' : ''}
                              </option>
                            );
                          })
                        ) : <option value="PLA">PLA</option>}
                      </select>
                    </div>
                  </div>

                  {/* Visual Filament Color Swatches */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ margin: 0 }}>Filament Color</label>
                      <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 800 }}>{newOrder.color || "Select Color"}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(config.colors || "White, Black, Silver, Red").split(',').map(c => {
                        const colorName = c.trim();
                        if (!colorName) return null;
                        const hex = getColorHex(colorName);
                        const isSelected = (newOrder.color || "").toLowerCase().trim() === colorName.toLowerCase().trim();
                        return (
                          <button
                            key={colorName}
                            type="button"
                            onClick={() => setNewOrder(p => ({ ...p, color: colorName }))}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "7px 14px",
                              borderRadius: "var(--radius-full)",
                              background: isSelected ? "rgba(255,128,0,0.15)" : "var(--bg-glass-strong)",
                              border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border-glass-strong)",
                              color: isSelected ? "var(--accent)" : "var(--text-primary)",
                              fontWeight: isSelected ? 800 : 500,
                              fontSize: 13,
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              boxShadow: isSelected ? "0 0 12px rgba(255,128,0,0.3)" : "none",
                            }}
                          >
                            <span
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                background: hex,
                                border: "1px solid rgba(255,255,255,0.4)",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                display: "inline-block",
                                flexShrink: 0
                              }}
                            />
                            <span>{colorName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Service Tier Selection */}
                  <ServiceTierSelector
                    selectedTier={selectedTier}
                    onSelectTier={(tierKey) => setSelectedTier(tierKey)}
                    orderInfill={orderInfill}
                    setOrderInfill={setOrderInfill}
                    orderLayerHeight={orderLayerHeight}
                    setOrderLayerHeight={setOrderLayerHeight}
                    orderNozzle={orderNozzle}
                    setOrderNozzle={setOrderNozzle}
                    enableSupports={enableSupports}
                    setEnableSupports={setEnableSupports}
                  />

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Notes / Special Instructions</label>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{newOrder.notes.length}/500</span>
                    </div>
                    <textarea value={newOrder.notes} maxLength={500} onChange={e => setNewOrder(p => ({ ...p, notes: e.target.value }))} placeholder="Orientation, special tolerances, requests..." rows="3" />
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <label style={{ margin: 0 }}>Provide 3D Model *</label>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Choose file upload or paste an online design link
                      </span>
                    </div>

                    {/* Mode Toggle Buttons */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <button
                        type="button"
                        onClick={() => setOrderSourceTab("file")}
                        className={`btn btn-sm ${orderSourceTab === "file" ? "btn-accent" : "btn-glass"}`}
                        style={{ flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 700 }}
                      >
                        Upload File (.stl, .zip, .rar) {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderSourceTab("link")}
                        className={`btn btn-sm ${orderSourceTab === "link" ? "btn-accent" : "btn-glass"}`}
                        style={{ flex: 1, padding: "9px 14px", fontSize: 13, fontWeight: 700 }}
                      >
                        Share Model Link {newOrder.fileLink ? "(Added)" : ""}
                      </button>
                    </div>

                    {orderSourceTab === "file" && (
                      <div>
                        <div className={`drop-zone ${isDragging ? 'active' : ''}`} 
                             onDragOver={handleDragOver} 
                             onDragLeave={handleDragLeave} 
                             onDrop={handleDrop}
                             style={{ padding: "36px 20px", border: formErrors.file ? "2px dashed #FF3B30" : "2px dashed var(--border-glass-strong)", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.03)", textAlign: "center", cursor: "pointer" }}>
                          <input type="file" multiple accept=".stl,.zip,.rar" onChange={handleFileChange} style={{ display: 'none' }} id="fileInput" />
                          <label htmlFor="fileInput" style={{ cursor: 'pointer', display: 'block', margin: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                              {selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(", ") : "Drag & Drop .STL, .ZIP, or .RAR File(s) or Click to Browse"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                              Supports direct single STL models or multi-part archives (.zip / .rar)
                            </div>
                          </label>
                        </div>
                        {selectedFiles.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "var(--status-done)", fontWeight: 700 }}>
                              {selectedFiles.length} file(s) attached
                            </span>
                            <button
                              type="button"
                              onClick={() => { setSelectedFiles([]); setNewOrder(p => ({ ...p, fileName: "" })); }}
                              style={{ background: "transparent", border: "none", color: "#FF3B30", fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                            >
                              Clear Files
                            </button>
                          </div>
                        )}
                        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>Prefer an online repository?</span>
                          <button
                            type="button"
                            onClick={() => setOrderSourceTab("link")}
                            style={{ background: "transparent", border: "none", color: "var(--accent)", padding: 0, cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}
                          >
                            Paste link instead
                          </button>
                        </div>
                      </div>
                    )}

                    {orderSourceTab === "link" && (
                      <div style={{ padding: "18px", background: "rgba(255,255,255,0.02)", border: formErrors.fileLink || formErrors.file ? "1px solid #FF3B30" : "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <label style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>3D Model or Cloud URL</label>
                          {Boolean(newOrder.fileLink && isValidUrl(newOrder.fileLink)) && (
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,128,0,0.15)", color: getPlatformFromUrl(newOrder.fileLink)?.color || "var(--accent)", fontWeight: 800 }}>
                              {getPlatformFromUrl(newOrder.fileLink)?.name || "Web Link"}
                            </span>
                          )}
                        </div>
                        <input
                          type="url"
                          value={newOrder.fileLink}
                          onChange={e => {
                            const val = e.target.value;
                            setNewOrder(p => ({
                              ...p,
                              fileLink: val,
                              fileName: p.fileName || (val ? `Link: ${val.slice(0, 40)}` : "")
                            }));
                            if (formErrors.file || formErrors.fileLink) {
                              setFormErrors(prev => ({ ...prev, file: null, fileLink: null }));
                            }
                          }}
                          placeholder="https://www.printables.com/model/... or Thingiverse, MakerWorld, Drive"
                          style={{ width: "100%", marginBottom: 8, borderColor: (formErrors.fileLink || formErrors.file) ? '#FF3B30' : undefined }}
                        />
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                          Supports links from <strong>Printables</strong>, <strong>Thingiverse</strong>, <strong>MakerWorld</strong>, <strong>Google Drive</strong>, <strong>Dropbox</strong>, or any public 3D CAD URL. Our workshop team will inspect and slice your model upon review.
                        </div>
                        {newOrder.fileLink && (
                          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <a href={normalizeUrl(newOrder.fileLink)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline" }}>
                              Preview external link &rarr;
                            </a>
                            <button
                              type="button"
                              onClick={() => setNewOrder(p => ({ ...p, fileLink: "" }))}
                              style={{ background: "transparent", border: "none", color: "#FF3B30", fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                            >
                              Remove Link
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {fileError && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{fileError}</div>}
                    {formErrors.file && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8, fontWeight: 600 }}>{formErrors.file}</div>}
                    {formErrors.fileLink && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8, fontWeight: 600 }}>{formErrors.fileLink}</div>}
                    {selectedFiles.some(f => f.name.toLowerCase().endsWith(".zip") || f.name.toLowerCase().endsWith(".rar")) && (
                      <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(255,128,0,0.08)", border: "1px solid rgba(255,128,0,0.2)", borderRadius: "var(--radius-sm)", fontSize: 12.5, color: "var(--text-secondary)" }}>
                        <strong style={{ color: "var(--accent)" }}>Archive Uploaded:</strong> Multiple 3D files detected. Contained .stl models verified. Final weight and quote will be calculated and confirmed upon operator review (Standard Rate: <strong>{config.price_per_gram} EGP/g</strong>).
                      </div>
                    )}
                  </div>

                  {/* 3D STL Object Preview & Slicer Estimation */}
                  {Boolean(selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))) && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <label style={{ margin: 0 }}>3D Model & Build Plate Preview</label>
                        {clientMetrics && (
                          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-full)", background: clientMetrics.fitsBed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", color: clientMetrics.fitsBed ? "var(--status-done)" : "#ef4444", fontWeight: 700, border: `1px solid ${clientMetrics.fitsBed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                            {clientMetrics.fitsBed ? "Fits Centauri Bed (256x256mm)" : "Exceeds Bed Envelope"}
                          </span>
                        )}
                      </div>

                      <STLViewer
                        file={selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))}
                        color={newOrder.color}
                        infillPercent={orderInfill}
                        layerHeight={orderLayerHeight}
                        nozzleSize={orderNozzle}
                        enableSupports={enableSupports}
                        materialKey={newOrder.material || "pla"}
                        pricePerGram={(() => {
                          const nk = normalizeMaterialKey(newOrder.material || "pla");
                          const baseR = parseFloat(config.price_per_gram) || 3.5;
                          const md = (materialRates && (materialRates[nk] || materialRates[newOrder.material?.toLowerCase()])) || { selling_rate: baseR };
                          let r = Number(md.selling_rate) || baseR;
                          if ((nk === "pla" || nk === "pla_plus") && (r < baseR || r <= 2.0)) r = baseR;
                          return r;
                        })()}
                        onMetricsChange={setClientMetrics}
                        height="260px"
                      />

                      {clientMetrics && clientMetrics.metrics && (
                        <div style={{ marginTop: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-secondary)", padding: "8px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 8 }}>
                          <span>Oriented Dimensions: <strong>{clientMetrics.metrics.width} x {clientMetrics.metrics.depth} x {clientMetrics.metrics.height} mm</strong></span>
                          <span>
                            Model: <strong>{Number(clientMetrics.modelWeightGrams ?? clientMetrics.weightGrams ?? 0).toFixed(1)}g</strong>
                            {" | "}
                            Tree Supports: <strong>{enableSupports ? `${Number(clientMetrics.supportWeightGrams ?? 0).toFixed(1)}g` : "Disabled (0g)"}</strong>
                          </span>
                          {clientMetrics.filamentLengthMeters && (
                            <span>Filament: <strong>{clientMetrics.filamentLengthMeters}m</strong></span>
                          )}
                        </div>
                      )}

                      {/* Live Review Invoice Card */}
                      <ReviewInvoiceCard
                        clientMetrics={clientMetrics}
                        materialKey={newOrder.material || "pla"}
                        materialName={newOrder.material || "PLA"}
                        serviceTier={selectedTier}
                        config={config}
                        materialRates={materialRates}
                        enableSupports={enableSupports}
                        orderData={newOrder}
                        showDepositInfo={false}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                    <button className="btn btn-glass" onClick={() => setOrderStep(1)}>Back</button>
                    <button className="btn btn-accent" onClick={() => {
                      const errors = {};
                      const cleanLink = (newOrder.fileLink || "").trim();
                      const hasFiles = selectedFiles.length > 0;
                      const hasLink = Boolean(cleanLink);

                      if (!hasFiles && !hasLink) {
                        errors.file = "Please upload a 3D file (.stl, .zip, .rar) or provide a model/cloud link.";
                      }
                      if (hasLink && !isValidUrl(cleanLink)) {
                        errors.fileLink = "Please enter a valid URL (starting with http:// or https://)";
                      }
                      setFormErrors(errors);
                      if (Object.keys(errors).length === 0) setOrderStep(3);
                    }}>Review Order</button>
                  </div>
                </div>
              )}

              {orderStep === 3 && (
                <div className="animate-in">
                  <h3 style={{ marginBottom: 16 }}>Order Summary</h3>
                  <div className="review-summary-card" style={{ marginBottom: 20 }}>
                    <div className="review-item">
                      <span className="review-item-label">Client Name</span>
                      <span className="review-item-value">{newOrder.name}</span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Phone</span>
                      <span className="review-item-value">{newOrder.phone}</span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Email</span>
                      <span className="review-item-value">{newOrder.email}</span>
                    </div>
                    <div style={{ margin: "6px 0", borderTop: "1px solid var(--border-glass)" }}></div>
                    <div className="review-item">
                      <span className="review-item-label">Project</span>
                      <span className="review-item-value">{newOrder.orderName || "Untitled"}</span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Service Tier</span>
                      <span className="review-item-value" style={{ fontWeight: 800, color: "var(--accent)" }}>
                        {selectedTier === "economy" ? "Economy (Draft 0.28mm, 15% Infill)" : selectedTier === "professional" ? "Professional (Fine 0.12mm, 25% Infill)" : selectedTier === "custom" ? `Custom (${Number(orderLayerHeight).toFixed(2)}mm, ${orderInfill}% Infill)` : "Standard (0.20mm, 20% Infill)"}
                      </span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Tree Supports</span>
                      <span className="review-item-value" style={{ fontWeight: 700, color: enableSupports ? "#34d399" : "var(--text-secondary)" }}>
                        {enableSupports
                          ? `Enabled (${clientMetrics ? `${Number(clientMetrics.supportWeightGrams ?? 0).toFixed(2)}g` : "Auto >45 deg"})`
                          : "Disabled (0g)"}
                      </span>
                    </div>
                    {clientMetrics && clientMetrics.metrics && (
                      <div className="review-item">
                        <span className="review-item-label">Oriented Bounds</span>
                        <span className="review-item-value">
                          {clientMetrics.metrics.width} x {clientMetrics.metrics.depth} x {clientMetrics.metrics.height} mm
                        </span>
                      </div>
                    )}
                    <div className="review-item">
                      <span className="review-item-label">Material & Color</span>
                      <span className="review-item-value" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: getColorHex(newOrder.color), border: "1px solid rgba(255,255,255,0.4)", display: "inline-block" }} />
                        {newOrder.material?.toUpperCase()} ({newOrder.color})
                      </span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Model Source</span>
                      <span className="review-item-value" style={{ wordBreak: "break-all" }}>
                        {selectedFiles.length > 0 && <div>{selectedFiles.map(f => f.name).join(", ")}</div>}
                        {newOrder.fileLink && (
                          <div style={{ marginTop: selectedFiles.length > 0 ? 4 : 0 }}>
                            <a href={normalizeUrl(newOrder.fileLink)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span>{getPlatformFromUrl(newOrder.fileLink)?.name || "External Link"}:</span> {newOrder.fileLink}
                            </a>
                          </div>
                        )}
                        {!selectedFiles.length && !newOrder.fileLink && "No file or link"}
                      </span>
                    </div>
                  </div>

                  {/* Pricing Breakdown Card */}
                  <div style={{ marginBottom: 24 }}>
                    <ReviewInvoiceCard
                      clientMetrics={clientMetrics}
                      materialKey={newOrder.material || "pla"}
                      materialName={newOrder.material || "PLA"}
                      serviceTier={selectedTier}
                      config={config}
                      materialRates={materialRates}
                      enableSupports={enableSupports}
                      orderData={newOrder}
                      showDepositInfo={true}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                    <button className="btn btn-glass" onClick={() => setOrderStep(2)}>Back</button>
                    <button className="btn btn-primary" style={{ opacity: isUploading ? 0.7 : 1 }} disabled={isUploading} onClick={handleOrderSubmit}>
                      {isUploading ? "Uploading..." : "Submit Order"}
                    </button>
                  </div>
                </div>
              )}
              
              {orderStep === 4 && (
                <div className="animate-in" style={{ textAlign: 'center', padding: "20px 0" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 64, height: 64, color: "var(--status-done)"}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <h2 style={{ marginBottom: 12 }}>Upload Successful!</h2>
                  <p>Your files have been securely uploaded to our print queue.</p>
                  <p>Save this tracking code to check your order status:</p>
                  
                  <div 
                    className={`tracking-code-display ${copiedTrackingCode ? 'copied' : ''}`} 
                    onClick={async () => { 
                      const success = await copyToClipboard(successModal); 
                      if (success !== false) {
                        setCopiedTrackingCode(true);
                        addToast("Tracking code copied to clipboard!", "success");
                        setTimeout(() => setCopiedTrackingCode(false), 3000);
                      }
                    }} 
                    style={{ margin: "24px auto", maxWidth: 340, cursor: "pointer" }}
                  >
                    <span className="code">{successModal}</span>
                    <span className="copy-hint">{copiedTrackingCode ? "Copied to clipboard!" : "Tap to copy"}</span>
                  </div>

                  {lastSubmittedQuote && (
                    <div className="review-summary-card" style={{ maxWidth: 440, margin: "24px auto", textAlign: "left", background: "rgba(255,255,255,0.02)" }}>
                      <div className="review-item">
                        <span className="review-item-label">Part Name</span>
                        <span className="review-item-value">{lastSubmittedQuote.orderName}</span>
                      </div>
                      {lastSubmittedQuote.tier && (
                        <div className="review-item">
                          <span className="review-item-label">Service Tier</span>
                          <span className="review-item-value" style={{ fontWeight: 700, color: "var(--accent)" }}>
                            {lastSubmittedQuote.tier === "economy" ? "Economy (Draft 0.28mm)" : lastSubmittedQuote.tier === "professional" ? "Professional (Fine 0.12mm)" : "Standard (Standard 0.20mm)"}
                          </span>
                        </div>
                      )}
                      <div className="review-item">
                        <span className="review-item-label">Material & Color</span>
                        <span className="review-item-value" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: getColorHex(lastSubmittedQuote.color), display: "inline-block" }} />
                          {lastSubmittedQuote.material?.toUpperCase()} ({lastSubmittedQuote.color})
                        </span>
                      </div>
                      {lastSubmittedQuote.weightGrams > 0 && (
                        <div className="review-item">
                          <span className="review-item-label">Est. Weight</span>
                          <span className="review-item-value">{lastSubmittedQuote.weightGrams.toFixed(1)} g</span>
                        </div>
                      )}
                      <div className="review-item" style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border-glass)" }}>
                        <span className="review-item-label" style={{ fontWeight: 700 }}>Est. Amount</span>
                        {lastSubmittedQuote && lastSubmittedQuote.totalPrice > (parseFloat(config.price_review_threshold) || 300) ? (
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)" }}>
                            Pending Operator Review
                          </span>
                        ) : (
                          <span style={{ fontSize: 18, fontWeight: 900, color: "var(--accent)" }}>
                            {lastSubmittedQuote.totalPrice > 0 ? `${lastSubmittedQuote.totalPrice.toFixed(2)} EGP` : `Calculated upon slicing (${config.price_per_gram} EGP/g)`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {config.whatsapp_number && (
                    <div style={{ marginTop: 20 }}>
                      <a
                        href={`https://wa.me/${(config.whatsapp_number || "").replace(/\D/g, "").startsWith("0") ? "2" + (config.whatsapp_number || "").replace(/\D/g, "") : (config.whatsapp_number || "").replace(/\D/g, "")}?text=${encodeURIComponent(
                          `Hello Etba3ly! I just submitted an order:\n- Tracking: ${successModal}\n- Part: ${lastSubmittedQuote?.orderName || "Custom 3D Print"}\n- Specs: ${lastSubmittedQuote?.material || "PLA"} (${lastSubmittedQuote?.color || "Standard"})\n- Total: ${lastSubmittedQuote && lastSubmittedQuote.totalPrice > (parseFloat(config.price_review_threshold) || 300) ? "Pending operator review" : (lastSubmittedQuote && lastSubmittedQuote.totalPrice > 0 ? `${lastSubmittedQuote.totalPrice.toFixed(2)} EGP` : 'Pending quote')}\n- Client: ${lastSubmittedQuote?.name || ""}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-accent"
                        style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", borderColor: "#25D366", color: "#ffffff", fontWeight: 700 }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        Send Order to Workshop on WhatsApp
                      </a>
                    </div>
                  )}
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                    <a href="/track" className="btn btn-accent" style={{ width: "100%" }} onClick={(e) => { e.preventDefault(); setOrderStep(1); navigateTo("track"); }}>Go Track Your Order</a>
                    <a href="/home" className="btn btn-glass" style={{ width: "100%" }} onClick={(e) => { e.preventDefault(); setOrderStep(1); navigateTo("home"); }}>Back to Studio Home</a>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {hash === "#track" && (
          <section className="section-container animate-in" style={{ paddingTop: 130, minHeight: "100vh", position: "relative", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div className="eyebrow-tag">LIVE PRODUCTION TELEMETRY</div>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 12 }}>Track Your Order</h1>
              <p>Enter your tracking code or phone number to inspect live build status.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
                <div className="queue-badge">
                  <div className="live-dot" />
                  <span><strong>{queuedOrdersCount}</strong> in queue</span>
                </div>
                <a href="/home" onClick={(e) => { e.preventDefault(); navigateTo("home"); }} style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>Back to Studio Home</a>
              </div>
            </div>
            
            <div className="card" style={{ maxWidth: 640, margin: "0 auto 40px", width: "100%" }}>
              <div className="track-search-row" style={{ marginBottom: 0 }}>
                <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)} placeholder="Tracking Code (JP-...) or Phone Number" onKeyDown={e => e.key === "Enter" && handleTrackSearch()} />
                <button className="btn btn-accent" onClick={handleTrackSearch}>Search</button>
              </div>
            </div>

            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              {Array.isArray(trackResults) && trackResults.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, padding: "0 4px" }}>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase" }}>
                    {trackSearch ? `Search Results (${trackResults.length})` : `Recent Orders (${trackResults.length})`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-glass"
                    style={{ fontSize: 11, padding: "3px 10px", color: "var(--text-tertiary)" }}
                    onClick={() => {
                      localStorage.removeItem("jp_tracking_codes");
                      setTrackResults(null);
                      setTrackSearch("");
                      addToast("Tracking cache cleared", "info");
                    }}
                  >
                    Clear History
                  </button>
                </div>
              )}

              {trackResults === "NOT_FOUND" && (
                <div className="card animate-in" style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 48, height: 48, color: "var(--text-tertiary)", marginBottom: 16}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <p style={{ margin: 0 }}>No orders found. Double-check your tracking code or phone number.</p>
                </div>
              )}

              {Array.isArray(trackResults) && trackResults.map(r => {
                const normStatus = (r.status || "").toLowerCase().trim();
                const isPrinting = normStatus === "printing";
                const isDone = normStatus === "done";
                const isQueued = !isPrinting && !isDone;
                const assignedPrinter = getPrinterFromNotes(r.notes);

                return (
                  <div key={r.id} className="card animate-in" style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                      <div>
                        <h3 style={{ margin: "0 0 6px" }}>{r.ordername || "Untitled Order"}</h3>
                        {r.tracking_code && <CopyableCode code={r.tracking_code} />}
                      </div>
                      
                      {/* Prominent Explicit Status Badge */}
                      <div>
                        {isQueued && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: "var(--radius-full)", background: "rgba(255, 149, 0, 0.15)", border: "1px solid rgba(255, 149, 0, 0.3)", color: "var(--status-queued)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-queued)", display: "inline-block" }} />
                            In Queue
                          </span>
                        )}
                        {isPrinting && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: "var(--radius-full)", background: "rgba(0, 122, 255, 0.15)", border: "1px solid rgba(0, 122, 255, 0.3)", color: "var(--status-printing)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-printing)", display: "inline-block" }} />
                            Printing Live {assignedPrinter ? `(${assignedPrinter})` : ""}
                          </span>
                        )}
                        {isDone && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: "var(--radius-full)", background: "rgba(52, 199, 89, 0.15)", border: "1px solid rgba(52, 199, 89, 0.3)", color: "var(--status-done)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-done)", display: "inline-block" }} />
                            Completed & Ready
                          </span>
                        )}
                      </div>
                    </div>

                    <StatusStepper status={r.status} />

                    {(() => {
                      const delivery = (r.delivery_mode || (r.notes?.match(/\[DELIVERY:([^\]]+)\]/i)?.[1]) || (r.notes?.match(/\[Mode:\s*([^\]|]+)/i)?.[1]) || "pickup").trim();
                      const depositMatch = r.notes?.match(/\[DEPOSIT:([^\]]+)\]/i) || r.notes?.match(/\[Deposit:\s*([^\]|EGP]+)/i);
                      const depositVal = r.deposit_required !== undefined && r.deposit_required !== null && !isNaN(Number(r.deposit_required))
                        ? Number(r.deposit_required)
                        : (depositMatch ? parseFloat(depositMatch[1]) : (r.totalprice ? Math.round(r.totalprice * 0.5) : null));

                      return (
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-glass)", fontSize: 13, color: "var(--text-secondary)" }}>
                          <span>Material: <strong style={{ color: "var(--text-primary)" }}>{r.material || "PLA"}</strong></span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            Color:
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: getColorHex(r.color), border: "1px solid rgba(255,255,255,0.3)", display: "inline-block" }} />
                            <strong style={{ color: "var(--text-primary)" }}>{r.color || "Standard"}</strong>
                          </span>
                          {r.weightgrams > 0 && <span>Weight: <strong style={{ color: "var(--text-primary)" }}>{r.weightgrams} g</strong></span>}
                          <span>Fulfillment: <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{delivery}</strong></span>
                          {depositVal !== null && !isNaN(depositVal) && (
                            <span>Deposit: <strong style={{ color: "var(--text-primary)" }}>{Number(depositVal).toFixed(0)} EGP</strong></span>
                          )}
                          {r.totalprice > 0 ? (
                            <span style={{ marginLeft: "auto" }}>Price: <strong style={{ color: "var(--accent)", fontSize: 15 }}>{r.totalprice.toFixed(2)} EGP</strong></span>
                          ) : (
                            <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 12 }}>Rate: {config.price_per_gram} EGP/g</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ maxWidth: 640, margin: "40px auto 0", textAlign: "center", padding: 32 }}>
              <h3 style={{ marginBottom: 12 }}>Need Direct Assistance?</h3>
              <p style={{ fontSize: 14, marginBottom: 24 }}>Contact our print engineers directly for urgent tolerances or custom requests.</p>
              <div className="contact-buttons" style={{ justifyContent: "center" }}>
                <a href={config.whatsapp_number ? `https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}` : "https://wa.me/"} target="_blank" rel="noreferrer" className="btn btn-accent"><WhatsAppIcon /> WhatsApp</a>
                <a href={`mailto:${config.email_address || "support@etba3ly.store"}`} className="btn btn-glass"><EmailIcon /> Email Us</a>
              </div>
            </div>
          </section>
        )}

        {!VALID_HASHES.includes(hash) && <NotFoundPage />}

        {(VALID_HASHES.includes(hash) && hash !== "#full-gallery" && hash !== "#order" && hash !== "#track") && (
          <>
          {/* -- HERO -- */}
          <section id="home" className="section-container animate-in">
            <span
              className="sr-only"
              style={{
                position: "absolute",
                width: "1px",
                height: "1px",
                padding: 0,
                margin: "-1px",
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0
              }}
            >
              Etba3ly Store -- On-Demand 3D Printing Service Egypt
            </span>
            <h1 style={{ whiteSpace: "pre-line" }}>{config.hero_title}</h1>
            <p style={{ whiteSpace: "pre-line" }}>{config.hero_subtitle}</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/order" className="btn btn-accent" onClick={(e) => { e.preventDefault(); navigateTo("order"); }}>Place an Order</a>
              {config.whatsapp_number && (
                <a href={`https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent("Hello! I'd like to place an order.")}`} target="_blank" rel="noreferrer" className="btn btn-glass" style={{ gap: 8 }}>
                  <WhatsAppIcon /> Order via WhatsApp
                </a>
              )}
              <a href="/track" className="btn btn-glass" onClick={(e) => { e.preventDefault(); navigateTo("track"); }}>Track Order</a>
            </div>
          </section>

          {/* -- WHY US -- */}
          <section id="why" className="section-container reveal">
            <h2>{config.why_title}</h2>
            <p>{(config.why_text || "").replace(/\s*<!--RATES_CATALOG:.*?-->/s, "").trim()}</p>
            <div className="feature-cards">
              {[
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 36, height: 36, color: "var(--accent)"}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: "Fast Turnaround", desc: "Most orders done in 24-48hrs" },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 36, height: 36, color: "var(--status-done)"}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, title: "Student Pricing", desc: `Just ${config.price_per_gram} EGP/gram` },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 36, height: 36, color: "var(--status-printing)"}}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, title: "Precision", desc: "0.2mm layer accuracy" }
              ].map((f, i) => (
                <div key={i} className="card" style={{ textAlign: "center", padding: 28 }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>{f.icon}</div>
                  <h3 style={{ marginBottom: 6 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* -- GALLERY -- */}
          <section id="gallery" className="gallery-section reveal">
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2>Our Work</h2>
              <p style={{ maxWidth: 500, margin: "0 auto" }}>Some of the parts we've printed. Your project could be next.</p>
            </div>
            <div className="gallery-grid">
              {(galleryItems.length > 0 ? galleryItems.slice(0, 6) : [
                { id: 'p1', title: "Custom Gears", description: "PLA -- Mechanical parts" },
                { id: 'p2', title: "Phone Stand", description: "PETG -- Functional design" },
                { id: 'p3', title: "Miniature Model", description: "PLA -- High detail" },
                { id: 'p4', title: "Drone Mount", description: "Carbon Fiber -- Lightweight" },
                { id: 'p5', title: "Enclosure", description: "ABS -- Heat resistant" },
                { id: 'p6', title: "Art Piece", description: "TPU -- Flexible material" }
              ]).map((item, i) => (
                <div key={item.id || i} className="gallery-card" style={{ cursor: item.media_urls ? 'pointer' : 'default' }} onClick={() => { if (item.media_urls) { setActiveGalleryItem(item); setActiveMediaIndex(0); } }}>
                  <div className="gallery-card-img">{item.cover_url ? <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CubeIcon />}</div>
                  <div className="gallery-card-body">
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 48 }}>
              <a href="/gallery" className="btn btn-glass" onClick={(e) => { e.preventDefault(); navigateTo("full-gallery"); }}>View Full Gallery</a>
            </div>
          </section>

          {/* -- ABOUT -- */}
          <section id="about" className="section-container reveal">
            <h2>About Us</h2>
            <p>We're a team of student engineers passionate about bringing ideas to life. Our 3D printing setup is calibrated daily for optimal results -- from functional prototypes to creative projects.</p>
          </section>

          {/* -- CONTACT -- */}
          <section id="contact" className="section-container reveal">
            <h2>Get In Touch</h2>
            <p>Need a custom order or have questions? We're here to help.</p>
            {config.show_socials !== false && (
              <div className="contact-buttons">
                {config.whatsapp_number ? (
                  <a href={`https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-accent" style={{ gap: 10 }}>
                    <WhatsAppIcon /> WhatsApp
                  </a>
                ) : (
                  <a href="https://wa.me/" target="_blank" rel="noreferrer" className="btn btn-accent" style={{ gap: 10 }}>
                    <WhatsAppIcon /> WhatsApp
                  </a>
                )}
                {config.email_address ? (
                  <a href={`mailto:${config.email_address}`} className="btn btn-glass" style={{ gap: 10 }}>
                    <EmailIcon /> Email Us
                  </a>
                ) : (
                  <a href="mailto:support@etba3ly.store" className="btn btn-glass" style={{ gap: 10 }}>
                    <EmailIcon /> Email Us
                  </a>
                )}
              </div>
            )}
            {config.show_socials === false && <p style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>Contact information is currently hidden.</p>}
          </section>
        </>
        )}
        {hash !== "#order" && hash !== "#boss" && (
          <a href="/order" className="floating-cta" onClick={(e) => { e.preventDefault(); navigateTo("order"); }}>
            Order Now
          </a>
        )}
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
            <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>x</button>
          </div>
        ))}
      </div>



      {/* Gallery Product Detail Modal */}
      {activeGalleryItem && (() => {
        const mediaUrls = activeGalleryItem.media_urls ? activeGalleryItem.media_urls.split(',').filter(Boolean) : [];
        return (
          <div className="modal-overlay gallery-modal-overlay" onClick={() => setActiveGalleryItem(null)}>
            <div className="gallery-modal" onClick={e => e.stopPropagation()}>
              <button className="gallery-modal-close" onClick={() => setActiveGalleryItem(null)}>&times;</button>
              <div className="gallery-modal-main">
                {mediaUrls.length > 0 && (
                  <div className="gallery-modal-viewer">
                    {mediaUrls[activeMediaIndex].match(/\.gif$/i) 
                      ? <img src={mediaUrls[activeMediaIndex]} alt={activeGalleryItem.title} className="gallery-modal-media" />
                      : <img src={mediaUrls[activeMediaIndex]} alt={activeGalleryItem.title} className="gallery-modal-media" />
                    }
                    {mediaUrls.length > 1 && (
                      <>
                        <button className="gallery-nav gallery-nav-prev" onClick={() => setActiveMediaIndex(i => (i - 1 + mediaUrls.length) % mediaUrls.length)}>&lsaquo;</button>
                        <button className="gallery-nav gallery-nav-next" onClick={() => setActiveMediaIndex(i => (i + 1) % mediaUrls.length)}>&rsaquo;</button>
                      </>
                    )}
                  </div>
                )}
                <div className="gallery-modal-info">
                  <h2>{activeGalleryItem.title}</h2>
                  <p>{activeGalleryItem.description}</p>
                  {mediaUrls.length > 1 && (
                    <div className="gallery-thumbs">
                      {mediaUrls.map((url, idx) => (
                        <div key={idx} className={`gallery-thumb ${idx === activeMediaIndex ? 'active' : ''}`} onClick={() => setActiveMediaIndex(idx)}>
                          <img src={url} alt={`${activeGalleryItem.title} ${idx + 1}`} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 16 }}>
                    {activeMediaIndex + 1} / {mediaUrls.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* -- FOOTER -- */}
      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src={getAssetPath("logo-dark.svg")} alt={`${brandName} Store - On-Demand 3D Printing Service Egypt`} className="footer-logo-img footer-logo" />
            </div>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, margin: "0 0 6px 0", fontWeight: 600 }}>Etba3ly Store | On-Demand 3D Printing Service Egypt</p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: 0 }}>Student-powered 3D printing. Fast, affordable, on campus across Egypt.</p>
          </div>
          <div className="footer-col">
            <h4>Quick Links</h4>
            <a href="/order" onClick={(e) => { e.preventDefault(); navigateTo("order"); }}>Place Order</a>
            <a href="/track" onClick={(e) => { e.preventDefault(); navigateTo("track"); }}>Track Order</a>
            <a href="/gallery" onClick={(e) => { e.preventDefault(); navigateTo("full-gallery"); }}>Gallery</a>
            <a href="/about" onClick={(e) => { e.preventDefault(); navigateTo("about"); }}>About</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setPrivacyModalOpen(true); }}>Privacy Policy</a>
          </div>
          <div className="footer-col">
            <h4>Connect</h4>
            {config.show_socials !== false ? (
              <div className="social-links">
                {config.whatsapp_number ? (
                  <a href={`https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="social-link" aria-label="WhatsApp" title="WhatsApp"><WhatsAppIcon /></a>
                ) : (
                  <a href="https://wa.me/" target="_blank" rel="noreferrer" className="social-link" aria-label="WhatsApp" title="WhatsApp"><WhatsAppIcon /></a>
                )}
                <a href={config.instagram_link || "https://www.instagram.com/etba3ly_3d/"} target="_blank" rel="noreferrer" className="social-link" aria-label="Instagram @etba3ly_3d" title="Instagram @etba3ly_3d"><InstagramIcon /></a>
                <a href={`mailto:${config.email_address || "support@etba3ly.store"}`} className="social-link" aria-label="Email" title="Email"><EmailIcon /></a>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Hidden</span>
            )}
          </div>
        </div>
        <div className="footer-bottom">&copy; {new Date().getFullYear()} {brandName} Store. All rights reserved. | On-Demand 3D Printing Service Egypt</div>
      </footer>

      {/* Privacy Policy Modal */}
      {privacyModalOpen && (
        <div className="modal-backdrop" onClick={() => setPrivacyModalOpen(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Privacy Policy</h2>
              <button onClick={() => setPrivacyModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 24 }}>&times;</button>
            </div>
            <div style={{ maxHeight: "60vh", overflowY: "auto", fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", paddingRight: 8, whiteSpace: "pre-wrap" }}>
              {config.privacy_policy || "No privacy policy has been set yet."}
            </div>
            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button className="btn btn-primary" onClick={() => setPrivacyModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploadProgress.active && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12000 }}>
          <div className="modal-content card" style={{ padding: 32, maxWidth: 460, width: "90%", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(255, 128, 0, 0.12)",
                border: "1px solid rgba(255, 128, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)"
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 20, fontWeight: 800 }}>
              {uploadProgress.stage === "saving" ? "Finalizing Order..." : "Uploading 3D Models..."}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px 0", wordBreak: "break-all" }}>
              {uploadProgress.stage === "saving"
                ? "Registering files into the production queue and generating your live tracking code..."
                : `Uploading ${uploadProgress.currentFile} (${uploadProgress.fileIndex || 1} of ${uploadProgress.totalFiles || 1})`}
            </p>

            {/* Progress Track */}
            <div
              role="progressbar"
              aria-valuenow={uploadProgress.percent}
              aria-valuemin="0"
              aria-valuemax="100"
              style={{
                width: "100%",
                height: 12,
                background: "rgba(255, 255, 255, 0.08)",
                borderRadius: 9999,
                overflow: "hidden",
                border: "1px solid var(--border-glass)",
                position: "relative"
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(5, uploadProgress.percent)}%`,
                  background: "linear-gradient(90deg, #ff8000, #ff5500)",
                  borderRadius: 9999,
                  transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "0 0 12px rgba(255, 128, 0, 0.5)"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 12 }}>
              <span style={{ color: "var(--text-tertiary)" }}>
                {uploadProgress.totalBytes > 0
                  ? `${(uploadProgress.loadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(uploadProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                  : "Transferring..."}
              </span>
              <span style={{ fontWeight: 800, color: "var(--accent)", fontSize: 14 }}>
                {uploadProgress.percent}%
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}