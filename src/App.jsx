import React, { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Html, useProgress } from "@react-three/drei";
import * as THREE from "three";
import STLViewer from "./slicer/STLViewer.jsx";
import AdminSlicerModal from "./slicer/AdminSlicerModal.jsx";
import MoonrakerDispatchModal from "./slicer/MoonrakerDispatchModal.jsx";
import { generateElegooGcode } from "./slicer/slicerEngine.js";

// ─────────────────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://gfswtgvsbvmuxywewxij.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PRINTERS = ["CC Abdalla", "CC Mazen"];
const VALID_HASHES = ["", "#home", "#order", "#track", "#full-gallery", "#boss", "#why", "#about", "#contact", "#gallery"];

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// Printer helpers — parse/set printer tag in notes field
// ─────────────────────────────────────────────────────────
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
  if (!notes) return "";
  return notes.replace(/^\[PRINTER:[^\]]+\]\s*/, "");
}

// ─────────────────────────────────────────────────────────
// 3D SCENE — Abstract Geometry + 3D Print Icons
// ─────────────────────────────────────────────────────────
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

/* ── Gear Shape (3D printing icon) ── */
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

/* ── Main 3D Scene ── */
function PrintScene() {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;
    const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));

    // Scale down and move right as user scrolls
    const isMobile = window.innerWidth <= 768;
    const mobileScale = 0.55;
    const scale = isMobile ? mobileScale : (1 - progress * 0.4);
    const posX = isMobile ? 0 : (2.5 + progress * 1);
    const posY = isMobile ? 1.5 : 0;
    const rotY = progress * Math.PI * 0.5;

    groupRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.08);
    groupRef.current.position.lerp(new THREE.Vector3(posX, posY, 0), 0.08);
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    groupRef.current.quaternion.slerp(targetQuat, 0.08);
  });

  return (
    <group ref={groupRef}>
      {/* Central Torus Knot — abstract hero piece */}
      <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
        <mesh position={[0, 0, 0]}>
          <torusKnotGeometry args={[0.8, 0.25, 128, 32]} />
          <meshStandardMaterial
            color="#FF8000"
            metalness={0.85}
            roughness={0.1}
            envMapIntensity={2}
          />
        </mesh>
      </Float>

      {/* Gear 1 */}
      <Float speed={2} rotationIntensity={0.6} floatIntensity={0.8}>
        <GearShape position={[-1.8, 1.2, -0.5]} scale={0.5} color="#333333" />
      </Float>

      {/* Gear 2 — smaller */}
      <Float speed={1.8} rotationIntensity={0.5} floatIntensity={0.7}>
        <GearShape position={[1.5, -1, 0.3]} scale={0.35} color="#FFB347" />
      </Float>

      {/* Floating Cube — representing 3D print layers */}
      <Float speed={2.2} rotationIntensity={0.8} floatIntensity={0.9}>
        <mesh position={[-1.2, -1.3, 0.5]} rotation={[0.5, 0.7, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#1A1A1A" metalness={0.6} roughness={0.3} />
        </mesh>
      </Float>

      {/* Floating Octahedron — geometric */}
      <Float speed={1.6} rotationIntensity={0.7} floatIntensity={0.5}>
        <mesh position={[1.8, 1.3, -0.3]} rotation={[0.3, 0.4, 0]}>
          <octahedronGeometry args={[0.4]} />
          <meshStandardMaterial color="#FF8000" metalness={0.9} roughness={0.05} envMapIntensity={3} />
        </mesh>
      </Float>

      {/* Small Icosahedron */}
      <Float speed={2.5} rotationIntensity={1} floatIntensity={1}>
        <mesh position={[0.3, 1.8, 0.2]}>
          <icosahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial color="#E0E0E0" metalness={0.5} roughness={0.4} />
        </mesh>
      </Float>

      {/* Small Torus — ring detail */}
      <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.4}>
        <mesh position={[-0.5, -0.2, 1]} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.3, 0.08, 16, 32]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.2} />
        </mesh>
      </Float>

      {/* Cylinder — nozzle-like */}
      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.6}>
        <mesh position={[0.8, -1.6, -0.4]} rotation={[0.2, 0, 0.5]}>
          <cylinderGeometry args={[0.06, 0.15, 0.6, 16]} />
          <meshStandardMaterial color="#FF8000" metalness={0.8} roughness={0.15} />
        </mesh>
      </Float>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════════════
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
  <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
);
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
);
const EmailIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const CubeIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
);


// ═══════════════════════════════════════════════════════════
// STATUS STEPPER
// ═══════════════════════════════════════════════════════════
function StatusStepper({ status }) {
  const steps = ["queued", "printing", "done"];
  const currentIdx = steps.indexOf(status);
  return (
    <div className="stepper">
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          {i > 0 && <div className={`stepper-line ${i <= currentIdx ? "filled" : ""}`} />}
          <div className={`stepper-step ${i < currentIdx ? "completed" : ""} ${i === currentIdx ? "active" : ""}`}>
            <div className="stepper-dot">{i < currentIdx ? <CheckIcon /> : i + 1}</div>
            <span className="stepper-label">{step === "queued" ? "Queued" : step === "printing" ? "Printing" : "Done"}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COPYABLE CODE
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// 404 NOT FOUND PAGE
// ═══════════════════════════════════════════════════════════
function NotFoundPage() {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.hash = "#home";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="not-found-container animate-in">
      <div className="not-found-card">
        <div className="not-found-number">404</div>
        <h2 style={{ marginBottom: 12 }}>Page Not Found</h2>
        <p style={{ marginBottom: 16 }}>The page you're looking for doesn't exist or has been moved.</p>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
          Redirecting to home in <strong style={{ color: 'var(--accent)', fontSize: 18 }}>{countdown}</strong> seconds…
        </p>
        <a href="#home" className="btn btn-accent">← Go Home Now</a>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  id: 1,
  brand_name: "Etba3ly",
  hero_title: "Your Idea.\nMade Real.",
  hero_subtitle: "Upload your 3D design, pick your material, and we'll print it for you — fast, affordable, and right here on campus.",
  why_title: "Why Print With Us?",
  why_text: "We're students who love making things. Our setup is tuned for speed and precision, so you get your parts fast without breaking the bank. PLA, PETG, TPU — we've got what you need.",
  price_per_gram: 3,
  materials: "PLA, PETG, ABS, Carbon Fiber, TPU",
  colors: "McLaren Orange, Carbon Black, White, Silver, Red",
  whatsapp_number: "",
  instagram_link: "",
  email_address: "",
  show_socials: true,
  privacy_policy: ""
};

function FullGalleryView({ items, onItemClick }) {
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
          <a href="#home" className="btn btn-glass">Back to Home</a>
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
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [orders, setOrders] = useState([]);
  const [queuedOrdersCount, setQueuedOrdersCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") !== "light");
  const [hash, setHash] = useState(window.location.hash);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const savedUserInfo = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("jp_user_info") || "{}"); } catch { return {}; }
  }, []);
  const [newOrder, setNewOrder] = useState({ name: savedUserInfo.name || "", phone: savedUserInfo.phone || "", email: savedUserInfo.email || "", orderName: "", material: "", color: "", notes: "", fileName: "" });
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
  const [editingOrder, setEditingOrder] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  // Gallery state
  const [galleryItems, setGalleryItems] = useState([]);
  const [activeGalleryItem, setActiveGalleryItem] = useState(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [editingGalleryItem, setEditingGalleryItem] = useState(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [newGalleryItem, setNewGalleryItem] = useState({ title: "", description: "" });
  const [newGalleryFiles, setNewGalleryFiles] = useState([]);

  // 3D Slicer, Estimation & Hardware Dispatch State
  const [orderInfill, setOrderInfill] = useState(20);
  const [orderLayerHeight, setOrderLayerHeight] = useState(0.20);
  const [orderNozzle, setOrderNozzle] = useState(0.40);
  const [clientMetrics, setClientMetrics] = useState(null);
  const [copiedTrackingCode, setCopiedTrackingCode] = useState(false);
  const [adminSlicerOrder, setAdminSlicerOrder] = useState(null);
  const [moonrakerOrder, setMoonrakerOrder] = useState(null);
  const [moonrakerGcode, setMoonrakerGcode] = useState("");
  const [externalPrinterStates, setExternalPrinterStates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jp_external_printer_states") || "{}"); } catch { return {}; }
  });
  const [externalPromptPrinter, setExternalPromptPrinter] = useState(null);
  const [externalJobInput, setExternalJobInput] = useState("");

  function handleSetExternalJob(printer) {
    setExternalPromptPrinter(printer);
    setExternalJobInput("");
  }

  function handleSaveExternalJob() {
    if (!externalPromptPrinter) return;
    const updated = {
      ...externalPrinterStates,
      [externalPromptPrinter]: {
        status: "working",
        jobName: externalJobInput.trim() || "Flash Drive / Direct USB Print",
        timestamp: new Date().toISOString()
      }
    };
    setExternalPrinterStates(updated);
    localStorage.setItem("jp_external_printer_states", JSON.stringify(updated));
    setExternalPromptPrinter(null);
    setExternalJobInput("");
    addToast(`Marked ${externalPromptPrinter} as active (USB Job)`, "success");
  }

  function handleClearExternalJob(printer) {
    const updated = { ...externalPrinterStates };
    delete updated[printer];
    setExternalPrinterStates(updated);
    localStorage.setItem("jp_external_printer_states", JSON.stringify(updated));
    addToast(`${printer} marked as ready`, "info");
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
    dark.src = `${import.meta.env.BASE_URL}logo-dark.svg`;
    const light = new Image();
    light.src = `${import.meta.env.BASE_URL}logo-light.svg`;
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  useEffect(() => {
    const title = (config.brand_name && config.brand_name !== "JUST print" && config.brand_name !== "PrintQueue") ? config.brand_name : "Etba3ly";
    document.title = title;
  }, [config.brand_name]);

  useEffect(() => {
    if (config.materials && config.colors && !newOrder.material) {
      setNewOrder(p => ({ ...p, material: config.materials.split(',')[0].trim(), color: config.colors.split(',')[0].trim() }));
    }
  }, [config]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsAdmin(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setIsAdmin(!!session));
    function checkHash() {
      const newHash = window.location.hash;
      // Reset order wizard when navigating away from #order
      if (newHash !== "#order") {
        setOrderStep(1);
      }
      // Close all modals/editors when navigating away
      setEditingGalleryItem(null);
      setActiveGalleryItem(null);
      setConfirmModal(null);
      setEditingOrder(null);
      setMobileMenuOpen(false);
      setHash(newHash);
    }
    window.addEventListener("hashchange", checkHash);
    return () => { subscription.unsubscribe(); window.removeEventListener("hashchange", checkHash); };
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchConfig();
    fetchGallery();
    const sub = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, fetchConfig)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, fetchGallery)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [isAdmin]);

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

  // Scroll reveal — re-run when hash/admin changes so newly-rendered sections get observed
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
    const { data, error } = await supabase.from("site_config").select("*").eq("id", 1).single();
    if (data && !error) {
      const isLegacy =
        !data.hero_title ||
        data.hero_title.includes("F1") ||
        data.brand_name === "JUST print" ||
        data.brand_name === "PrintQueue" ||
        (data.why_title && data.why_title.includes("Speed"));

      if (isLegacy) {
        setConfig(prev => ({
          ...DEFAULT_CONFIG,
          ...data,
          brand_name: "Etba3ly",
          hero_title: DEFAULT_CONFIG.hero_title,
          hero_subtitle: DEFAULT_CONFIG.hero_subtitle,
          why_title: DEFAULT_CONFIG.why_title,
          why_text: DEFAULT_CONFIG.why_text,
          materials: DEFAULT_CONFIG.materials,
          colors: DEFAULT_CONFIG.colors,
          price_per_gram: data.price_per_gram || DEFAULT_CONFIG.price_per_gram,
        }));
      } else {
        setConfig(data);
      }
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
    setConfirmModal({
      message: `Delete "${item.title}" from gallery?`,
      onConfirm: async () => {
        try {
          // Delete media files from Supabase Storage permanently
          if (item.media_urls) {
            const urls = item.media_urls.split(',').filter(Boolean);
            for (const url of urls) {
              // Extract the actual storage path from the public URL
              const parts = url.split('/storage/v1/object/public/gallery-media/');
              const storagePath = parts.length > 1 ? decodeURIComponent(parts[1]) : url.split('/').pop();
              const { error: storageErr } = await supabase.storage.from('gallery-media').remove([storagePath]);
              if (storageErr) console.error('Storage delete error:', storagePath, storageErr);
            }
          }
          // Delete the database record
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
        setConfirmModal(null);
      }
    });
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

  async function handleAddMediaToGalleryItem(files) {
    if (!editingGalleryItem || !files.length) return;
    setGalleryUploading(true);
    try {
      const existingUrls = editingGalleryItem.media_urls ? editingGalleryItem.media_urls.split(',').filter(Boolean) : [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('gallery-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('gallery-media').getPublicUrl(path);
        existingUrls.push(publicUrl);
      }
      const updatedItem = { ...editingGalleryItem, media_urls: existingUrls.join(',') };
      if (!updatedItem.cover_url && existingUrls.length > 0) updatedItem.cover_url = existingUrls[0];
      setEditingGalleryItem(updatedItem);
      addToast(`Added ${files.length} file(s).`, "success");
    } catch (err) {
      addToast("Upload failed: " + err.message, "error");
    }
    setGalleryUploading(false);
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

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    const invalid = files.filter(f => !f.name.toLowerCase().endsWith(".stl") && !f.name.toLowerCase().endsWith(".zip"));
    if (invalid.length > 0) { setFileError("Only .stl or .zip files accepted."); return; }
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
    if (selectedFiles.length === 0) errors.file = "Please upload at least one STL or ZIP file.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsUploading(true);
    try {
      let totalSize = 0;
      const urls = [];
      for (const file of selectedFiles) {
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("stl-files").upload(fileName, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("stl-files").getPublicUrl(fileName);
        urls.push(urlData.publicUrl);
        totalSize += file.size;
      }

      const trackingCode = generateTrackingCode();
      const weightGrams = clientMetrics ? clientMetrics.weightGrams : 0;
      const calculatedTotal = clientMetrics ? clientMetrics.totalPrice : (weightGrams * (parseFloat(config.price_per_gram) || 3));
      const formattedNotes = `[PROFILE:${orderLayerHeight}mm | NOZZLE:${orderNozzle}mm | INFILL:${orderInfill}%] ${newOrder.notes || ""}`.trim();

      const payload = {
        name: newOrder.name,
        phone: newOrder.phone.replace(/[\s\-()]/g, ""),
        email: newOrder.email,
        ordername: newOrder.orderName,
        material: newOrder.material,
        color: newOrder.color,
        notes: formattedNotes,
        fileurl: urls.join(","),
        filesize: totalSize,
        status: "queued",
        priority: queuedOrdersCount,
        weightgrams: weightGrams,
        pricepergram: config.price_per_gram,
        totalprice: calculatedTotal,
        tracking_code: trackingCode
      };

      const { error: insertErr } = await supabase.from("orders").insert([payload]);
      if (insertErr) throw new Error(insertErr.message);

      // Send invoice and order confirmation email via edge function
      triggerOrderEmail("INSERT", payload);

      // Save user info for next time
      localStorage.setItem("jp_user_info", JSON.stringify({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email }));
      
      // Save tracking code for auto-tracking
      try {
        const savedCodes = JSON.parse(localStorage.getItem("jp_tracking_codes") || "[]");
        savedCodes.push(trackingCode);
        localStorage.setItem("jp_tracking_codes", JSON.stringify([...new Set(savedCodes)]));
      } catch (err) { console.error("Could not save tracking code", err); }

      setOrderStep(4);
      setSuccessModal(trackingCode);
      setCopiedTrackingCode(false);
      setNewOrder({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email, orderName: "", material: config.materials.split(',')[0].trim(), color: config.colors.split(',')[0].trim(), notes: "", fileName: "" });
      setClientMetrics(null);
      setOrderInfill(20);
      setFormErrors({});
      setSelectedFiles([]);
      fetchOrders();
    } catch (err) {
      console.error(err);
      addToast("Failed to submit order:\n" + (err.message || err), "error");
    }
    setIsUploading(false);
  }

  async function triggerOrderEmail(type, orderRecord, oldRecord = null) {
    try {
      if (!orderRecord || !orderRecord.email) return;
      await supabase.functions.invoke("email-notifier", {
        body: {
          type,
          table: "orders",
          record: orderRecord,
          old_record: oldRecord
        }
      });
    } catch (err) {
      console.warn("Could not trigger email notification:", err);
    }
  }

  async function handleAdminLogout() {
    await supabase.auth.signOut();
    window.location.hash = "";
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
    await supabase.from("orders").update(updateData).eq("id", id);
    fetchOrders();
    if (order) {
      triggerOrderEmail("UPDATE", { ...order, ...updateData }, order);
    }
  }

  async function handleDeleteOrder(id) {
    setConfirmModal({
      message: "Delete this order permanently?",
      onConfirm: async () => {
        try {
          // Find the order to get its file URLs
          const order = orders.find(o => o.id === id);
          if (order && order.fileurl) {
            const fileUrls = order.fileurl.split(',').filter(Boolean);
            for (const url of fileUrls) {
              const parts = url.split('/storage/v1/object/public/stl-files/');
              const storagePath = parts.length > 1 ? decodeURIComponent(parts[1]) : url.split('/').pop();
              const { error: storageErr } = await supabase.storage.from('stl-files').remove([storagePath]);
              if (storageErr) console.error('STL storage delete error:', storagePath, storageErr);
            }
          }
          const { error } = await supabase.from("orders").delete().eq("id", id);
          if (error) {
            addToast("Delete failed: " + error.message, "error");
          } else {
            addToast("Order deleted permanently", "success");
          }
        } catch (err) {
          console.error('Delete order error:', err);
          addToast("Delete failed: " + err.message, "error");
        }
        setConfirmModal(null);
        fetchOrders();
      }
    });
  }

  async function handleUpdateWeight(id, weightStr, customPrice = null) {
    const weight = parseFloat(weightStr) || 0;
    const price = customPrice !== null && customPrice !== undefined && !isNaN(customPrice)
      ? parseFloat(customPrice)
      : weight * (parseFloat(config.price_per_gram) || 0);
    await supabase.from("orders").update({ weightgrams: weight, pricepergram: config.price_per_gram, totalprice: price }).eq("id", id);
    fetchOrders();
  }

  async function handleUpdatePrice(id, priceStr) {
    const price = parseFloat(priceStr);
    if (isNaN(price)) return;
    await supabase.from("orders").update({ totalprice: Math.max(0, price) }).eq("id", id);
    fetchOrders();
    addToast(`Updated order price to ${price.toFixed(2)} EGP`, "success");
  }

  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function isValidEgyptPhone(phone) { return /^01[0125]\d{8}$/.test(phone.replace(/[\s\-()]/g, "")); }

  function exportCSV() {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "ID,Name,Email,Phone,Order Name,Status,Material,Color,Weight,Total Price,Tracking Code,Created At\n"
      + getSortedOrders().map(o => {
          const finalP = o.totalprice !== null && o.totalprice !== undefined ? o.totalprice : ((o.weightgrams || 0) * (config.price_per_gram || 0));
          return `"${o.id}","${o.name || ''}","${o.email || ''}","${o.phone || ''}","${o.ordername || ''}","${o.status}","${o.material || ''}","${o.color || ''}",${o.weightgrams || 0},${finalP},"${o.tracking_code || ''}","${o.createdat}"`;
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
    if (adminSearch.trim()) {
      const q = adminSearch.toLowerCase();
      result = result.filter(o => 
        (o.name && o.name.toLowerCase().includes(q)) || 
        (o.phone && o.phone.includes(q)) || 
        (o.tracking_code && o.tracking_code.toLowerCase().includes(q))
      );
    }
    switch (sortBy) {
      case "weight": return result.sort((a, b) => (b.weightgrams || 0) - (a.weightgrams || 0));
      case "filesize": return result.sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
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
    const { error } = await supabase.from("site_config").upsert({ ...config, id: 1 });
    if (error) addToast("Failed to save config.", "error");
    else addToast("Configuration saved!", "success");
    setSavingCMS(false);
  }

  async function handleTrackSearch() {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return;
    const { data } = await supabase.rpc("search_orders", { q });
    setTrackResults(data && data.length > 0 ? data : "NOT_FOUND");
  }

  // ═══════════════════════════════════════════════════════════
  // LOGIN VIEW
  // ═══════════════════════════════════════════════════════════
  if (hash === "#boss" && !isAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-page)' }}>
        <div className="bg-orbs"><div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/></div>
        <div className="card" style={{ maxWidth: 420, width: "100%", position: "relative", zIndex: 10, textAlign: "center" }}>
          <img src={`${import.meta.env.BASE_URL}${darkMode ? "logo-dark.svg" : "logo-light.svg"}`} alt="Etba3ly" className="brand-logo-img admin-logo" style={{ height: 42, margin: '0 auto 20px', display: 'block' }} />
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

  // ═══════════════════════════════════════════════════════════
  // ADMIN DASHBOARD
  // ═══════════════════════════════════════════════════════════
  if (hash === "#boss" && isAdmin) {
    return (
      <div className="admin-container">
        <div className="bg-orbs"><div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/><div className="bg-orb bg-orb-3"/></div>
        <div style={{ position: "relative", zIndex: 10 }}>
          <div className="admin-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <img src={`${import.meta.env.BASE_URL}${darkMode ? "logo-dark.svg" : "logo-light.svg"}`} alt="Etba3ly" className="brand-logo-img admin-logo" style={{ height: 34, display: 'block' }} />
            <h1 style={{ fontSize: 36, margin: 0, flex: 1 }}>Command Center</h1>
            <button className="btn btn-glass" onClick={exportCSV}>Export CSV</button>
            <button className="btn btn-glass" onClick={handleAdminLogout}>Sign Out</button>
          </div>

          <div className="admin-tabs">
            <button className={`btn ${adminTab === "orders" ? "btn-primary" : "btn-glass"}`} onClick={() => setAdminTab("orders")}>Manage Orders</button>
            <button className={`btn ${adminTab === "gallery" ? "btn-primary" : "btn-glass"}`} onClick={() => setAdminTab("gallery")}>Gallery</button>
            <button className={`btn ${adminTab === "cms" ? "btn-primary" : "btn-glass"}`} onClick={() => setAdminTab("cms")}>Edit Website</button>
          </div>

          {adminTab === "orders" && (
            <>
              <div className="admin-stats-grid">
                <div className="card"><h3>Total Orders</h3><p style={{ fontSize: 36, margin: "8px 0 0", fontWeight: 900 }}>{orders.length}</p></div>
                <div className="card"><h3>Printing Now</h3><p style={{ fontSize: 36, margin: "8px 0 0", fontWeight: 900, color: "var(--status-printing)" }}>{orders.filter(o => o.status === "printing").length}</p></div>
                <div className="card"><h3>Completed</h3><p style={{ fontSize: 36, margin: "8px 0 0", fontWeight: 900, color: "var(--status-done)" }}>{orders.filter(o => o.status === "done").length}</p></div>
              </div>
              {/* Printer Status Dashboard */}
              <div className="printer-dashboard card" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--accent)" }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Printer Status & Telemetry
                  </h3>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>Tracks Website Orders & Direct USB Flash Drives</span>
                </div>
                <div className="printer-status-grid">
                  {PRINTERS.map(printer => {
                    const activeOrder = orders.find(o => o.status === "printing" && getPrinterFromNotes(o.notes) === printer);
                    const externalJob = externalPrinterStates[printer];
                    const isWorking = Boolean(activeOrder || (externalJob && externalJob.status === "working"));
                    const isExternal = !activeOrder && externalJob && externalJob.status === "working";

                    return (
                      <div key={printer} className={`printer-status-card ${isWorking ? (isExternal ? 'external-working' : 'working') : 'resting'}`}>
                        <div className="printer-status-indicator">
                          <div className={`printer-dot ${isWorking ? (isExternal ? 'external' : 'active') : 'idle'}`} />
                          <span className="printer-name">{printer}</span>
                        </div>
                        <div className="printer-status-label">
                          {activeOrder ? 'Working (Website Job)' : isExternal ? 'Working (Direct USB)' : 'Resting / Ready'}
                        </div>
                        {activeOrder && (
                          <div className="printer-current-order">
                            Printing: <strong>{activeOrder.ordername || "Untitled"}</strong> — {activeOrder.name}
                          </div>
                        )}
                        {isExternal && (
                          <div className="printer-current-order" style={{ color: "var(--accent)" }}>
                            Direct Print: <strong>{externalJob.jobName || "Flash Drive Job"}</strong>
                          </div>
                        )}
                        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {isExternal ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-glass"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              onClick={() => handleClearExternalJob(printer)}
                            >
                              Clear USB Job
                            </button>
                          ) : !activeOrder ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-glass"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              onClick={() => handleSetExternalJob(printer)}
                            >
                              Log USB Print
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                  <h3 style={{ margin: 0 }}>Order Queue</h3>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
                    <input 
                      placeholder="Search name, phone, code..." 
                      value={adminSearch} 
                      onChange={e => setAdminSearch(e.target.value)} 
                      style={{ padding: "6px 14px", fontSize: 13, minWidth: 200, borderRadius: "var(--radius-full)" }} 
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort:</span>
                      {["date", "weight", "filesize"].map(s => (
                        <button key={s} className={`btn ${sortBy === s ? "btn-primary" : "btn-glass"}`}
                          style={{ padding: "6px 14px", fontSize: 12 }}
                          onClick={() => setSortBy(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedOrders.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: "12px 16px", background: "rgba(255,128,0,0.1)", borderRadius: "var(--radius-sm)", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedOrders.length} selected:</span>
                    <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("queued")}>Queued</button>
                    <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("printing")}>Printing</button>
                    <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("done")}>Done</button>
                    <button className="btn btn-sm" style={{ background: "#FF3B30", color: "#fff" }} onClick={handleBulkDelete}>Delete</button>
                  </div>
                )}
                {getSortedOrders().map(o => {
                  const calculatedPrice = (o.weightgrams || 0) * (parseFloat(config.price_per_gram) || 0);
                  const isSelected = selectedOrders.includes(o.id);
                  return (
                    <div key={o.id} className="admin-order-card" style={{ display: 'flex', gap: 12 }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={(e) => {
                          if (e.target.checked) setSelectedOrders(prev => [...prev, o.id]);
                          else setSelectedOrders(prev => prev.filter(id => id !== o.id));
                        }}
                        style={{ width: 20, height: 20, marginTop: 16 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="admin-order-layout">
                          <div className="admin-order-info">
                          <div style={{ fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {o.ordername || "Untitled"}
                            <span style={{ fontSize: 10, background: o.status === "done" ? "var(--status-done)" : o.status === "printing" ? "var(--status-printing)" : "var(--status-queued)", color: "#fff", padding: "3px 10px", borderRadius: "var(--radius-full)", fontWeight: 700 }}>{o.status.toUpperCase()}</span>
                            {o.tracking_code && <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, fontFamily: "monospace" }}>{o.tracking_code}</span>}
                            {o.status === "printing" && getPrinterFromNotes(o.notes) && <span style={{ fontSize: 10, background: "rgba(0,122,255,0.1)", color: "var(--status-printing)", padding: "3px 10px", borderRadius: "var(--radius-full)", fontWeight: 700, border: "1px solid rgba(0,122,255,0.2)" }}>[PRINTER: {getPrinterFromNotes(o.notes)}]</span>}
                          </div>
                          <div style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 13 }}>{o.name} &bull; {o.phone}{o.email ? ` &bull; ${o.email}` : ""}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span>{o.material} ({o.color})</span>
                            {o.notes && o.notes.includes("[INFILL:") && (
                              <span style={{ fontSize: 11, background: "rgba(255, 128, 0, 0.12)", color: "var(--accent)", padding: "2px 8px", borderRadius: "var(--radius-full)", fontWeight: 700 }}>
                                {o.notes.match(/\[INFILL:([^\]]+)\]/)?.[1] || ""} Infill
                              </span>
                            )}
                          </div>
                          {getCleanNotes(o.notes) && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>Notes: {getCleanNotes(o.notes)}</div>}
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                            {o.createdat && <span>{new Date(o.createdat).toLocaleString()} &bull; </span>}
                            {o.filesize > 0 && <span>{(o.filesize / 1024).toFixed(0)} KB</span>}
                          </div>
                        </div>
                        <div className="admin-order-actions">
                          <select value={o.status} onChange={(e) => {
                            const newStatus = e.target.value;
                            if (newStatus === "printing") {
                              const busyPrinters = orders.filter(x => x.status === "printing" && x.id !== o.id).map(x => getPrinterFromNotes(x.notes)).filter(Boolean);
                              const available = PRINTERS.find(p => !busyPrinters.includes(p)) || PRINTERS[0];
                              handleUpdateOrderStatus(o.id, newStatus, available);
                            } else {
                              handleUpdateOrderStatus(o.id, newStatus);
                            }
                          }} style={{ width: 130, padding: 10, fontSize: 13 }}>
                            <option value="queued">Queued</option>
                            <option value="printing">Printing</option>
                            <option value="done">Done</option>
                          </select>
                          {o.status === "printing" && (
                            <select value={getPrinterFromNotes(o.notes) || PRINTERS[0]} onChange={(e) => handleUpdateOrderStatus(o.id, "printing", e.target.value)} style={{ width: 150, padding: 10, fontSize: 13 }}>
                              {PRINTERS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          )}
                          {Boolean(o.fileurl && o.fileurl.toLowerCase().includes('.stl')) && (
                            <button
                              type="button"
                              onClick={() => setAdminSlicerOrder(o)}
                              className="btn btn-accent"
                              style={{ padding: "8px 16px", fontSize: 12 }}
                            >
                              Inspect & Slice 3D
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenMoonrakerForOrder(o)}
                            className="btn btn-glass"
                            style={{ padding: "8px 16px", fontSize: 12 }}
                          >
                            Send to Printer
                          </button>
                          {o.fileurl && o.fileurl.split(',').map((url, idx, arr) => (
                            <a key={idx} href={url} download target="_blank" rel="noreferrer" className="btn btn-glass" style={{ padding: "8px 16px", fontSize: 12 }}>
                              Download {arr.length > 1 ? idx + 1 : ""}
                            </a>
                          ))}
                          <button onClick={() => setEditingOrder(o)} className="btn btn-glass" style={{ padding: "8px 16px", fontSize: 12 }}>Edit</button>
                          <button onClick={() => handleDeleteOrder(o.id)} style={{ padding: "8px 16px", background: "#FF3B30", color: "#fff", border: "none", borderRadius: "var(--radius-full)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Delete</button>
                        </div>
                      </div>
                      <div className="admin-order-footer" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ margin: 0, whiteSpace: "nowrap", fontSize: 12 }}>Weight (g)</label>
                          <input
                            type="number"
                            step="0.1"
                            key={`w_${o.id}_${o.weightgrams}`}
                            defaultValue={o.weightgrams || ""}
                            placeholder="0"
                            onBlur={(e) => handleUpdateWeight(o.id, e.target.value)}
                            style={{ width: 85, padding: "6px 10px", fontSize: 13 }}
                          />
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          Rate: <strong style={{ color: "var(--text-primary)" }}>{config.price_per_gram} EGP/g</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                          <label style={{ margin: 0, whiteSpace: "nowrap", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>Price (EGP)</label>
                          <input
                            type="number"
                            step="0.5"
                            key={`p_${o.id}_${o.totalprice}`}
                            defaultValue={o.totalprice !== null && o.totalprice !== undefined ? Number(o.totalprice).toFixed(2) : calculatedPrice.toFixed(2)}
                            placeholder="0.00"
                            onBlur={(e) => handleUpdatePrice(o.id, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleUpdatePrice(o.id, e.target.value)}
                            style={{ width: 110, padding: "6px 10px", fontSize: 14, fontWeight: 900, color: "var(--accent)", textAlign: "right" }}
                            title="Click to edit final order price"
                          />
                        </div>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {adminTab === "gallery" && (
            <>
              {/* Add New Gallery Item */}
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16 }}>Add New Gallery Product</h3>
                <div className="form-row">
                  <div style={{ flex: 1 }}><label>Title *</label><input value={newGalleryItem.title} onChange={e => setNewGalleryItem(p => ({...p, title: e.target.value}))} placeholder="Product title" style={{ marginBottom: 12 }} /></div>
                </div>
                <div style={{ marginBottom: 12 }}><label>Description</label><textarea rows="2" value={newGalleryItem.description} onChange={e => setNewGalleryItem(p => ({...p, description: e.target.value}))} placeholder="Brief description..." /></div>
                <div style={{ marginBottom: 16 }}>
                  <label>Images / GIFs *</label>
                  <input type="file" multiple accept="image/*,.gif" onChange={e => setNewGalleryFiles(Array.from(e.target.files))} style={{ padding: 14, border: "2px dashed var(--border-glass)", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.05)" }} />
                  {newGalleryFiles.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{newGalleryFiles.length} file(s) selected</div>}
                </div>
                <button className="btn btn-primary" onClick={handleAddGalleryItem} disabled={galleryUploading}>{galleryUploading ? "Uploading..." : "Add to Gallery"}</button>
              </div>

              {/* Existing Gallery Items */}
              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Gallery Items ({galleryItems.length})</h3>
                {galleryItems.length === 0 && <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>No gallery items yet. Add one above.</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {galleryItems.map(item => {
                    const mediaUrls = item.media_urls ? item.media_urls.split(',').filter(Boolean) : [];
                    return (
                      <div key={item.id} className="admin-gallery-card">
                        <div className="admin-gallery-cover">
                          {item.cover_url ? <img src={item.cover_url} alt={item.title} /> : <CubeIcon />}
                          <div className="admin-gallery-media-count">{mediaUrls.length} media</div>
                        </div>
                        <div style={{ padding: '12px 16px' }}>
                          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>{item.title}</h4>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{item.description || 'No description'}</p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-glass" style={{ padding: '6px 12px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setEditingGalleryItem({...item}); }}>Edit</button>
                            <button style={{ padding: '6px 12px', fontSize: 12, background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleDeleteGalleryItem(item); }}>Delete</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {adminTab === "cms" && (
            <div className="card" style={{ maxWidth: 800 }}>
              <h3 style={{ marginBottom: 8 }}>Content Management</h3>
              <p style={{ marginBottom: 28, fontSize: 14 }}>Update your website text and pricing instantly.</p>
              <form onSubmit={handleUpdateCMS}>
                <div style={{ marginBottom: 20 }}><label>Brand Name</label><input value={config.brand_name || ""} onChange={e => setConfig(p => ({ ...p, brand_name: e.target.value }))} /></div>
                <div style={{ marginBottom: 20 }}><label>Price per Gram (EGP)</label><input type="number" value={config.price_per_gram} onChange={e => setConfig(p => ({ ...p, price_per_gram: e.target.value }))} /></div>
                <div style={{ marginBottom: 20 }}><label>Announcement Text</label><input value={config.announcement_text || ""} onChange={e => setConfig(p => ({ ...p, announcement_text: e.target.value }))} placeholder="Site wide announcement..." /></div>
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ margin: 0 }}>Show Announcement</label>
                  <input type="checkbox" checked={config.announcement_active || false} onChange={e => setConfig(p => ({ ...p, announcement_active: e.target.checked }))} style={{ width: 24, height: 24 }} />
                </div>
                <hr style={{ border: 0, borderTop: "1px solid var(--border-glass)", margin: "28px 0" }} />
                <div style={{ marginBottom: 20 }}><label>Materials (comma separated)</label><input value={config.materials} onChange={e => setConfig(p => ({ ...p, materials: e.target.value }))} /></div>
                <div style={{ marginBottom: 28 }}><label>Colors (comma separated)</label><input value={config.colors} onChange={e => setConfig(p => ({ ...p, colors: e.target.value }))} /></div>
                <hr style={{ border: 0, borderTop: "1px solid var(--border-glass)", margin: "28px 0" }} />
                <div style={{ marginBottom: 20 }}><label>Hero Title</label><input value={config.hero_title} onChange={e => setConfig(p => ({ ...p, hero_title: e.target.value }))} /></div>
                <div style={{ marginBottom: 20 }}><label>Hero Subtitle</label><textarea rows="3" value={config.hero_subtitle} onChange={e => setConfig(p => ({ ...p, hero_subtitle: e.target.value }))} /></div>
                <div style={{ marginBottom: 20 }}><label>Why Us - Title</label><input value={config.why_title} onChange={e => setConfig(p => ({ ...p, why_title: e.target.value }))} /></div>
                <div style={{ marginBottom: 32 }}><label>Why Us - Text</label><textarea rows="4" value={config.why_text} onChange={e => setConfig(p => ({ ...p, why_text: e.target.value }))} /></div>
                <hr style={{ border: 0, borderTop: "1px solid var(--border-glass)", margin: "28px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <label style={{ margin: 0 }}>Social & Contact Info</label>
                  <button type="button" className={`btn ${config.show_socials !== false ? "btn-accent" : "btn-glass"}`} style={{ padding: "8px 12px", gap: 6 }} onClick={() => setConfig(p => ({ ...p, show_socials: p.show_socials === false ? true : false }))}>
                    {config.show_socials !== false ? <EyeIcon /> : <EyeSlashIcon />} {config.show_socials !== false ? "Visible" : "Hidden"}
                  </button>
                </div>
                <div style={{ marginBottom: 20 }}><label>WhatsApp Number</label><input value={config.whatsapp_number || ""} onChange={e => setConfig(p => ({ ...p, whatsapp_number: e.target.value }))} placeholder="e.g. +201012345678" /></div>
                <div style={{ marginBottom: 20 }}><label>Instagram Link</label><input value={config.instagram_link || ""} onChange={e => setConfig(p => ({ ...p, instagram_link: e.target.value }))} placeholder="https://instagram.com/..." /></div>
                <div style={{ marginBottom: 28 }}><label>Email Address</label><input type="email" value={config.email_address || ""} onChange={e => setConfig(p => ({ ...p, email_address: e.target.value }))} placeholder="hello@example.com" /></div>
                <div style={{ marginBottom: 32 }}><label>Privacy Policy</label><textarea rows="6" value={config.privacy_policy || ""} onChange={e => setConfig(p => ({ ...p, privacy_policy: e.target.value }))} placeholder="Enter your privacy policy text here..." /></div>
                <button type="submit" className="btn btn-primary" disabled={savingCMS}>{savingCMS ? "Saving..." : "Save Configuration"}</button>
              </form>
            </div>
          )}

          {/* Admin Modals */}
          {confirmModal && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="modal-content" style={{ padding: 32, textAlign: 'center' }}>
                <h3 style={{ marginBottom: 16 }}>{confirmModal.message}</h3>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                  <button className="btn btn-glass" onClick={() => setConfirmModal(null)}>Cancel</button>
                  <button className="btn btn-danger" style={{ background: '#FF3B30', color: 'white' }} onClick={confirmModal.onConfirm}>Confirm</button>
                </div>
              </div>
            </div>
          )}

          {editingOrder && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="modal-content" style={{ padding: 32, width: '90%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ marginBottom: 24 }}>Edit Order: {editingOrder.ordername || "Untitled"}</h2>
                
                <div className="form-row">
                  <div style={{ flex: 1 }}><label>Name</label><input value={editingOrder.name || ""} onChange={e => setEditingOrder({...editingOrder, name: e.target.value})} style={{ width: '100%', marginBottom: 16 }} /></div>
                  <div style={{ flex: 1 }}><label>Phone</label><input value={editingOrder.phone || ""} onChange={e => setEditingOrder({...editingOrder, phone: e.target.value})} style={{ width: '100%', marginBottom: 16 }} /></div>
                </div>
                <div><label>Email</label><input value={editingOrder.email || ""} onChange={e => setEditingOrder({...editingOrder, email: e.target.value})} style={{ width: '100%', marginBottom: 16 }} /></div>
                <div className="form-row">
                  <div style={{ flex: 1 }}><label>Material</label><input value={editingOrder.material || ""} onChange={e => setEditingOrder({...editingOrder, material: e.target.value})} style={{ width: '100%', marginBottom: 16 }} /></div>
                  <div style={{ flex: 1 }}><label>Color</label><input value={editingOrder.color || ""} onChange={e => setEditingOrder({...editingOrder, color: e.target.value})} style={{ width: '100%', marginBottom: 16 }} /></div>
                </div>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Weight (grams)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingOrder.weightgrams ?? ""}
                      onChange={e => {
                        const w = parseFloat(e.target.value) || 0;
                        const autoP = w * (parseFloat(config.price_per_gram) || 0);
                        setEditingOrder({ ...editingOrder, weightgrams: w, totalprice: autoP });
                      }}
                      style={{ width: '100%', marginBottom: 16 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Total Price (EGP)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingOrder.totalprice ?? ""}
                      onChange={e => setEditingOrder({ ...editingOrder, totalprice: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', marginBottom: 16, fontWeight: 700, color: 'var(--accent)' }}
                    />
                  </div>
                </div>
                <div>
                  <label>Notes</label>
                  <textarea rows="3" value={getCleanNotes(editingOrder.notes)} onChange={e => setEditingOrder({...editingOrder, notes: setPrinterInNotes(e.target.value, getPrinterFromNotes(editingOrder.notes))})} style={{ width: '100%', marginBottom: 16 }} />
                </div>
                
                <div>
                  <label>Files</label>
                  {editingOrder.fileurl ? editingOrder.fileurl.split(',').map((url, idx) => {
                    const parts = url.split('/');
                    const filename = parts[parts.length - 1];
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{filename}</span>
                        <button className="btn btn-sm" style={{ background: '#FF3B30', color: 'white', padding: "4px 8px", border: "none", borderRadius: "var(--radius-full)", cursor: "pointer" }} onClick={async () => {
                           if(!window.confirm("Permanently delete this file?")) return;
                           const newUrls = editingOrder.fileurl.split(',').filter((_, i) => i !== idx);
                           await supabase.storage.from('stl-files').remove([filename]);
                           setEditingOrder({ ...editingOrder, fileurl: newUrls.join(',') });
                        }}>Delete</button>
                      </div>
                    );
                  }) : <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No files attached.</div>}
                </div>

                <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 32 }}>
                  <button className="btn btn-glass" onClick={() => setEditingOrder(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={async () => {
                    await supabase.from("orders").update(editingOrder).eq("id", editingOrder.id);
                    fetchOrders();
                    setEditingOrder(null);
                    addToast("Order updated", "success");
                  }}>Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {editingGalleryItem && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="modal-content" style={{ padding: 32, width: '90%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ marginBottom: 24 }}>Edit Gallery Item</h2>
                <div style={{ marginBottom: 16 }}><label>Title</label><input value={editingGalleryItem.title} onChange={e => setEditingGalleryItem({...editingGalleryItem, title: e.target.value})} /></div>
                <div style={{ marginBottom: 16 }}><label>Description</label><textarea rows="3" value={editingGalleryItem.description || ""} onChange={e => setEditingGalleryItem({...editingGalleryItem, description: e.target.value})} /></div>
                
                <label>Media Files</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {editingGalleryItem.media_urls && editingGalleryItem.media_urls.split(',').filter(Boolean).map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: editingGalleryItem.cover_url === url ? '3px solid var(--accent)' : '1px solid var(--border-glass)' }}>
                      <img src={url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                      <div style={{ display: 'flex', gap: 4, padding: 4 }}>
                        <button style={{ flex: 1, fontSize: 10, padding: '4px', cursor: 'pointer', background: editingGalleryItem.cover_url === url ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: editingGalleryItem.cover_url === url ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: 4 }} onClick={() => setEditingGalleryItem({...editingGalleryItem, cover_url: url})}>Cover</button>
                        <button style={{ fontSize: 10, padding: '4px 6px', cursor: 'pointer', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4 }} onClick={() => handleRemoveMediaFromGalleryItem(url)}>X</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label>Add More Images / GIFs</label>
                  <input type="file" multiple accept="image/*,.gif" onChange={e => handleAddMediaToGalleryItem(Array.from(e.target.files))} style={{ padding: 14, border: "2px dashed var(--border-glass)", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.05)" }} />
                  {galleryUploading && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>Uploading...</div>}
                </div>

                <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
                  <button className="btn btn-glass" onClick={() => setEditingGalleryItem(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveGalleryItem}>Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {/* Admin 3D Slicer Modal */}
          <AdminSlicerModal
            isOpen={Boolean(adminSlicerOrder)}
            onClose={() => setAdminSlicerOrder(null)}
            order={adminSlicerOrder}
            pricePerGram={config.price_per_gram}
            onUpdateWeightPrice={(id, weight, price) => {
              handleUpdateWeight(id, weight, price);
              addToast(`Updated order to ${weight}g & ${Number(price).toFixed(2)} EGP`, "success");
              setAdminSlicerOrder(null);
            }}
            onOpenMoonraker={(order, gcode) => {
              setAdminSlicerOrder(null);
              handleOpenMoonrakerForOrder(order, gcode);
            }}
          />

          {/* Moonraker Hardware Dispatch Modal */}
          <MoonrakerDispatchModal
            isOpen={Boolean(moonrakerOrder)}
            onClose={() => setMoonrakerOrder(null)}
            order={moonrakerOrder}
            gcodeString={moonrakerGcode}
            fileName={moonrakerOrder ? (moonrakerOrder.ordername || 'job') : 'model'}
            onDispatchSuccess={handleMoonrakerDispatchSuccess}
          />

          {/* External USB Print Prompt Modal */}
          {externalPromptPrinter && (
            <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setExternalPromptPrinter(null)}>
              <div className="modal-content" style={{ maxWidth: 440, width: "100%", padding: 28, textAlign: "left" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 18, fontWeight: 800 }}>Log Direct USB Print for {externalPromptPrinter}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  Track hardware usage when running a print directly from a USB flash drive or physical touchscreen.
                </p>
                <div style={{ marginBottom: 20 }}>
                  <label>Job or Part Description</label>
                  <input
                    value={externalJobInput}
                    onChange={e => setExternalJobInput(e.target.value)}
                    placeholder="e.g. Flash Drive: Mechanical Gear"
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && handleSaveExternalJob()}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-glass" onClick={() => setExternalPromptPrinter(null)}>Cancel</button>
                  <button type="button" className="btn btn-accent" onClick={handleSaveExternalJob}>Mark as Working</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC WEBSITE
  // ═══════════════════════════════════════════════════════════
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
      <div className="canvas-wrapper">
        <div style={{ position: "sticky", top: 80, height: "calc(100vh - 80px)", width: "100%" }}>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 7], fov: 40 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            performance={{ min: 0.5 }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1.8} color="#ffffff" />
            <directionalLight position={[-5, -5, -5]} intensity={0.3} color="#FFB347" />
            <Suspense fallback={<SceneLoader />}>
              <PrintScene />
              <Environment preset="city" />
            </Suspense>
          </Canvas>
        </div>
      </div>

      {/* Navigation */}
      <nav className="header">
        <a href="#home" className="logo" style={{ textDecoration: "none" }} onClick={() => setMobileMenuOpen(false)} aria-label={brandName}>
          <img src={`${import.meta.env.BASE_URL}${darkMode ? "logo-dark.svg" : "logo-light.svg"}`} alt={brandName} className="brand-logo-img nav-logo" />
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
          <a href="#why" onClick={() => setMobileMenuOpen(false)}>Why Us</a>
          <a href="#full-gallery" onClick={() => setMobileMenuOpen(false)}>Gallery</a>
          <a href="#order" onClick={() => setMobileMenuOpen(false)}>Order</a>
          <a href="#track" onClick={() => setMobileMenuOpen(false)}>Track</a>
          <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a>
        </div>
      </nav>

      {config.announcement_active && config.announcement_text && hash !== "#boss" && (
        <div style={{ background: "var(--accent-gradient)", color: "#fff", textAlign: "center", padding: "12px 24px", fontSize: 14, fontWeight: 600, marginTop: 80, marginInline: 24, borderRadius: "var(--radius-full)", position: "relative", zIndex: 50, boxShadow: "var(--accent-glow)" }}>
          {config.announcement_text}
        </div>
      )}

      <main>
        {hash === "#full-gallery" && <FullGalleryView items={galleryItems} onItemClick={(item) => { setActiveGalleryItem(item); setActiveMediaIndex(0); }} />}
        
        {hash === "#order" && (
          <section className="section-container animate-in" style={{ paddingTop: 140, minHeight: "100vh", position: "relative", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 8 }}>{orderStep === 4 ? "Order Received!" : "Place Order"}</h1>
              {orderStep < 4 && <p style={{ margin: 0 }}>Step {orderStep} of 3</p>}
              {orderStep === 1 && <a href="#home" style={{ display: "inline-block", marginTop: 8, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>← Cancel</a>}
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
                  <span className="stepper-label">Details</span>
                </div>
                <div className={`stepper-line ${orderStep > 2 ? "filled" : ""}`} />
                <div className={`stepper-step ${orderStep > 3 ? "completed" : ""} ${orderStep === 3 ? "active" : ""}`}>
                  <div className="stepper-dot">{orderStep > 3 ? <CheckIcon /> : "3"}</div>
                  <span className="stepper-label">Review</span>
                </div>
              </div>
            )}

            <div className="card" style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>
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
                    }}>Next Step →</button>
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
                  <div className="form-row">
                    <div>
                      <label>Material</label>
                      <select value={newOrder.material} onChange={e => setNewOrder(p => ({ ...p, material: e.target.value }))}>
                        {config.materials.split(',').map(m => <option key={m}>{m.trim()}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Color</label>
                      <select value={newOrder.color} onChange={e => setNewOrder(p => ({ ...p, color: e.target.value }))}>
                        {config.colors.split(',').map(c => <option key={c}>{c.trim()}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Print Quality / Profile</label>
                      <select value={orderLayerHeight} onChange={e => {
                        const lh = parseFloat(e.target.value);
                        setOrderLayerHeight(lh);
                        if (lh <= 0.10) setOrderNozzle(0.20);
                        else setOrderNozzle(0.40);
                      }}>
                        <option value={0.20}>0.20 mm Standard (0.4 Nozzle - Balanced)</option>
                        <option value={0.10}>0.10 mm Ultra-Fine (0.2 Nozzle - High Precision)</option>
                        <option value={0.12}>0.12 mm High Detail (0.4 Nozzle)</option>
                        <option value={0.28}>0.28 mm Draft / Rapid (0.4 Nozzle)</option>
                      </select>
                    </div>
                    <div>
                      <label>Infill Density</label>
                      <select value={orderInfill} onChange={e => setOrderInfill(parseInt(e.target.value, 10))}>
                        <option value={20}>Standard (20%) - Recommended for Most Parts</option>
                        <option value={50}>High Strength (50%) - Functional & Heavy Duty</option>
                        <option value={15}>Light / Draft (15%) - Rapid Prototyping</option>
                        <option value={100}>Solid (100%) - Maximum Structural Density</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Notes / Special Instructions</label>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{newOrder.notes.length}/500</span>
                    </div>
                    <textarea value={newOrder.notes} maxLength={500} onChange={e => setNewOrder(p => ({ ...p, notes: e.target.value }))} placeholder="Orientation, special tolerances, requests..." rows="3" />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label>STL or ZIP File(s) *</label>
                    <div className={`drop-zone ${isDragging ? 'active' : ''}`} 
                         onDragOver={handleDragOver} 
                         onDragLeave={handleDragLeave} 
                         onDrop={handleDrop}
                         style={formErrors.file ? { borderColor: "#FF3B30" } : {}}>
                      <input type="file" multiple accept=".stl,.zip" onChange={handleFileChange} style={{ display: 'none' }} id="fileInput" />
                      <label htmlFor="fileInput" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 38, height: 38, color: "var(--accent)" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <div style={{ fontWeight: 650, fontSize: 15, color: "var(--text-primary)" }}>
                          {selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(", ") : "Choose Files or Drag & Drop"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          STL or ZIP archive up to 50MB
                        </div>
                      </label>
                    </div>
                    {fileError && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{fileError}</div>}
                    {formErrors.file && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8, fontWeight: 600 }}>{formErrors.file}</div>}
                  </div>

                  {/* 3D STL Object Preview & Slicer Estimation */}
                  {Boolean(selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))) && (
                    <div style={{ marginBottom: 24 }}>
                      <label>3D Model & Build Plate Preview</label>
                      <STLViewer
                        file={selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))}
                        infillPercent={orderInfill}
                        layerHeight={orderLayerHeight}
                        nozzleSize={orderNozzle}
                        materialKey={newOrder.material || "pla"}
                        pricePerGram={config.price_per_gram}
                        onMetricsChange={setClientMetrics}
                        height="260px"
                      />

                      {clientMetrics && (
                        <div className="print-estimate-card">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>
                              Client Print Estimate
                            </span>
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-full)", background: clientMetrics.fitsBed ? "rgba(52, 199, 89, 0.15)" : "rgba(255, 59, 48, 0.15)", color: clientMetrics.fitsBed ? "var(--status-done)" : "#FF3B30", fontWeight: 700, border: `1px solid ${clientMetrics.fitsBed ? 'rgba(52,199,89,0.3)' : 'rgba(255,59,48,0.3)'}` }}>
                              {clientMetrics.fitsBed ? "Fits Centauri Bed (256x256mm)" : "Exceeds Bed Envelope"}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Est. Weight</div>
                              <div style={{ fontSize: 16, fontWeight: 800 }}>{(clientMetrics.weightGrams ?? clientMetrics.filamentWeightGrams ?? 0)} g</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Est. Time</div>
                              <div style={{ fontSize: 16, fontWeight: 800 }}>{clientMetrics.printTimeFormatted}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Est. Price</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--accent)" }}>{clientMetrics.totalPrice.toFixed(2)} EGP</div>
                            </div>
                            {clientMetrics.metrics && (
                              <div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dimensions</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{clientMetrics.metrics.width} x {clientMetrics.metrics.depth} x {clientMetrics.metrics.height} mm</div>
                              </div>
                            )}
                            {clientMetrics.filamentLengthMeters && (
                              <div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Filament & Layers</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{clientMetrics.filamentLengthMeters}m &bull; {clientMetrics.numLayers} L</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div style={{
                        marginTop: 10,
                        padding: "10px 14px",
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: "var(--text-tertiary)",
                        background: "rgba(128,128,128,0.06)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(128,128,128,0.12)"
                      }}>
                        * This is a rough estimate based on the uploaded model geometry.
                        Actual weight, print time, and final price may vary depending on the
                        slicer profile, orientation, support structures, and quality settings
                        selected by our print team. You will be notified of the confirmed
                        price before printing begins.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                    <button className="btn btn-glass" onClick={() => setOrderStep(1)}>Back</button>
                    <button className="btn btn-accent" onClick={() => {
                      const errors = {};
                      if (selectedFiles.length === 0) errors.file = "Please upload at least one STL or ZIP file.";
                      setFormErrors(errors);
                      if (Object.keys(errors).length === 0) setOrderStep(3);
                    }}>Review Order</button>
                  </div>
                </div>
              )}

              {orderStep === 3 && (
                <div className="animate-in">
                  <h3 style={{ marginBottom: 16 }}>Order Summary</h3>
                  <div className="review-summary-card">
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
                      <span className="review-item-label">Material & Color</span>
                      <span className="review-item-value">{newOrder.material?.toUpperCase()} ({newOrder.color})</span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Print Profile</span>
                      <span className="review-item-value">{orderLayerHeight} mm ({orderNozzle} mm Nozzle)</span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">Infill Density</span>
                      <span className="review-item-value">
                        {orderInfill}% {orderInfill === 20 ? "(Standard)" : orderInfill === 50 ? "(High Strength)" : orderInfill === 100 ? "(Solid)" : "(Draft)"}
                      </span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">File Name</span>
                      <span className="review-item-value" style={{ wordBreak: "break-all" }}>{newOrder.fileName}</span>
                    </div>

                    {clientMetrics && (
                      <>
                        <div style={{ margin: "6px 0", borderTop: "1px solid var(--border-glass)" }}></div>
                        <div className="review-item">
                          <span className="review-item-label">Est. Weight & Time</span>
                          <span className="review-item-value">
                            ~{(clientMetrics.weightGrams ?? clientMetrics.filamentWeightGrams ?? 0)} g &bull; ~{clientMetrics.printTimeFormatted}
                          </span>
                        </div>
                        {clientMetrics.metrics && (
                          <div className="review-item">
                            <span className="review-item-label">Dimensions</span>
                            <span className="review-item-value">
                              {clientMetrics.metrics.width} x {clientMetrics.metrics.depth} x {clientMetrics.metrics.height} mm
                            </span>
                          </div>
                        )}
                        <div className="review-item" style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border-glass)" }}>
                          <span className="review-item-label" style={{ fontSize: 15, fontWeight: 700 }}>Est. Total</span>
                          <span style={{ fontSize: 20, fontWeight: 900, color: "var(--accent)" }}>
                            {clientMetrics.totalPrice.toFixed(2)} EGP
                          </span>
                        </div>
                      </>
                    )}
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
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
                    <a href="#track" className="btn btn-accent" style={{ width: "100%" }} onClick={() => setOrderStep(1)}>Go Track Your Order</a>
                    <a href="#home" className="btn btn-glass" style={{ width: "100%" }} onClick={() => setOrderStep(1)}>← Back to Home</a>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {hash === "#track" && (
          <section className="section-container animate-in" style={{ paddingTop: 140, minHeight: "100vh", position: "relative", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 12 }}>Track Your Order</h1>
              <p>Enter your tracking code or phone number to see its status.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
                <div className="queue-badge">
                  <div className="live-dot" />
                  <span><strong>{queuedOrdersCount}</strong> in queue</span>
                </div>
                <a href="#home" style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>← Back to Home</a>
              </div>
            </div>
            
            <div className="card" style={{ maxWidth: 600, margin: "0 auto 40px", width: "100%" }}>
              <div className="track-search-row" style={{ marginBottom: 0 }}>
                <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)} placeholder="Tracking Code (JP-...)" onKeyDown={e => e.key === "Enter" && handleTrackSearch()} />
                <button className="btn btn-primary" onClick={handleTrackSearch}>Search</button>
              </div>
            </div>

            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {trackResults === "NOT_FOUND" && (
                <div className="card animate-in" style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 48, height: 48, color: "var(--text-tertiary)", marginBottom: 16}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <p style={{ margin: 0 }}>No orders found. Double-check your tracking code or phone number.</p>
                </div>
              )}

              {Array.isArray(trackResults) && trackResults.map(r => (
                <div key={r.id} className="card animate-in" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>{r.ordername || "Untitled Order"}</h3>
                    {r.tracking_code && <CopyableCode code={r.tracking_code} />}
                  </div>
                  <StatusStepper status={r.status} />
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16, fontSize: 14, color: "var(--text-secondary)" }}>
                    <span>Material: <strong style={{ color: "var(--text-primary)" }}>{r.material}</strong></span>
                    <span>Color: <strong style={{ color: "var(--text-primary)" }}>{r.color}</strong></span>
                    {r.totalprice > 0 && <span>Price: <strong style={{ color: "var(--accent)" }}>{r.totalprice.toFixed(2)} EGP</strong></span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ maxWidth: 600, margin: "40px auto 0", textAlign: "center", padding: 32 }}>
              <h3 style={{ marginBottom: 16 }}>Need Help?</h3>
              <p style={{ fontSize: 14, marginBottom: 24 }}>Contact us directly for support or special requests.</p>
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
        {/* ── HERO ── */}
        <section id="home" className="section-container animate-in">
          <div className="hero-badge">
            <span className="live-dot" />
            <span>Campus 3D Fabrication Studio</span>
          </div>
          <h1 style={{ whiteSpace: "pre-line" }}>{config.hero_title}</h1>
          <p style={{ whiteSpace: "pre-line" }}>{config.hero_subtitle}</p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <a href="#order" className="btn btn-accent">Place an Order</a>
            {config.whatsapp_number && (
              <a href={`https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent("Hello! I'd like to place an order.")}`} target="_blank" rel="noreferrer" className="btn btn-glass" style={{ gap: 8 }}>
                <WhatsAppIcon /> Order via WhatsApp
              </a>
            )}
            <a href="#track" className="btn btn-glass">Track Order</a>
          </div>
        </section>

        {/* ── WHY US ── */}
        <section id="why" className="section-container reveal">
          <h2>{config.why_title}</h2>
          <p>{config.why_text}</p>
          <div className="feature-cards">
            {[
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 26, height: 26, color: "var(--accent)"}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: "Fast Turnaround", desc: "Most orders completed and inspected within 24 to 48 hours." },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 26, height: 26, color: "var(--status-done)"}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, title: "Student Pricing", desc: `Transparent ${config.price_per_gram} EGP per gram with real-time automated slicing estimation.` },
              { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 26, height: 26, color: "var(--status-printing)"}}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, title: "Micro-Precision", desc: "0.10mm to 0.20mm industrial tolerance on Centauri & Bambu Lab build plates." }
            ].map((f, i) => (
              <div key={i} className="card feature-card">
                <div className="feature-icon-wrapper">{f.icon}</div>
                <h3 style={{ marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>{f.desc}</p>
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
            <a href="#full-gallery" className="btn btn-glass">View Full Gallery</a>
          </div>
        </section>

        {/* ── ABOUT ── */}
        <section id="about" className="section-container reveal">
          <h2>About Us</h2>
          <p>We're a team of student engineers passionate about bringing ideas to life. Our 3D printing setup is calibrated daily for optimal results — from functional prototypes to creative projects.</p>
        </section>

        {/* ── CONTACT ── */}
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
          <a href="#order" className="floating-cta">
            Order Now
          </a>
        )}
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
            <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>×</button>
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
              <img src={`${import.meta.env.BASE_URL}logo-dark.svg`} alt={brandName} className="footer-logo-img footer-logo" />
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: 0 }}>Student-powered 3D printing. Fast, affordable, on campus.</p>
          </div>
          <div className="footer-col">
            <h4>Quick Links</h4>
            <a href="#order">Place Order</a>
            <a href="#track">Track Order</a>
            <a href="#full-gallery">Gallery</a>
            <a href="#about">About</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setPrivacyModalOpen(true); }}>Privacy Policy</a>
          </div>
          <div className="footer-col">
            <h4>Connect</h4>
            {config.show_socials !== false ? (
              <div className="social-links">
                {config.instagram_link && <a href={config.instagram_link} target="_blank" rel="noreferrer" className="social-link"><InstagramIcon /></a>}
                {config.whatsapp_number && <a href={`https://wa.me/${config.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="social-link"><WhatsAppIcon /></a>}
                {config.email_address && <a href={`mailto:${config.email_address}`} className="social-link"><EmailIcon /></a>}
                {/* Fallbacks if none are provided */}
                {!config.instagram_link && !config.whatsapp_number && !config.email_address && (
                  <>
                    <a href="https://instagram.com" target="_blank" rel="noreferrer" className="social-link"><InstagramIcon /></a>
                    <a href="https://wa.me/" target="_blank" rel="noreferrer" className="social-link"><WhatsAppIcon /></a>
                    <a href="mailto:support@etba3ly.store" className="social-link"><EmailIcon /></a>
                  </>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Hidden</span>
            )}
          </div>
        </div>
        <div className="footer-bottom">&copy; {new Date().getFullYear()} {brandName}. All rights reserved.</div>
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
    </>
  );
}