import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Html, useProgress, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import STLViewer from "./slicer/STLViewer.jsx";
import AdminSlicerModal from "./slicer/AdminSlicerModal.jsx";
import MoonrakerDispatchModal from "./slicer/MoonrakerDispatchModal.jsx";
import { generateElegooGcode } from "./slicer/slicerEngine.js";
import GalleryStudioUploader from "./utils/GalleryStudioUploader.jsx";
import { processPartImageFile } from "./utils/partImageProcessor.js";

const BENCHY_URL = `${import.meta.env.BASE_URL}benchy.glb`;
useGLTF.preload(BENCHY_URL);

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

// ─────────────────────────────────────────────────────────
// Payment helpers — internal cash payment status (Admin Only)
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// Archive (.zip & .rar) & STL validation helpers
// ─────────────────────────────────────────────────────────
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

/* ── 3DBenchy Floating Model (shared geometry + persistent per-user random filament colors) ── */
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

/* ── Main 3D Scene ── */
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
    const posY = isMobile ? (isSmallPhone ? 1.25 : 1.45) : 0;
    const rotY = progress * Math.PI * 0.5;

    groupRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.08);
    groupRef.current.position.lerp(new THREE.Vector3(posX, posY, 0), 0.08);
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    groupRef.current.quaternion.slerp(targetQuat, 0.08);
  });

  return (
    <group ref={groupRef}>
      {/* Central Torus Knot — abstract hero piece */}
      <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.45}>
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

      {/* 3 Same-Size Floating 3DBenchy Models in non-colliding orbits */}
      <Suspense fallback={null}>
        {/* Benchy 1 — Top sector */}
        <Float speed={1.6} rotationIntensity={0.3} floatIntensity={0.35}>
          <BenchyShape
            position={[0.1, 1.92, 0.2]}
            rotation={[0.2, -0.65, -0.1]}
            scale={0.66}
            spinSpeed={-0.25}
            color={benchyColors[0]}
          />
        </Float>

        {/* Benchy 2 — Bottom-left sector */}
        <Float speed={1.7} rotationIntensity={0.3} floatIntensity={0.35}>
          <BenchyShape
            position={[-1.58, -1.22, 0.35]}
            rotation={[-0.14, 0.85, 0.12]}
            scale={0.66}
            spinSpeed={0.22}
            color={benchyColors[1]}
          />
        </Float>

        {/* Benchy 3 — Right sector */}
        <Float speed={1.8} rotationIntensity={0.3} floatIntensity={0.35}>
          <BenchyShape
            position={[1.95, 0.08, 0.25]}
            rotation={[0.15, -2.15, 0.1]}
            scale={0.66}
            spinSpeed={-0.22}
            color={benchyColors[2]}
          />
        </Float>
      </Suspense>

      {/* Gear 1 — Top-left sector */}
      <Float speed={1.8} rotationIntensity={0.4} floatIntensity={0.4}>
        <GearShape position={[-1.92, 1.2, -0.45]} scale={0.5} color="#333333" />
      </Float>

      {/* Gear 2 — Bottom-right sector */}
      <Float speed={1.6} rotationIntensity={0.4} floatIntensity={0.4}>
        <GearShape position={[1.65, -1.25, 0.25]} scale={0.35} color="#FFB347" />
      </Float>

      {/* Floating Octahedron — Upper-right sector */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.35}>
        <mesh position={[1.82, 1.42, -0.35]} rotation={[0.3, 0.4, 0]}>
          <octahedronGeometry args={[0.38]} />
          <meshStandardMaterial color="#FF8000" metalness={0.9} roughness={0.05} envMapIntensity={3} />
        </mesh>
      </Float>

      {/* Small Torus — Front-left detail */}
      <Float speed={1.3} rotationIntensity={0.25} floatIntensity={0.3}>
        <mesh position={[-0.55, -0.15, 1.2]} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.28, 0.075, 16, 32]} />
          <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.2} />
        </mesh>
      </Float>

      {/* Cylinder — Bottom nozzle detail */}
      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.35}>
        <mesh position={[0.55, -1.85, -0.35]} rotation={[0.2, 0, 0.5]}>
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


// ═══════════════════════════════════════════════════════════
// STATUS STEPPER
// ═══════════════════════════════════════════════════════════
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
  price_review_threshold: 300,
  materials: "PLA, PETG, ABS, Carbon Fiber, TPU",
  colors: "White, Black, Silver, Red, Orange, Blue, Gray",
  whatsapp_number: "",
  whatsapp_api_key: "",
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

// ═══════════════════════════════════════════════════════════
// ADMIN PROFIT & FINANCIALS TAB COMPONENT
// ═══════════════════════════════════════════════════════════
function AdminProfitTab({
  orders,
  config,
  spoolCostKg,
  setSpoolCostKg,
  electricityTariffKwh,
  setElectricityTariffKwh,
  printerPowerWatts,
  setPrinterPowerWatts,
  cc1WearRatePerHour,
  setCc1WearRatePerHour,
  printSpeedGph,
  setPrintSpeedGph,
  materialCosts,
  setMaterialCosts,
  fleetLogs,
  setFleetLogs,
  externalPrinterStates,
  PRINTERS,
  onClearExternalJob,
  onDeleteFleetLog,
  onOpenExternalPrompt,
  onOpenScanHistory,
  addToast
}) {
  const defaultRate = parseFloat(config.price_per_gram) || 3;
  const tariffKwh = parseFloat(electricityTariffKwh) || 0;
  const watts = parseFloat(printerPowerWatts) || 180;
  const wearRatePerHour = parseFloat(cc1WearRatePerHour) || 0;
  const speedGph = parseFloat(printSpeedGph) || 35; // grams per hour for CC1 high-speed printing

  // Hourly and gram burdens for CC1 and power
  const electricityCostPerHour = (watts / 1000) * tariffKwh;
  const cc1WearPerHour = wearRatePerHour;
  const machineHourlyBurden = electricityCostPerHour + cc1WearPerHour;
  const electricityCostPerGram = speedGph > 0 ? electricityCostPerHour / speedGph : 0;
  const wearCostPerGram = speedGph > 0 ? cc1WearPerHour / speedGph : 0;
  const machineBurdenPerGram = electricityCostPerGram + wearCostPerGram;

  // Extract all configured materials strictly from website CMS
  const configuredMaterials = useMemo(() => {
    const fromConfig = (config.materials || "")
      .split(',')
      .map(m => m.trim().toUpperCase())
      .filter(Boolean);
    return fromConfig.length > 0 ? fromConfig : ["PLA", "PETG", "ABS", "CARBON FIBER", "TPU"];
  }, [config.materials]);

  const getMaterialSpoolCost = useCallback((materialName) => {
    if (!materialName) return parseFloat(spoolCostKg) || 750;
    const key = materialName.trim().toUpperCase();
    if (materialCosts && materialCosts[key] !== undefined && materialCosts[key] !== "" && !isNaN(materialCosts[key])) {
      return Number(materialCosts[key]);
    }
    // Intelligent defaults based on Egyptian market averages
    if (key.includes("PLA+")) return 750;
    if (key.includes("PLA")) return 650;
    if (key.includes("PETG")) return 700;
    if (key.includes("ABS")) return 750;
    if (key.includes("CARBON") || key.includes("CF")) return 1350;
    if (key.includes("TPU") || key.includes("FLEX")) return 950;
    if (key.includes("RESIN")) return 1100;
    return parseFloat(spoolCostKg) || 750;
  }, [materialCosts, spoolCostKg]);

  const handleUpdateMaterialCost = (matKey, value) => {
    const num = parseFloat(value);
    const safeNum = isNaN(num) || num < 0 ? 0 : num;
    setMaterialCosts(prev => {
      const updated = { ...prev, [matKey]: safeNum };
      localStorage.setItem("jp_material_costs", JSON.stringify(updated));
      return updated;
    });
  };

  const handleResetMaterialDefaults = () => {
    const defaults = {
      "PLA": 650,
      "PLA+": 750,
      "PETG": 700,
      "ABS": 750,
      "CARBON FIBER": 1350,
      "TPU": 950,
      "RESIN": 1100
    };
    setMaterialCosts(defaults);
    localStorage.setItem("jp_material_costs", JSON.stringify(defaults));
    if (addToast) addToast("Material spool prices reset to standard rates", "info");
  };

  const financialSummary = useMemo(() => {
    const doneOrders = orders.filter(o => (o.status || "").toLowerCase().trim() === "done");
    const printingOrders = orders.filter(o => (o.status || "").toLowerCase().trim() === "printing");
    const queuedOrders = orders.filter(o => (o.status || "").toLowerCase().trim() === "queued");

    const getOrderRevenue = (o) => {
      if (o.totalprice !== null && o.totalprice !== undefined && !isNaN(o.totalprice)) {
        return Number(o.totalprice);
      }
      return (Number(o.weightgrams) || 0) * defaultRate;
    };

    const doneRevenue = doneOrders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
    const printingRevenue = printingOrders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
    const queuedRevenue = queuedOrders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
    const pipelineRevenue = printingRevenue + queuedRevenue;

    const doneGrams = doneOrders.reduce((sum, o) => sum + (Number(o.weightgrams) || 0), 0);
    const activeGrams = [...printingOrders, ...queuedOrders].reduce((sum, o) => sum + (Number(o.weightgrams) || 0), 0);
    const totalGramsAll = orders.reduce((sum, o) => sum + (Number(o.weightgrams) || 0), 0);

    const donePrintHours = speedGph > 0 ? doneGrams / speedGph : 0;
    const activePrintHours = speedGph > 0 ? activeGrams / speedGph : 0;
    const totalPrintHoursAll = speedGph > 0 ? totalGramsAll / speedGph : 0;

    // Cash collection tracking across all customer orders (Admin Only)
    let totalCashCollected = 0;
    let totalCashPending = 0;
    let paidOrdersCount = 0;
    let partialOrdersCount = 0;
    let unpaidOrdersCount = 0;

    orders.forEach(o => {
      const rev = getOrderRevenue(o);
      const payInfo = getOrderPaymentInfo(o);
      if (payInfo.status === "paid") {
        totalCashCollected += rev;
        paidOrdersCount += 1;
      } else if (payInfo.status === "partial") {
        const paid = Math.min(rev, payInfo.paidAmount);
        totalCashCollected += paid;
        totalCashPending += Math.max(0, rev - paid);
        partialOrdersCount += 1;
      } else {
        totalCashPending += rev;
        unpaidOrdersCount += 1;
      }
    });

    let doneFilamentCost = 0;
    let doneWearCost = 0;
    let doneElectricityCost = 0;

    const doneOrdersList = doneOrders.map(o => {
      const rev = getOrderRevenue(o);
      const w = Number(o.weightgrams) || 0;
      const hours = speedGph > 0 ? w / speedGph : 0;
      const matSpoolCost = getMaterialSpoolCost(o.material);
      const filamentCost = w * (matSpoolCost / 1000);
      const wearCost = hours * wearRatePerHour;
      const elecCost = hours * electricityCostPerHour;
      const totalCost = filamentCost + wearCost + elecCost;
      const prof = rev - totalCost;
      const margin = rev > 0 ? (prof / rev) * 100 : 0;
      const payInfo = getOrderPaymentInfo(o);

      doneFilamentCost += filamentCost;
      doneWearCost += wearCost;
      doneElectricityCost += elecCost;

      return {
        id: o.id,
        ordername: o.ordername || "Untitled",
        name: o.name || "Customer",
        material: o.material || "PLA",
        color: o.color || "Standard",
        weight: w,
        hours,
        filamentCost,
        wearCost,
        elecCost,
        revenue: rev,
        cost: totalCost,
        profit: prof,
        margin,
        paymentStatus: payInfo.status,
        paidAmount: payInfo.paidAmount,
        date: o.createdat
      };
    });

    // Offline USB print logs telemetry
    const allUsbGrams = (fleetLogs || []).reduce((sum, l) => sum + (Number(l.grams) || 0), 0);
    const allUsbHours = (fleetLogs || []).reduce((sum, l) => sum + (Number(l.hours) || (speedGph > 0 ? (Number(l.grams) || 0) / speedGph : 0)), 0);
    const allFleetGrams = doneGrams + allUsbGrams;
    const allFleetPrintHours = donePrintHours + allUsbHours;
    const allFleetWearCost = allFleetPrintHours * wearRatePerHour;

    const doneTotalCost = doneFilamentCost + doneWearCost + doneElectricityCost;
    const netProfit = doneRevenue - doneTotalCost;
    const profitMargin = doneRevenue > 0 ? (netProfit / doneRevenue) * 100 : 0;
    const avgProfitPerOrder = doneOrders.length > 0 ? netProfit / doneOrders.length : 0;

    // Per-Printer Hardware Fleet Telemetry
    const printerFleetStats = {
      perPrinter: {},
      unassignedDoneCount: 0,
      unassignedGrams: 0,
      unassignedHours: 0,
      unassignedWear: 0
    };

    (PRINTERS || ["CC Abdalla", "CC Mazen"]).forEach(printer => {
      const printerDoneOrders = orders.filter(o => 
        (o.status || "").toLowerCase().trim() === "done" && 
        getPrinterFromNotes(o.notes) === printer
      );
      const printerActiveOrder = orders.find(o => 
        (o.status || "").toLowerCase().trim() === "printing" && 
        getPrinterFromNotes(o.notes) === printer
      );
      const printerUsbLogs = (fleetLogs || []).filter(l => l.printer === printer);

      const orderGrams = printerDoneOrders.reduce((sum, o) => sum + (Number(o.weightgrams) || 0), 0);
      const orderHours = speedGph > 0 ? orderGrams / speedGph : 0;

      const usbGrams = printerUsbLogs.reduce((sum, l) => sum + (Number(l.grams) || 0), 0);
      const usbHours = printerUsbLogs.reduce((sum, l) => sum + (Number(l.hours) || (speedGph > 0 ? (Number(l.grams) || 0) / speedGph : 0)), 0);

      const totalGrams = orderGrams + usbGrams;
      const totalHours = orderHours + usbHours;
      const wearExpense = totalHours * wearRatePerHour;
      const elecExpense = totalHours * electricityCostPerHour;

      const externalState = externalPrinterStates && externalPrinterStates[printer];
      const isUsbWorking = externalState && externalState.status === "working";

      printerFleetStats.perPrinter[printer] = {
        name: printer,
        orderGrams,
        orderHours,
        usbGrams,
        usbHours,
        totalGrams,
        totalHours,
        wearExpense,
        elecExpense,
        totalJobs: printerDoneOrders.length + printerUsbLogs.length,
        doneOrdersCount: printerDoneOrders.length,
        usbJobsCount: printerUsbLogs.length,
        activeOrder: printerActiveOrder,
        isUsbWorking,
        usbJobName: isUsbWorking ? externalState.jobName : null,
        status: printerActiveOrder ? "printing" : isUsbWorking ? "usb" : "idle"
      };
    });

    const unassignedDoneOrders = orders.filter(o => 
      (o.status || "").toLowerCase().trim() === "done" && 
      !getPrinterFromNotes(o.notes)
    );
    printerFleetStats.unassignedDoneCount = unassignedDoneOrders.length;
    printerFleetStats.unassignedGrams = unassignedDoneOrders.reduce((sum, o) => sum + (Number(o.weightgrams) || 0), 0);
    printerFleetStats.unassignedHours = speedGph > 0 ? printerFleetStats.unassignedGrams / speedGph : 0;
    printerFleetStats.unassignedWear = printerFleetStats.unassignedHours * wearRatePerHour;

    // Materials breakdown table
    const materialMap = {};
    configuredMaterials.forEach(mat => {
      materialMap[mat] = {
        name: mat,
        spoolCost: getMaterialSpoolCost(mat),
        totalOrders: 0,
        doneOrders: 0,
        grams: 0,
        hours: 0,
        filamentCost: 0,
        wearAndPowerCost: 0,
        totalCost: 0,
        revenue: 0,
        profit: 0,
        margin: 0
      };
    });

    orders.forEach(o => {
      const mat = (o.material || "PLA").toUpperCase().trim();
      if (!materialMap[mat]) {
        materialMap[mat] = {
          name: mat,
          spoolCost: getMaterialSpoolCost(mat),
          totalOrders: 0,
          doneOrders: 0,
          grams: 0,
          hours: 0,
          filamentCost: 0,
          wearAndPowerCost: 0,
          totalCost: 0,
          revenue: 0,
          profit: 0,
          margin: 0
        };
      }
      materialMap[mat].totalOrders += 1;
      const rev = getOrderRevenue(o);
      const w = Number(o.weightgrams) || 0;
      const hours = speedGph > 0 ? w / speedGph : 0;
      const fCost = w * (getMaterialSpoolCost(mat) / 1000);
      const wpCost = hours * machineHourlyBurden;

      materialMap[mat].grams += w;
      materialMap[mat].hours += hours;

      if ((o.status || "").toLowerCase().trim() === "done") {
        materialMap[mat].doneOrders += 1;
        materialMap[mat].revenue += rev;
        materialMap[mat].filamentCost += fCost;
        materialMap[mat].wearAndPowerCost += wpCost;
        materialMap[mat].totalCost += (fCost + wpCost);
      }
    });

    const materialStats = Object.values(materialMap).map(m => {
      const profit = m.revenue - m.totalCost;
      const margin = m.revenue > 0 ? (profit / m.revenue) * 100 : 0;
      return { ...m, profit, margin };
    });

    return {
      doneOrdersCount: doneOrders.length,
      activeOrdersCount: printingOrders.length + queuedOrders.length,
      doneRevenue,
      pipelineRevenue,
      doneGrams,
      activeGrams,
      totalGramsAll,
      donePrintHours,
      activePrintHours,
      totalPrintHoursAll,
      allUsbGrams,
      allUsbHours,
      allFleetGrams,
      allFleetPrintHours,
      allFleetWearCost,
      printerFleetStats,
      doneFilamentCost,
      doneWearCost,
      doneElectricityCost,
      doneTotalCost,
      netProfit,
      profitMargin,
      avgProfitPerOrder,
      materialStats,
      doneOrdersList,
      totalCashCollected,
      totalCashPending,
      paidOrdersCount,
      partialOrdersCount,
      unpaidOrdersCount
    };
  }, [orders, defaultRate, speedGph, wearRatePerHour, electricityCostPerHour, machineHourlyBurden, configuredMaterials, getMaterialSpoolCost, fleetLogs, PRINTERS, externalPrinterStates]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Financial KPI Cards */}
      <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="card" title="Net profit realized from all completed orders (Revenue minus Raw Filament Cost, CC1 Machine Wear per hour, and Electricity)">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Realized Net Profit
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--accent)", margin: "6px 0" }}>
            {financialSummary.netProfit.toFixed(2)} EGP
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--status-done)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>Margin: {financialSummary.profitMargin.toFixed(1)}%</span>
            <span style={{ color: "var(--text-tertiary)" }}>&bull; Avg {financialSummary.avgProfitPerOrder.toFixed(1)} EGP/order</span>
          </div>
        </div>

        <div className="card" title="Total cash received from completed orders, plus pending value in the active print pipeline">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Revenue Collected
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text-primary)", margin: "6px 0" }}>
            {financialSummary.doneRevenue.toFixed(2)} EGP
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            + {financialSummary.pipelineRevenue.toFixed(2)} EGP active in pipeline
          </div>
        </div>

        <div className="card" title="Internal cash payment collections and outstanding unpaid balances across all orders (Admin only, never visible to customers)">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Cash Collections (Admin Only)
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--status-done)", margin: "6px 0" }}>
            {financialSummary.totalCashCollected.toFixed(2)} EGP
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
            <div>
              {financialSummary.totalCashPending > 0 ? (
                <span style={{ color: "#ff453a", fontWeight: 700 }}>{financialSummary.totalCashPending.toFixed(2)} EGP unpaid</span>
              ) : (
                <span style={{ color: "var(--status-done)", fontWeight: 700 }}>All orders settled</span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {financialSummary.paidOrdersCount} Paid &bull; {financialSummary.partialOrdersCount} Partial &bull; {financialSummary.unpaidOrdersCount} Unpaid
            </span>
          </div>
        </div>

        <div className="card" title="Direct manufacturing costs itemized into raw filament material, hourly CC1 hardware wear, and power consumption">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Itemized Production Costs
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#f87171", margin: "6px 0" }}>
            {financialSummary.doneTotalCost.toFixed(2)} EGP
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            <span>Filament: <strong>{financialSummary.doneFilamentCost.toFixed(1)} EGP</strong></span>
            <span>CC1 Machine Wear: <strong>{financialSummary.doneWearCost.toFixed(1)} EGP</strong> ({financialSummary.donePrintHours.toFixed(1)}h)</span>
            <span>Electricity: <strong>{financialSummary.doneElectricityCost.toFixed(1)} EGP</strong></span>
          </div>
        </div>

        <div className="card" title="Total active machine hours and filament weight extruded on your Centauri Carbon CC1 3D printer fleet">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Fleet Hours & Extrusion
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--status-printing)", margin: "6px 0" }}>
            {financialSummary.allFleetPrintHours.toFixed(1)} hrs
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            ~{(financialSummary.allFleetGrams / 1000).toFixed(2)} kg total ({financialSummary.doneOrdersCount} orders + {financialSummary.allUsbHours > 0 ? `${(fleetLogs || []).length} USB` : '0 USB'})
          </div>
        </div>
      </div>

      {/* Centauri Fleet Telemetry & Machine Wear Odometers */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--accent)" }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Centauri Fleet Hardware Odometers & Machine Wear
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Tracks exact operating print hours, extruded filament weight, and accumulated hardware depreciation for each machine across website orders and offline USB jobs.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {onOpenScanHistory && (
              <button
                type="button"
                className="btn btn-sm btn-accent"
                style={{ padding: "6px 14px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={onOpenScanHistory}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Scan Print History
              </button>
            )}
            <span style={{ background: "rgba(255,128,0,0.12)", padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
              Fleet Total: {financialSummary.allFleetPrintHours.toFixed(1)} hrs
            </span>
            <span style={{ background: "rgba(0,122,255,0.12)", padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 700, color: "var(--status-printing)" }}>
              Fleet Extruded: {(financialSummary.allFleetGrams / 1000).toFixed(2)} kg
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {(PRINTERS || ["CC Abdalla", "CC Mazen"]).map(printer => {
            const pStats = (financialSummary.printerFleetStats && financialSummary.printerFleetStats.perPrinter && financialSummary.printerFleetStats.perPrinter[printer]) || {
              orderGrams: 0, orderHours: 0, usbGrams: 0, usbHours: 0, totalGrams: 0, totalHours: 0, wearExpense: 0, elecExpense: 0, totalJobs: 0, doneOrdersCount: 0, usbJobsCount: 0, status: "idle"
            };
            const isWorking = pStats.status !== "idle";
            const isUsb = pStats.status === "usb";

            return (
              <div
                key={printer}
                style={{
                  padding: "18px 20px",
                  borderRadius: "var(--radius-sm)",
                  background: isWorking ? (isUsb ? "rgba(255,128,0,0.04)" : "rgba(0,122,255,0.04)") : "rgba(255,255,255,0.02)",
                  border: isWorking ? (isUsb ? "1px solid rgba(255,128,0,0.3)" : "1px solid rgba(0,122,255,0.3)") : "1px solid var(--border-glass-strong)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: isWorking ? (isUsb ? "var(--accent)" : "var(--status-printing)") : "var(--status-done)",
                        boxShadow: isWorking ? `0 0 10px ${isUsb ? "rgba(255,128,0,0.6)" : "rgba(0,122,255,0.6)"}` : "none"
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{printer}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "var(--radius-full)",
                      background: isWorking ? (isUsb ? "rgba(255,128,0,0.15)" : "rgba(0,122,255,0.15)") : "rgba(16,185,129,0.12)",
                      color: isWorking ? (isUsb ? "var(--accent)" : "var(--status-printing)") : "var(--status-done)"
                    }}
                  >
                    {isWorking ? (isUsb ? "Working (USB Job)" : "Working (Website Order)") : "Ready / Idle"}
                  </span>
                </div>

                {isWorking && (
                  <div style={{ fontSize: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Active Task: </span>
                    <strong style={{ color: "var(--text-primary)" }}>
                      {pStats.activeOrder ? (pStats.activeOrder.ordername || "Website Print") : pStats.usbJobName}
                    </strong>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
                  <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Operating Hours</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", margin: "4px 0 2px" }}>
                      {pStats.totalHours.toFixed(1)} hrs
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {pStats.orderHours.toFixed(1)}h web &bull; {pStats.usbHours.toFixed(1)}h usb
                    </div>
                  </div>

                  <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Filament Extruded</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--accent)", margin: "4px 0 2px" }}>
                      {pStats.totalGrams.toFixed(0)} g
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      ~{(pStats.totalGrams / 1000).toFixed(2)} kg total ({pStats.totalJobs} jobs)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-secondary)", paddingTop: 4 }}>
                  <span>Machine Wear Burden:</span>
                  <strong style={{ color: "#f87171" }}>{pStats.wearExpense.toFixed(2)} EGP</strong>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {isUsb ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-glass"
                      style={{ flex: 1, padding: "6px 12px", fontSize: 12 }}
                      onClick={() => onClearExternalJob && onClearExternalJob(printer)}
                    >
                      Clear USB Job
                    </button>
                  ) : !pStats.activeOrder ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-glass"
                      style={{ flex: 1, padding: "6px 12px", fontSize: 12 }}
                      onClick={() => onOpenExternalPrompt && onOpenExternalPrompt(printer)}
                    >
                      + Log USB Print
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {financialSummary.printerFleetStats && financialSummary.printerFleetStats.unassignedDoneCount > 0 && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)", fontSize: 12, color: "var(--text-secondary)" }}>
            Note: <strong>{financialSummary.printerFleetStats.unassignedDoneCount}</strong> completed website orders ({financialSummary.printerFleetStats.unassignedGrams.toFixed(0)}g &bull; {financialSummary.printerFleetStats.unassignedHours.toFixed(1)}h) were completed before individual printer tagging was assigned and are included in the fleet wear burden ({financialSummary.printerFleetStats.unassignedWear.toFixed(2)} EGP).
          </div>
        )}
      </div>

      {/* Recent Direct USB & Offline Print Ledger */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Recent Direct USB & Offline Print Ledger ({fleetLogs ? fleetLogs.length : 0})</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Record of prints executed directly on machines without website orders. These factor directly into CC1 machine wear and filament telemetry.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(PRINTERS || ["CC Abdalla", "CC Mazen"]).map(printer => (
              <button
                key={printer}
                type="button"
                className="btn btn-sm btn-glass"
                style={{ fontSize: 11, padding: "4px 10px" }}
                onClick={() => onOpenExternalPrompt && onOpenExternalPrompt(printer)}
              >
                + Log Print on {printer}
              </button>
            ))}
          </div>
        </div>

        {(!fleetLogs || fleetLogs.length === 0) ? (
          <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: 13 }}>
            No offline USB prints logged yet. Use "+ Log USB Print" when printing from a flash drive to track nozzle wear and operating hours accurately.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-glass-strong)", color: "var(--text-tertiary)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Date & Time</th>
                  <th style={{ padding: "10px 12px" }}>Printer</th>
                  <th style={{ padding: "10px 12px" }}>Job / Part Description</th>
                  <th style={{ padding: "10px 12px" }}>Weight</th>
                  <th style={{ padding: "10px 12px" }}>Operating Duration</th>
                  <th style={{ padding: "10px 12px" }}>CC1 Wear Burden</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {fleetLogs.map(log => {
                  const hours = Number(log.hours) || (speedGph > 0 ? (Number(log.grams) || 0) / speedGph : 0);
                  const wear = hours * wearRatePerHour;
                  const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={{ padding: "12px", color: "var(--text-tertiary)", fontSize: 12 }}>{dateStr}</td>
                      <td style={{ padding: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{log.printer}</td>
                      <td style={{ padding: "12px", color: "var(--accent)", fontWeight: 600 }}>{log.jobName || "Direct USB Job"}</td>
                      <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{log.grams ? `${Number(log.grams).toFixed(0)} g` : "-"}</td>
                      <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{hours.toFixed(1)} h</td>
                      <td style={{ padding: "12px", color: "#f87171" }}>{wear.toFixed(2)} EGP</td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ padding: "3px 8px", fontSize: 11, background: "rgba(255,59,48,0.15)", color: "#FF3B30", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "var(--radius-full)", cursor: "pointer" }}
                          onClick={() => onDeleteFleetLog && onDeleteFleetLog(log.id)}
                          title="Delete this USB log entry"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Centauri Carbon 1 (CC1) Wear & Electricity Calibration */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Centauri Carbon 1 (CC1) Wear & Electricity Calibration</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Separates machine wear according to active printing hours from electricity. Electricity can be set to 0 for free/campus power or calibrated per kWh.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(255,128,0,0.12)", padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
              Hourly Burden: {machineHourlyBurden.toFixed(2)} EGP/hr
            </span>
            <span style={{ background: "rgba(0,122,255,0.12)", padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 700, color: "var(--status-printing)" }}>
              Weight Burden: {machineBurdenPerGram.toFixed(3)} EGP/g
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <label style={{ fontSize: 12, margin: 0 }}>Electricity Tariff (EGP / kWh)</label>
              <button
                type="button"
                className="btn btn-sm btn-glass"
                style={{ padding: "2px 8px", fontSize: 10 }}
                title="Click to set electricity cost to 0 EGP if electricity is free or campus-supplied"
                onClick={() => {
                  setElectricityTariffKwh(0);
                  localStorage.setItem("jp_elec_kwh", "0");
                }}
              >
                Set Free (0 EGP)
              </button>
            </div>
            <input
              type="number"
              step="0.1"
              min="0"
              title="Electricity rate per kilowatt-hour. Enter 0 for free power or typical Egyptian residential/commercial tariff (e.g. 2.50 EGP/kWh)."
              value={electricityTariffKwh}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setElectricityTariffKwh(val);
                localStorage.setItem("jp_elec_kwh", String(val));
              }}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14 }}
              placeholder="e.g. 2.50 or 0"
            />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Rate: {electricityCostPerHour.toFixed(2)} EGP / hr ({electricityCostPerGram.toFixed(3)} EGP/g)
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>CC1 Power Consumption (Watts)</label>
            <input
              type="number"
              step="10"
              min="0"
              title="Continuous average wattage draw for the Elegoo Centauri Carbon (typically ~180W while printing with heated bed)."
              value={printerPowerWatts}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setPrinterPowerWatts(val);
                localStorage.setItem("jp_printer_watts", String(val));
              }}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14 }}
              placeholder="e.g. 180"
            />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Elegoo Centauri Carbon continuous average draw
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>CC1 Wear & Maintenance (EGP / Print Hour)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              title="Hourly hardware wear allowance covering hardened nozzle wear, PEI sheet replacements, CoreXY belts, linear rails lubrication, and machine depreciation."
              value={cc1WearRatePerHour}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setCc1WearRatePerHour(val);
                localStorage.setItem("jp_cc1_wear_rate", String(val));
              }}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14 }}
              placeholder="e.g. 6.00"
            />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Nozzle, PEI bed, belts, linear rails & depreciation ({wearCostPerGram.toFixed(3)} EGP/g)
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>CC1 Print Throughput (Grams / Hour)</label>
            <input
              type="number"
              step="5"
              min="5"
              title="Average grams of filament extruded per active printing hour on high-speed CoreXY CC1 (typically 30-40g/hr)."
              value={printSpeedGph}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 35;
                setPrintSpeedGph(val);
                localStorage.setItem("jp_print_speed_gph", String(val));
              }}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14 }}
              placeholder="e.g. 35"
            />
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              High-speed CoreXY average extrusion speed (~35g/hr)
            </div>
          </div>
        </div>
      </div>

      {/* Per-Material Filament Spool Pricing */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Per-Material Filament Spool Costs</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Every filament costs differently (e.g. PETG vs PLA+ vs Carbon Fiber). Configured from your website materials list.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-glass"
            style={{ fontSize: 12 }}
            onClick={handleResetMaterialDefaults}
          >
            Reset Market Standard Rates
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {configuredMaterials.map(mat => {
            const currentCost = getMaterialSpoolCost(mat);
            const costPerG = currentCost / 1000;
            return (
              <div
                key={mat}
                style={{
                  padding: "14px 16px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border-glass-strong)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>{mat}</span>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                    {costPerG.toFixed(3)} EGP / g
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    step="25"
                    min="0"
                    title={`Cost to purchase a 1kg spool of ${mat}. Raw filament cost is ${costPerG.toFixed(3)} EGP per gram.`}
                    value={materialCosts[mat] !== undefined ? materialCosts[mat] : currentCost}
                    onChange={(e) => handleUpdateMaterialCost(mat, e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
                    placeholder="Spool cost (EGP)"
                  />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>EGP / kg</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Material Profit Breakdown */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Material Profit Breakdown</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-glass-strong)", color: "var(--text-tertiary)", textAlign: "left" }}>
                <th style={{ padding: "10px 12px" }}>Material</th>
                <th style={{ padding: "10px 12px" }}>Spool Cost</th>
                <th style={{ padding: "10px 12px" }}>Done / Total</th>
                <th style={{ padding: "10px 12px" }}>Weight</th>
                <th style={{ padding: "10px 12px" }}>Est. Hours</th>
                <th style={{ padding: "10px 12px" }}>Filament Cost</th>
                <th style={{ padding: "10px 12px" }}>Wear & Power</th>
                <th style={{ padding: "10px 12px" }}>Revenue</th>
                <th style={{ padding: "10px 12px" }}>Net Profit</th>
                <th style={{ padding: "10px 12px" }}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {financialSummary.materialStats.map(m => (
                <tr key={m.name} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{m.name}</td>
                  <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{m.spoolCost.toFixed(0)} EGP/kg</td>
                  <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{m.doneOrders} / {m.totalOrders}</td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{m.grams.toFixed(0)} g</td>
                  <td style={{ padding: "12px", color: "var(--text-tertiary)" }}>{m.hours.toFixed(1)} h</td>
                  <td style={{ padding: "12px", color: "#f87171" }}>{m.filamentCost.toFixed(2)} EGP</td>
                  <td style={{ padding: "12px", color: "#f87171" }}>{m.wearAndPowerCost.toFixed(2)} EGP</td>
                  <td style={{ padding: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{m.revenue.toFixed(2)} EGP</td>
                  <td style={{ padding: "12px", fontWeight: 800, color: "var(--accent)" }}>{m.profit.toFixed(2)} EGP</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: m.margin >= 50 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)", color: m.margin >= 50 ? "var(--status-done)" : "var(--status-queued)" }}>
                      {m.margin.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Completed Orders Profit Ledger */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Completed Orders Ledger ({financialSummary.doneOrdersList.length})</h3>
        {financialSummary.doneOrdersList.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: 13 }}>
            No orders marked as "Done" yet. Complete orders in the Order Queue to generate real profit records.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-glass-strong)", color: "var(--text-tertiary)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Order</th>
                  <th style={{ padding: "10px 12px" }}>Client</th>
                  <th style={{ padding: "10px 12px" }}>Specs</th>
                  <th style={{ padding: "10px 12px" }}>Weight & Time</th>
                  <th style={{ padding: "10px 12px" }}>Filament Cost</th>
                  <th style={{ padding: "10px 12px" }}>CC1 Wear</th>
                  <th style={{ padding: "10px 12px" }}>Electricity</th>
                  <th style={{ padding: "10px 12px" }}>Total Cost</th>
                  <th style={{ padding: "10px 12px" }}>Revenue</th>
                  <th style={{ padding: "10px 12px" }}>Payment</th>
                  <th style={{ padding: "10px 12px" }}>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {financialSummary.doneOrdersList.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{o.ordername}</td>
                    <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{o.name}</td>
                    <td style={{ padding: "12px", color: "var(--text-tertiary)" }}>{o.material} ({o.color})</td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>{o.weight} g &bull; {o.hours.toFixed(1)}h</td>
                    <td style={{ padding: "12px", color: "#f87171" }}>{o.filamentCost.toFixed(2)} EGP</td>
                    <td style={{ padding: "12px", color: "#f87171" }}>{o.wearCost.toFixed(2)} EGP</td>
                    <td style={{ padding: "12px", color: "#f87171" }}>{o.elecCost.toFixed(2)} EGP</td>
                    <td style={{ padding: "12px", color: "#f87171", fontWeight: 700 }}>{o.cost.toFixed(2)} EGP</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{o.revenue.toFixed(2)} EGP</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "var(--radius-full)",
                        background: o.paymentStatus === "paid" ? "rgba(52, 199, 89, 0.15)" : o.paymentStatus === "partial" ? "rgba(255, 149, 0, 0.15)" : "rgba(255, 59, 48, 0.15)",
                        color: o.paymentStatus === "paid" ? "var(--status-done)" : o.paymentStatus === "partial" ? "var(--accent)" : "#ff453a",
                        border: `1px solid ${o.paymentStatus === "paid" ? "rgba(52, 199, 89, 0.4)" : o.paymentStatus === "partial" ? "rgba(255, 149, 0, 0.4)" : "rgba(255, 59, 48, 0.4)"}`,
                        textTransform: "uppercase"
                      }}>
                        {o.paymentStatus === "paid" ? "Paid" : o.paymentStatus === "partial" ? `Partial (${o.paidAmount.toFixed(0)})` : "Unpaid"}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 800, color: "var(--status-done)" }}>+{o.profit.toFixed(2)} EGP</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
  const [adminStatusFilter, setAdminStatusFilter] = useState("all");
  const [spoolCostKg, setSpoolCostKg] = useState(() => parseFloat(localStorage.getItem("jp_spool_cost")) || 750);
  const [electricityTariffKwh, setElectricityTariffKwh] = useState(() => {
    const val = localStorage.getItem("jp_elec_kwh");
    return val !== null && val !== "" ? parseFloat(val) : 2.50;
  });
  const [printerPowerWatts, setPrinterPowerWatts] = useState(() => parseFloat(localStorage.getItem("jp_printer_watts")) || 180);
  const [cc1WearRatePerHour, setCc1WearRatePerHour] = useState(() => parseFloat(localStorage.getItem("jp_cc1_wear_rate")) || 6.00);
  const [printSpeedGph, setPrintSpeedGph] = useState(() => parseFloat(localStorage.getItem("jp_print_speed_gph")) || 35);
  const [materialCosts, setMaterialCosts] = useState(() => {
    try {
      return {
        "PLA": 650,
        "PLA+": 750,
        "PETG": 700,
        "ABS": 750,
        "CARBON FIBER": 1350,
        "TPU": 950,
        ...JSON.parse(localStorage.getItem("jp_material_costs") || "{}")
      };
    } catch {
      return { "PLA": 650, "PLA+": 750, "PETG": 700, "ABS": 750, "CARBON FIBER": 1350, "TPU": 950 };
    }
  });
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
    const speed = parseFloat(printSpeedGph) || 35;
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
    dark.src = `${import.meta.env.BASE_URL}logo-dark.svg`;
    const light = new Image();
    light.src = `${import.meta.env.BASE_URL}logo-light.svg`;
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
    const title = (config.brand_name && config.brand_name !== "JUST print" && config.brand_name !== "PrintQueue") ? config.brand_name : "Etba3ly";
    document.title = title;
  }, [config.brand_name]);



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

  // Synchronize newOrder material and color strictly with active CMS configuration
  useEffect(() => {
    if (config.materials) {
      const activeMats = config.materials.split(',').map(m => m.trim()).filter(Boolean);
      if (activeMats.length > 0 && (!newOrder.material || !activeMats.includes(newOrder.material))) {
        setNewOrder(prev => ({ ...prev, material: activeMats[0] }));
      }
    }
    if (config.colors) {
      const activeCols = config.colors.split(',').map(c => c.trim()).filter(Boolean);
      if (activeCols.length > 0 && (!newOrder.color || !activeCols.includes(newOrder.color))) {
        setNewOrder(prev => ({ ...prev, color: activeCols[0] }));
      }
    }
  }, [config.materials, config.colors, newOrder.material, newOrder.color]);

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
      const storedThreshold = localStorage.getItem("centurai_price_review_threshold");
      const effectiveThreshold = data.price_review_threshold !== undefined && data.price_review_threshold !== null
        ? Number(data.price_review_threshold)
        : (storedThreshold ? parseFloat(storedThreshold) : 300);

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
          price_review_threshold: effectiveThreshold,
        }));
      } else {
        setConfig({
          ...data,
          price_review_threshold: effectiveThreshold,
        });
      }
    } else {
      const storedThreshold = localStorage.getItem("centurai_price_review_threshold");
      if (storedThreshold) {
        setConfig(prev => ({ ...prev, price_review_threshold: parseFloat(storedThreshold) || 300 }));
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
      for (const rawFile of files) {
        let fileToUpload = rawFile;
        try {
          const processed = await processPartImageFile(rawFile);
          fileToUpload = processed.file;
          if (processed.previewUrl) URL.revokeObjectURL(processed.previewUrl);
        } catch (procErr) {
          console.warn("Could not auto-process gallery image, uploading original:", procErr);
        }
        const ext = fileToUpload.name.split('.').pop();
        const path = `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('gallery-media').upload(path, fileToUpload);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('gallery-media').getPublicUrl(path);
        existingUrls.push(publicUrl);
      }
      const updatedItem = { ...editingGalleryItem, media_urls: existingUrls.join(',') };
      if (!updatedItem.cover_url && existingUrls.length > 0) updatedItem.cover_url = existingUrls[0];
      setEditingGalleryItem(updatedItem);
      addToast(`Added ${files.length} glowing orange part photo(s).`, "success");
    } catch (err) {
      addToast("Upload failed: " + err.message, "error");
    }
    setGalleryUploading(false);
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
    if (selectedFiles.length === 0) errors.file = "Please upload at least one STL, ZIP, or RAR file.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsUploading(true);
    const totalBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    setUploadProgress({
      active: true,
      percent: 5,
      currentFile: selectedFiles[0]?.name || "",
      fileIndex: 1,
      totalFiles: selectedFiles.length,
      loadedBytes: 0,
      totalBytes,
      stage: "uploading"
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

      setUploadProgress(prev => ({ ...prev, percent: 98, stage: "saving" }));

      const trackingCode = generateTrackingCode();
      const weightGrams = clientMetrics ? (clientMetrics.weightGrams ?? clientMetrics.filamentWeightGrams ?? 0) : 0;
      const rate = parseFloat(config.price_per_gram) || 3;
      const calculatedTotal = clientMetrics && clientMetrics.totalPrice ? clientMetrics.totalPrice : (weightGrams * rate);
      const cleanNotes = (newOrder.notes || "").trim();

      const defMat = config.materials ? config.materials.split(',')[0].trim() : "PLA";
      const defCol = config.colors ? config.colors.split(',')[0].trim() : "White";
      const finalMaterial = (newOrder.material || defMat).trim();
      const finalColor = (newOrder.color || defCol).trim();

      const payload = {
        name: newOrder.name,
        phone: newOrder.phone.replace(/[\s\-()]/g, ""),
        email: newOrder.email,
        ordername: newOrder.orderName || "Untitled Part",
        material: finalMaterial,
        color: finalColor,
        notes: cleanNotes,
        fileurl: urls.join(","),
        filesize: totalSize,
        status: "queued",
        priority: queuedOrdersCount,
        weightgrams: weightGrams,
        pricepergram: rate,
        totalprice: calculatedTotal,
        tracking_code: trackingCode
      };

      const { error: insertErr } = await supabase.from("orders").insert([payload]);
      if (insertErr) throw new Error(insertErr.message);

      // Send invoice and order confirmation email via edge function
      triggerOrderEmail("INSERT", payload);

      // Automated WhatsApp notification via CallMeBot if configured
      try {
        const rawAdminPhone = (config.whatsapp_number || "").replace(/\D/g, "");
        const intlAdminPhone = rawAdminPhone.startsWith("0") ? "2" + rawAdminPhone : rawAdminPhone;
        if (config.whatsapp_api_key && intlAdminPhone) {
          const alertMsg = `[Centurai Workshop Alert] New Order Received!\n` +
            `Tracking: ${trackingCode}\n` +
            `Client: ${newOrder.name}\n` +
            `Phone: ${newOrder.phone}\n` +
            `Part: ${newOrder.orderName || "Untitled Part"}\n` +
            `Material: ${finalMaterial} (${finalColor})\n` +
            `Weight: ${weightGrams}g\n` +
            `Total: ${calculatedTotal.toFixed(2)} EGP`;
          const botUrl = `https://api.callmebot.com/whatsapp.php?phone=${intlAdminPhone}&text=${encodeURIComponent(alertMsg)}&apikey=${encodeURIComponent(config.whatsapp_api_key.trim())}`;
          fetch(botUrl, { mode: "no-cors" }).catch(e => console.warn("CallMeBot alert dispatch warning:", e));
        }
      } catch (botErr) {
        console.warn("Could not dispatch automated WhatsApp notification:", botErr);
      }

      // Save user info for next time
      localStorage.setItem("jp_user_info", JSON.stringify({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email }));
      
      // Save tracking code for auto-tracking
      try {
        const savedCodes = JSON.parse(localStorage.getItem("jp_tracking_codes") || "[]");
        savedCodes.push(trackingCode);
        localStorage.setItem("jp_tracking_codes", JSON.stringify([...new Set(savedCodes)]));
      } catch (err) { console.error("Could not save tracking code", err); }

      setLastSubmittedQuote({
        orderName: newOrder.orderName || "Untitled Part",
        trackingCode,
        weightGrams,
        totalPrice: calculatedTotal,
        name: newOrder.name,
        material: finalMaterial,
        color: finalColor
      });

      setUploadProgress({ active: false, percent: 100, currentFile: "", fileIndex: 0, totalFiles: 0, loadedBytes: 0, totalBytes: 0, stage: "" });
      setOrderStep(4);
      setSuccessModal(trackingCode);
      setCopiedTrackingCode(false);
      setNewOrder({ name: newOrder.name, phone: newOrder.phone, email: newOrder.email, orderName: "", material: defMat, color: defCol, notes: "", fileName: "" });
      setClientMetrics(null);
      setOrderInfill(20);
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
          whatsapp_number: (config.whatsapp_number || "").trim() || undefined
        }
      });
      if (error) {
        console.warn("Email/WhatsApp notifier invocation returned warning:", error);
        return { success: false, error: error.message || error };
      }
      return { success: true, data };
    } catch (err) {
      console.warn("Could not trigger email/WhatsApp notification:", err);
      return { success: false, error: err.message || String(err) };
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
          name: "Workshop Admin Diagnostic"
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
        message: `Diagnostic test invoice sent successfully to ${config.email_address}!`
      });
      addToast("Test email invoice sent successfully!", "success");
    } catch (err) {
      console.error("Test email diagnostic error:", err);
      setEmailDiagnosticStatus({
        state: "error",
        message: err.message || "Failed to send email. Check Supabase RESEND_API_KEY secret."
      });
      addToast("Email test failed: " + (err.message || "Check function logs"), "error");
    }
    setIsTestingEmail(false);
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
    }
    setIsTestingWhatsApp(false);
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
        fileurl: "",
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

      // 2. Dispatch automated notifications (email invoice & backend WhatsApp alert)
      triggerOrderEmail("INSERT", payload);

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
    
    let { error } = await supabase.from("site_config").upsert({ ...config, price_review_threshold: thresholdVal, id: 1 });
    if (error && error.message && error.message.toLowerCase().includes("column")) {
      const safeConfig = { ...config, id: 1 };
      delete safeConfig.price_review_threshold;
      const retry = await supabase.from("site_config").upsert(safeConfig);
      error = retry.error;
    }

    if (error) addToast("Failed to save config: " + error.message, "error");
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
            <button className="btn btn-glass" onClick={() => { fetchOrders(); fetchConfig(); addToast("Queue and config refreshed", "info"); }}>Refresh Orders</button>
            <button className="btn btn-glass" onClick={exportCSV}>Export CSV</button>
            <button className="btn btn-glass" onClick={handleAdminLogout}>Sign Out</button>
          </div>

          <div className="admin-tabs">
            <button className={`btn ${adminTab === "orders" ? "btn-primary" : "btn-glass"}`} onClick={() => setAdminTab("orders")}>Manage Orders</button>
            <button className={`btn ${adminTab === "profit" ? "btn-primary" : "btn-glass"}`} onClick={() => setAdminTab("profit")}>Profit & Analytics</button>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0 }}>Order Queue</h3>
                    <button
                      type="button"
                      className="btn btn-sm btn-accent"
                      style={{ padding: "6px 14px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={() => {
                        const defMat = config.materials ? config.materials.split(',')[0].trim() : "PLA";
                        const defCol = config.colors ? config.colors.split(',')[0].trim() : "White";
                        setNewAdminOrder({
                          name: "",
                          phone: "",
                          email: "",
                          ordername: "",
                          material: defMat,
                          color: defCol,
                          weightgrams: "",
                          pricepergram: config.price_per_gram || "3",
                          totalprice: "",
                          status: "queued",
                          printer: PRINTERS[0] || "CC Abdalla",
                          payment_status: "unpaid",
                          paid_amount: 0,
                          notes: ""
                        });
                        setIsCreateOrderOpen(true);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      + Create Order
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-glass"
                      style={{ padding: "6px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={() => setIsScanHistoryOpen(true)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Scan Print History
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
                    <input 
                      placeholder="Search name, phone, code..." 
                      value={adminSearch} 
                      onChange={e => setAdminSearch(e.target.value)} 
                      style={{ padding: "6px 14px", fontSize: 13, minWidth: 200, borderRadius: "var(--radius-full)" }} 
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort:</span>
                      {["date", "weight", "filesize", "price"].map(s => (
                        <button key={s} className={`btn ${sortBy === s ? "btn-primary" : "btn-glass"}`}
                          style={{ padding: "6px 14px", fontSize: 12 }}
                          onClick={() => setSortBy(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status Filter Tabs */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {[
                    { id: "all", label: `All Orders (${orders.length})` },
                    { id: "queued", label: `Queued (${orders.filter(o => (o.status || "").toLowerCase().trim() === "queued").length})` },
                    { id: "printing", label: `Printing (${orders.filter(o => (o.status || "").toLowerCase().trim() === "printing").length})` },
                    { id: "done", label: `Done (${orders.filter(o => (o.status || "").toLowerCase().trim() === "done").length})` },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`btn ${adminStatusFilter === f.id ? "btn-primary" : "btn-glass"}`}
                      style={{ padding: "5px 12px", fontSize: 12, borderRadius: "var(--radius-full)" }}
                      onClick={() => setAdminStatusFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Master Select All Checkbox & Bulk Actions */}
                {(() => {
                  const visibleOrders = getSortedOrders();
                  const allVisibleSelected = visibleOrders.length > 0 && visibleOrders.every(o => selectedOrders.includes(o.id));
                  const selectedTotal = orders.filter(o => selectedOrders.includes(o.id)).reduce((sum, o) => {
                    const price = o.totalprice !== null && o.totalprice !== undefined ? Number(o.totalprice) : (Number(o.weightgrams) || 0) * (parseFloat(config.price_per_gram) || 3);
                    return sum + price;
                  }, 0);

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)" }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox"
                          id="masterSelectAll"
                          checked={allVisibleSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrders(prev => Array.from(new Set([...prev, ...visibleOrders.map(o => o.id)])));
                            } else {
                              const visibleIds = visibleOrders.map(o => o.id);
                              setSelectedOrders(prev => prev.filter(id => !visibleIds.includes(id)));
                            }
                          }}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                        <label htmlFor="masterSelectAll" style={{ margin: 0, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          Select All Visible ({visibleOrders.length})
                        </label>
                      </div>

                      {selectedOrders.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
                            {selectedOrders.length} selected &bull; Total: {selectedTotal.toFixed(2)} EGP
                          </span>
                          <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("queued")}>Set Queued</button>
                          <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("printing")}>Set Printing</button>
                          <button className="btn btn-sm btn-glass" onClick={() => handleBulkStatus("done")}>Set Done</button>
                          <button className="btn btn-sm" style={{ background: "#FF3B30", color: "#fff" }} onClick={handleBulkDelete}>Delete</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {getSortedOrders().map(o => {
                  const calculatedPrice = (o.weightgrams || 0) * (parseFloat(config.price_per_gram) || 0);
                  const isSelected = selectedOrders.includes(o.id);
                  const cleanPhone = (o.phone || "").replace(/[^0-9]/g, "");
                  const waPhone = cleanPhone.startsWith("2") ? cleanPhone : `2${cleanPhone}`;
                  const waMessage = `Hello ${o.name || "Customer"}, your 3D printing order "${o.ordername || "Order"}" (Tracking: ${o.tracking_code || ""}) is currently ${o.status.toUpperCase()} at Etba3ly.`;

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
                              {o.tracking_code && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, fontFamily: "monospace" }}>{o.tracking_code}</span>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-glass"
                                    style={{ padding: "1px 6px", fontSize: 10 }}
                                    onClick={async () => {
                                      await copyToClipboard(o.tracking_code);
                                      addToast(`Copied ${o.tracking_code}`, "info");
                                    }}
                                    title="Copy tracking code"
                                  >
                                    Copy
                                  </button>
                                </span>
                              )}
                              {o.status === "printing" && getPrinterFromNotes(o.notes) && <span style={{ fontSize: 10, background: "rgba(0,122,255,0.1)", color: "var(--status-printing)", padding: "3px 10px", borderRadius: "var(--radius-full)", fontWeight: 700, border: "1px solid rgba(0,122,255,0.2)" }}>[PRINTER: {getPrinterFromNotes(o.notes)}]</span>}
                              {Number(o.totalprice || 0) > (parseFloat(config.price_review_threshold) || 300) && (
                                <span style={{ fontSize: 10, background: "rgba(255, 149, 0, 0.15)", color: "var(--accent)", padding: "3px 10px", borderRadius: "var(--radius-full)", fontWeight: 800, border: "1px solid rgba(255, 149, 0, 0.3)" }}>
                                  High Volume Review
                                </span>
                              )}
                              {/* Internal Payment Status (Admin Only) */}
                              {(() => {
                                const pay = getOrderPaymentInfo(o);
                                const orderPrice = o.totalprice !== null && o.totalprice !== undefined ? Number(o.totalprice) : (Number(o.weightgrams) || 0) * (parseFloat(config.price_per_gram) || 3);
                                return (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Payment:</span>
                                    <select
                                      value={pay.status}
                                      onChange={(e) => {
                                        const newStat = e.target.value;
                                        let newAmt = pay.paidAmount;
                                        if (newStat === "paid") newAmt = orderPrice;
                                        else if (newStat === "unpaid") newAmt = 0;
                                        handleUpdatePayment(o.id, newStat, newAmt);
                                      }}
                                      style={{
                                        padding: "3px 8px",
                                        fontSize: 11,
                                        fontWeight: 800,
                                        borderRadius: "var(--radius-full)",
                                        background: pay.status === "paid" ? "rgba(52, 199, 89, 0.15)" : pay.status === "partial" ? "rgba(255, 149, 0, 0.15)" : "rgba(255, 59, 48, 0.15)",
                                        color: pay.status === "paid" ? "var(--status-done)" : pay.status === "partial" ? "var(--accent)" : "#ff453a",
                                        border: `1px solid ${pay.status === "paid" ? "rgba(52, 199, 89, 0.4)" : pay.status === "partial" ? "rgba(255, 149, 0, 0.4)" : "rgba(255, 59, 48, 0.4)"}`,
                                        cursor: "pointer"
                                      }}
                                      title="Internal Cash Payment Status (Admin Only)"
                                    >
                                      <option value="unpaid">Unpaid ({orderPrice.toFixed(0)} EGP)</option>
                                      <option value="partial">Partial</option>
                                      <option value="paid">Paid in Full</option>
                                    </select>
                                    {pay.status === "partial" && (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <input
                                          type="number"
                                          step="1"
                                          min="0"
                                          max={orderPrice}
                                          defaultValue={pay.paidAmount}
                                          placeholder="Paid"
                                          onBlur={(e) => handleUpdatePayment(o.id, "partial", e.target.value)}
                                          onKeyDown={(e) => e.key === "Enter" && handleUpdatePayment(o.id, "partial", e.target.value)}
                                          style={{ width: 60, padding: "2px 6px", fontSize: 11, fontWeight: 700, textAlign: "right" }}
                                          title="Enter cash amount received"
                                        />
                                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>/ {orderPrice.toFixed(0)} EGP</span>
                                      </span>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                            <div style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span>{o.name} &bull; {o.phone}{o.email && <> &bull; {o.email}</>}</span>
                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-sm btn-glass"
                                  style={{ padding: "2px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, color: "#25D366", borderColor: "rgba(37,211,102,0.3)" }}
                                  title="Open WhatsApp chat with client"
                                >
                                  <WhatsAppIcon /> WhatsApp
                                </a>
                              )}
                            </div>
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
                            {o.status === "queued" && (
                              <button
                                type="button"
                                className="btn btn-accent"
                                style={{ padding: "8px 14px", fontSize: 12 }}
                                onClick={() => {
                                  const busyPrinters = orders.filter(x => x.status === "printing" && x.id !== o.id).map(x => getPrinterFromNotes(x.notes)).filter(Boolean);
                                  const available = PRINTERS.find(p => !busyPrinters.includes(p)) || PRINTERS[0];
                                  handleUpdateOrderStatus(o.id, "printing", available);
                                }}
                              >
                                Start Print
                              </button>
                            )}
                            {o.status === "printing" && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: "8px 14px", fontSize: 12, background: "var(--status-done)", borderColor: "var(--status-done)" }}
                                onClick={() => handleUpdateOrderStatus(o.id, "done")}
                              >
                                Mark Done
                              </button>
                            )}
                            <select value={o.status} onChange={(e) => {
                              const newStatus = e.target.value;
                              if (newStatus === "printing") {
                                const busyPrinters = orders.filter(x => x.status === "printing" && x.id !== o.id).map(x => getPrinterFromNotes(x.notes)).filter(Boolean);
                                const available = PRINTERS.find(p => !busyPrinters.includes(p)) || PRINTERS[0];
                                handleUpdateOrderStatus(o.id, newStatus, available);
                              } else {
                                handleUpdateOrderStatus(o.id, newStatus);
                              }
                            }} style={{ width: 120, padding: 8, fontSize: 12 }}>
                              <option value="queued">Queued</option>
                              <option value="printing">Printing</option>
                              <option value="done">Done</option>
                            </select>
                            {o.status === "printing" && (
                              <select value={getPrinterFromNotes(o.notes) || PRINTERS[0]} onChange={(e) => handleUpdateOrderStatus(o.id, "printing", e.target.value)} style={{ width: 140, padding: 8, fontSize: 12 }}>
                                {PRINTERS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            )}
                            {Boolean(o.fileurl && o.fileurl.toLowerCase().includes('.stl')) && (
                              <button
                                type="button"
                                onClick={() => setAdminSlicerOrder(o)}
                                className="btn btn-accent"
                                style={{ padding: "8px 14px", fontSize: 12 }}
                              >
                                Inspect & Slice 3D
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenMoonrakerForOrder(o)}
                              className="btn btn-glass"
                              style={{ padding: "8px 14px", fontSize: 12 }}
                            >
                              Send to Printer
                            </button>
                            {o.fileurl && o.fileurl.split(',').map((url, idx, arr) => (
                              <a key={idx} href={url} download target="_blank" rel="noreferrer" className="btn btn-glass" style={{ padding: "8px 14px", fontSize: 12 }}>
                                Download {arr.length > 1 ? idx + 1 : ""}
                              </a>
                            ))}
                            <button onClick={() => setEditingOrder(o)} className="btn btn-glass" style={{ padding: "8px 14px", fontSize: 12 }}>Edit</button>
                            <button onClick={() => handleDeleteOrder(o.id)} style={{ padding: "8px 14px", background: "#FF3B30", color: "#fff", border: "none", borderRadius: "var(--radius-full)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Delete</button>
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

          {adminTab === "profit" && (
            <AdminProfitTab
              orders={orders}
              config={config}
              spoolCostKg={spoolCostKg}
              setSpoolCostKg={setSpoolCostKg}
              electricityTariffKwh={electricityTariffKwh}
              setElectricityTariffKwh={setElectricityTariffKwh}
              printerPowerWatts={printerPowerWatts}
              setPrinterPowerWatts={setPrinterPowerWatts}
              cc1WearRatePerHour={cc1WearRatePerHour}
              setCc1WearRatePerHour={setCc1WearRatePerHour}
              printSpeedGph={printSpeedGph}
              setPrintSpeedGph={setPrintSpeedGph}
              materialCosts={materialCosts}
              setMaterialCosts={setMaterialCosts}
              fleetLogs={fleetLogs}
              setFleetLogs={setFleetLogs}
              externalPrinterStates={externalPrinterStates}
              PRINTERS={PRINTERS}
              onClearExternalJob={handleClearExternalJob}
              onDeleteFleetLog={handleDeleteFleetLog}
              onOpenExternalPrompt={handleSetExternalJob}
              onOpenScanHistory={() => setIsScanHistoryOpen(true)}
              addToast={addToast}
            />
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
                <GalleryStudioUploader
                  files={newGalleryFiles}
                  onProcessedFilesChange={setNewGalleryFiles}
                  onProcessingStateChange={setGalleryProcessing}
                />
                <button className="btn btn-primary" onClick={handleAddGalleryItem} disabled={galleryUploading || galleryProcessing}>
                  {galleryProcessing ? "Removing Background & Applying Glow..." : galleryUploading ? "Uploading..." : "Add to Gallery"}
                </button>
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
                <div className="form-row" style={{ marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <label>Price per Gram (EGP)</label>
                    <input type="number" step="0.5" min="0" value={config.price_per_gram} onChange={e => setConfig(p => ({ ...p, price_per_gram: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Order Review Threshold (EGP)</label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={config.price_review_threshold !== undefined ? config.price_review_threshold : 300}
                      onChange={e => setConfig(p => ({ ...p, price_review_threshold: e.target.value }))}
                      placeholder="300"
                    />
                  </div>
                </div>
                <p style={{ marginTop: -12, marginBottom: 20, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                  Orders with an estimated slicer price exceeding this threshold prompt the client for workshop operator review for accurate pricing and tolerances, without revealing the threshold value to the customer.
                </p>
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
                <div style={{ marginBottom: 20 }}>
                  <label>WhatsApp Number (International or Egyptian e.g. 010... / +20...)</label>
                  <input value={config.whatsapp_number || ""} onChange={e => setConfig(p => ({ ...p, whatsapp_number: e.target.value }))} placeholder="e.g. +201012345678 or 01012345678" />
                </div>
                <div style={{ marginBottom: 20, padding: "16px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-glass-strong)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <label style={{ margin: 0, fontWeight: 700 }}>CallMeBot WhatsApp Order Alerts API Key</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-accent"
                      style={{ padding: "4px 12px", fontSize: 11 }}
                      disabled={isTestingWhatsApp}
                      onClick={handleTestWhatsApp}
                    >
                      {isTestingWhatsApp ? "Sending..." : "Send Test WhatsApp Alert"}
                    </button>
                  </div>
                  <input
                    value={config.whatsapp_api_key || ""}
                    onChange={e => setConfig(p => ({ ...p, whatsapp_api_key: e.target.value }))}
                    placeholder="Enter CallMeBot API Key (e.g. 123456)"
                    style={{ marginBottom: 8 }}
                  />
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                    Free instant WhatsApp order alerts directly to your phone. To get your free key: send the message <strong>I allow callmebot to send me messages</strong> to <strong>+34 644 44 20 84</strong> on WhatsApp, then enter the key here.
                  </p>
                </div>
                <div style={{ marginBottom: 20 }}><label>Instagram Link</label><input value={config.instagram_link || ""} onChange={e => setConfig(p => ({ ...p, instagram_link: e.target.value }))} placeholder="https://instagram.com/..." /></div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ margin: 0 }}>Notification Email Address</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-glass"
                      style={{ padding: "3px 10px", fontSize: 11 }}
                      disabled={isTestingEmail}
                      onClick={handleTestEmail}
                    >
                      {isTestingEmail ? "Testing..." : "Send Test Invoice Email"}
                    </button>
                  </div>
                  <input type="email" value={config.email_address || ""} onChange={e => setConfig(p => ({ ...p, email_address: e.target.value }))} placeholder="hello@example.com" />
                  {emailDiagnosticStatus && (
                    <div style={{
                      marginTop: 10,
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 12,
                      background: emailDiagnosticStatus.state === "success" ? "rgba(16,185,129,0.12)" : emailDiagnosticStatus.state === "error" ? "rgba(255,59,48,0.12)" : "rgba(255,128,0,0.12)",
                      border: `1px solid ${emailDiagnosticStatus.state === "success" ? "rgba(16,185,129,0.3)" : emailDiagnosticStatus.state === "error" ? "rgba(255,59,48,0.3)" : "rgba(255,128,0,0.3)"}`,
                      color: emailDiagnosticStatus.state === "success" ? "var(--status-done)" : emailDiagnosticStatus.state === "error" ? "#FF3B30" : "var(--accent)"
                    }}>
                      <strong>{emailDiagnosticStatus.state === "success" ? "Email Diagnostics Passed: " : emailDiagnosticStatus.state === "error" ? "Email Diagnostic Notice: " : "Status: "}</strong>
                      {emailDiagnosticStatus.message}
                    </div>
                  )}
                </div>
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
                  <div style={{ flex: 1 }}>
                    <label>Material</label>
                    <select
                      value={editingOrder.material || ""}
                      onChange={e => setEditingOrder({ ...editingOrder, material: e.target.value })}
                      style={{ width: '100%', marginBottom: 16 }}
                    >
                      {Array.from(new Set([
                        ...(editingOrder.material ? [editingOrder.material] : []),
                        ...(config.materials || "").split(',').map(m => m.trim()).filter(Boolean)
                      ])).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Color</label>
                    <select
                      value={editingOrder.color || ""}
                      onChange={e => setEditingOrder({ ...editingOrder, color: e.target.value })}
                      style={{ width: '100%', marginBottom: 16 }}
                    >
                      {Array.from(new Set([
                        ...(editingOrder.color ? [editingOrder.color] : []),
                        ...(config.colors || "").split(',').map(c => c.trim()).filter(Boolean)
                      ])).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
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
                
                {/* Internal Cash Payment Tracking (Admin Only) */}
                {(() => {
                  const pay = getOrderPaymentInfo(editingOrder);
                  const orderPrice = editingOrder.totalprice !== null && editingOrder.totalprice !== undefined ? Number(editingOrder.totalprice) : (Number(editingOrder.weightgrams) || 0) * (parseFloat(config.price_per_gram) || 3);
                  return (
                    <div style={{ padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)", marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                        Internal Cash Payment Tracking (Admin Only)
                      </div>
                      <div className="form-row">
                        <div style={{ flex: 1 }}>
                          <label>Payment Status</label>
                          <select
                            value={pay.status}
                            onChange={(e) => {
                              const newStat = e.target.value;
                              const newAmt = newStat === "paid" ? orderPrice : newStat === "unpaid" ? 0 : pay.paidAmount;
                              const updatedNotes = setOrderPaymentInNotes(editingOrder.notes, newStat, newAmt);
                              setEditingOrder({
                                ...editingOrder,
                                payment_status: newStat,
                                paid_amount: newAmt,
                                notes: updatedNotes
                              });
                            }}
                            style={{ width: "100%" }}
                          >
                            <option value="unpaid">Unpaid</option>
                            <option value="partial">Partially Paid</option>
                            <option value="paid">Paid in Full</option>
                          </select>
                        </div>
                        {pay.status === "partial" && (
                          <div style={{ flex: 1 }}>
                            <label>Amount Paid (EGP)</label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max={orderPrice}
                              value={pay.paidAmount}
                              onChange={(e) => {
                                const amt = parseFloat(e.target.value) || 0;
                                const updatedNotes = setOrderPaymentInNotes(editingOrder.notes, "partial", amt);
                                setEditingOrder({
                                  ...editingOrder,
                                  payment_status: "partial",
                                  paid_amount: amt,
                                  notes: updatedNotes
                                });
                              }}
                              style={{ width: "100%" }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

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
                    const pay = getOrderPaymentInfo(editingOrder);
                    const finalNotes = setOrderPaymentInNotes(editingOrder.notes, pay.status, pay.paidAmount);
                    const payloadToSave = {
                      ...editingOrder,
                      notes: finalNotes,
                      payment_status: pay.status,
                      paid_amount: pay.paidAmount
                    };
                    const { error: saveErr } = await supabase.from("orders").update(payloadToSave).eq("id", editingOrder.id);
                    if (saveErr) {
                      const { payment_status, paid_amount, ...cleanPayload } = payloadToSave;
                      await supabase.from("orders").update(cleanPayload).eq("id", editingOrder.id);
                    }
                    fetchOrders();
                    setEditingOrder(null);
                    addToast("Order updated across website and financial model", "success");
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {editingGalleryItem.media_urls && editingGalleryItem.media_urls.split(',').filter(Boolean).map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: editingGalleryItem.cover_url === url ? '3px solid var(--accent)' : '1px solid var(--border-glass)' }}>
                      <img src={url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                      <div style={{ display: 'flex', gap: 4, padding: 4 }}>
                        <button style={{ flex: 1, fontSize: 10, padding: '4px', cursor: 'pointer', background: editingGalleryItem.cover_url === url ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: editingGalleryItem.cover_url === url ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: 4 }} onClick={() => setEditingGalleryItem({...editingGalleryItem, cover_url: url})}>Cover</button>
                        <button
                          style={{ flex: 1, fontSize: 10, padding: '4px', cursor: 'pointer', background: 'rgba(255,128,0,0.2)', color: 'var(--accent)', border: '1px solid rgba(255,128,0,0.4)', borderRadius: 4, fontWeight: 700 }}
                          disabled={convertingMediaUrl === url}
                          onClick={() => handleConvertExistingGalleryUrlToGlow(url)}
                          title="Remove background and apply Etba3ly Glowing Orange backdrop"
                        >
                          {convertingMediaUrl === url ? "..." : "Glow BG"}
                        </button>
                        <button style={{ fontSize: 10, padding: '4px 6px', cursor: 'pointer', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4 }} onClick={() => handleRemoveMediaFromGalleryItem(url)}>X</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label>Add More Images / GIFs (Auto Background Removal + Glowing Orange BG)</label>
                  <input type="file" multiple accept="image/*,.gif" onChange={e => handleAddMediaToGalleryItem(Array.from(e.target.files))} style={{ padding: 14, border: "2px dashed var(--border-glass)", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.05)" }} />
                  {galleryUploading && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>Removing background, applying orange glow, and uploading...</div>}
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
              <div className="modal-content" style={{ maxWidth: 460, width: "100%", padding: 28, textAlign: "left" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 18, fontWeight: 800 }}>Log Direct USB Print for {externalPromptPrinter}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  Track machine telemetry, real operating hours, and nozzle wear when printing directly from a USB flash drive or physical touchscreen.
                </p>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12 }}>Job or Part Description *</label>
                  <input
                    value={externalJobInput}
                    onChange={e => setExternalJobInput(e.target.value)}
                    placeholder="e.g. Flash Drive: Mechanical Gear"
                    autoFocus
                  />
                </div>
                <div className="form-row" style={{ marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12 }}>Filament Extruded (grams)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={externalJobWeight}
                      onChange={e => {
                        const val = e.target.value;
                        setExternalJobWeight(val);
                        if (val && !externalJobHours) {
                          const w = parseFloat(val) || 0;
                          const speed = parseFloat(printSpeedGph) || 35;
                          if (speed > 0) setExternalJobHours((w / speed).toFixed(1));
                        }
                      }}
                      placeholder="e.g. 85"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12 }}>Print Duration (hours)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={externalJobHours}
                      onChange={e => setExternalJobHours(e.target.value)}
                      placeholder="e.g. 2.4"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-glass" onClick={() => setExternalPromptPrinter(null)}>Cancel</button>
                  <button type="button" className="btn btn-accent" onClick={handleSaveExternalJob}>Log & Mark as Working</button>
                </div>
              </div>
            </div>
          )}

          {/* Admin Create Order Modal */}
          {isCreateOrderOpen && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="modal-content" style={{ padding: 32, width: '90%', maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ marginBottom: 6 }}>Create New Order (Admin)</h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                  Inject offline, direct, or custom client orders directly into the production queue with full telemetry and internal payment tracking.
                </p>

                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Customer Name *</label>
                    <input
                      value={newAdminOrder.name}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, name: e.target.value })}
                      placeholder="e.g. Karim Tarek"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Egyptian Phone *</label>
                    <input
                      value={newAdminOrder.phone}
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, "");
                        if (val.length > 11) val = val.slice(0, 11);
                        setNewAdminOrder({ ...newAdminOrder, phone: val });
                      }}
                      placeholder="e.g. 01012345678"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Email Address (Optional)</label>
                    <input
                      value={newAdminOrder.email}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, email: e.target.value })}
                      placeholder="client@example.com"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Part / Order Description</label>
                    <input
                      value={newAdminOrder.ordername}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, ordername: e.target.value })}
                      placeholder="e.g. Robotics Gear Housing"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Material</label>
                    <select
                      value={newAdminOrder.material}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, material: e.target.value })}
                      style={{ width: "100%", marginBottom: 14 }}
                    >
                      {(config.materials || "PLA,PETG,ABS").split(',').map(m => m.trim()).filter(Boolean).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Filament Color</label>
                    <select
                      value={newAdminOrder.color}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, color: e.target.value })}
                      style={{ width: "100%", marginBottom: 14 }}
                    >
                      {(config.colors || "White,Black,McLaren Orange").split(',').map(c => c.trim()).filter(Boolean).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Filament Weight (grams)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newAdminOrder.weightgrams}
                      onChange={e => {
                        const val = e.target.value;
                        const w = parseFloat(val) || 0;
                        const rate = parseFloat(newAdminOrder.pricepergram) || (parseFloat(config.price_per_gram) || 3);
                        setNewAdminOrder(prev => ({
                          ...prev,
                          weightgrams: val,
                          totalprice: (w * rate).toFixed(2)
                        }));
                      }}
                      placeholder="e.g. 65"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Unit Rate (EGP/g)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newAdminOrder.pricepergram}
                      onChange={e => {
                        const val = e.target.value;
                        const rate = parseFloat(val) || 0;
                        const w = parseFloat(newAdminOrder.weightgrams) || 0;
                        setNewAdminOrder(prev => ({
                          ...prev,
                          pricepergram: val,
                          totalprice: (w * rate).toFixed(2)
                        }));
                      }}
                      placeholder="3"
                      style={{ width: "100%", marginBottom: 14 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Total Price (EGP)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={newAdminOrder.totalprice}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, totalprice: e.target.value })}
                      placeholder="0.00"
                      style={{ width: "100%", marginBottom: 14, fontWeight: 700, color: "var(--accent)" }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label>Production Status</label>
                    <select
                      value={newAdminOrder.status}
                      onChange={e => setNewAdminOrder({ ...newAdminOrder, status: e.target.value })}
                      style={{ width: "100%", marginBottom: 14 }}
                    >
                      <option value="queued">Queued</option>
                      <option value="printing">Printing Live</option>
                      <option value="done">Completed & Ready</option>
                    </select>
                  </div>
                  {newAdminOrder.status === "printing" && (
                    <div style={{ flex: 1 }}>
                      <label>Assigned Printer</label>
                      <select
                        value={newAdminOrder.printer}
                        onChange={e => setNewAdminOrder({ ...newAdminOrder, printer: e.target.value })}
                        style={{ width: "100%", marginBottom: 14 }}
                      >
                        {PRINTERS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Internal Payment Status (Admin Only) */}
                <div style={{ padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Internal Cash Payment Tracking (Admin Only)
                  </div>
                  <div className="form-row">
                    <div style={{ flex: 1 }}>
                      <label>Payment Status</label>
                      <select
                        value={newAdminOrder.payment_status}
                        onChange={e => {
                          const stat = e.target.value;
                          const total = parseFloat(newAdminOrder.totalprice) || 0;
                          setNewAdminOrder(prev => ({
                            ...prev,
                            payment_status: stat,
                            paid_amount: stat === "paid" ? total : stat === "unpaid" ? 0 : prev.paid_amount
                          }));
                        }}
                        style={{ width: "100%" }}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="partial">Partially Paid</option>
                        <option value="paid">Paid in Full</option>
                      </select>
                    </div>
                    {newAdminOrder.payment_status === "partial" && (
                      <div style={{ flex: 1 }}>
                        <label>Amount Paid (EGP)</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max={parseFloat(newAdminOrder.totalprice) || 9999}
                          value={newAdminOrder.paid_amount}
                          onChange={e => setNewAdminOrder({ ...newAdminOrder, paid_amount: e.target.value })}
                          placeholder="e.g. 50"
                          style={{ width: "100%" }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label>Internal Workshop Notes</label>
                  <textarea
                    rows="2"
                    value={newAdminOrder.notes}
                    onChange={e => setNewAdminOrder({ ...newAdminOrder, notes: e.target.value })}
                    placeholder="e.g. Paid cash at workshop pickup, layer height 0.2mm"
                    style={{ width: "100%", marginBottom: 20 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-glass" onClick={() => setIsCreateOrderOpen(false)}>Cancel</button>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={handleAdminCreateOrder}
                    disabled={isCreatingAdminOrder}
                  >
                    {isCreatingAdminOrder ? "Creating Order..." : "Create Order"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Moonraker / Printer History Audit & Suggestion Modal */}
          {isScanHistoryOpen && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div className="modal-content" style={{ padding: 32, width: '92%', maxWidth: 740, maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h2 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 10 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--accent)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Scan 3D Printer History
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                      Query your printer's Klipper / Moonraker API for recent print jobs to audit machine operating hours, extruded grams, and accumulated hardware depreciation.
                    </p>
                  </div>
                  <button type="button" className="btn btn-sm btn-glass" onClick={() => setIsScanHistoryOpen(false)}>Close</button>
                </div>

                {/* Tab Switcher */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border-glass)", paddingBottom: 12 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${scanTab === "moonraker" ? "btn-primary" : "btn-glass"}`}
                    onClick={() => setScanTab("moonraker")}
                  >
                    Moonraker Wi-Fi Scanner
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${scanTab === "unassigned_orders" ? "btn-primary" : "btn-glass"}`}
                    onClick={() => setScanTab("unassigned_orders")}
                  >
                    Unassigned Completed Website Orders
                  </button>
                </div>

                {scanTab === "moonraker" && (
                  <>
                    <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)", marginBottom: 20 }}>
                      <div className="form-row">
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 12 }}>Target Printer Odometer</label>
                          <select
                            value={scanTargetPrinter}
                            onChange={e => setScanTargetPrinter(e.target.value)}
                            style={{ width: "100%", padding: "10px 12px" }}
                          >
                            {PRINTERS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1.6 }}>
                          <label style={{ fontSize: 12 }}>Moonraker Host / IP (Dynamic IP Supported)</label>
                          <input
                            value={moonrakerHost}
                            onChange={e => {
                              setMoonrakerHost(e.target.value);
                              localStorage.setItem("jp_moonraker_host", e.target.value);
                            }}
                            placeholder="e.g. 192.168.1.50 or fluidd.local:7125"
                            style={{ width: "100%", padding: "10px 12px" }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          Dynamic IP changes on reconnect? Enter the current IP assigned by your Wi-Fi router.
                        </span>
                        <button
                          type="button"
                          className="btn btn-accent"
                          style={{ padding: "8px 18px", fontSize: 13 }}
                          onClick={handleScanMoonraker}
                          disabled={isScanningHistory}
                        >
                          {isScanningHistory ? "Scanning Moonraker..." : "Scan History"}
                        </button>
                      </div>
                    </div>

                    {scanError && (
                      <div style={{ padding: 14, background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: 13 }}>
                        <div style={{ fontWeight: 800, color: "#ff453a", marginBottom: 6 }}>Connection Diagnostic</div>
                        <div style={{ color: "var(--text-secondary)", marginBottom: 10 }}>{scanError}</div>
                        <div style={{ padding: 8, background: "rgba(0,0,0,0.3)", borderRadius: 4, fontFamily: "monospace", fontSize: 11, color: "var(--accent)" }}>
                          # Allow browser access in moonraker.conf:<br />
                          [authorization]<br />
                          cors_domains:<br />
                          &nbsp;&nbsp;*
                        </div>
                      </div>
                    )}

                    {scannedJobs.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            Found {scannedJobs.length} print jobs ({selectedJobIds.length} selected for odometer update):
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-glass"
                              onClick={() => {
                                const newOnly = scannedJobs.filter(j => !j.isLogged).map(j => j.jobId);
                                setSelectedJobIds(newOnly);
                              }}
                            >
                              Select All New
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-glass"
                              onClick={() => setSelectedJobIds(scannedJobs.map(j => j.jobId))}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-glass"
                              onClick={() => setSelectedJobIds([])}
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-sm)" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border-glass)", color: "var(--text-tertiary)", textAlign: "left", background: "rgba(255,255,255,0.02)" }}>
                                <th style={{ padding: "8px 10px", width: 36 }}></th>
                                <th style={{ padding: "8px 10px" }}>File Name</th>
                                <th style={{ padding: "8px 10px" }}>Status</th>
                                <th style={{ padding: "8px 10px" }}>Duration</th>
                                <th style={{ padding: "8px 10px" }}>Extruded</th>
                                <th style={{ padding: "8px 10px" }}>End Time</th>
                                <th style={{ padding: "8px 10px" }}>Odometer</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scannedJobs.map(job => {
                                const isSelected = selectedJobIds.includes(job.jobId);
                                return (
                                  <tr key={job.jobId} style={{ borderBottom: "1px solid var(--border-glass)", background: isSelected ? "rgba(255,128,0,0.05)" : "transparent" }}>
                                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={e => {
                                          if (e.target.checked) setSelectedJobIds(prev => [...prev, job.jobId]);
                                          else setSelectedJobIds(prev => prev.filter(id => id !== job.jobId));
                                        }}
                                      />
                                    </td>
                                    <td style={{ padding: "8px 10px", fontWeight: 700, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {job.filename}
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: job.isCompleted ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.08)", color: job.isCompleted ? "var(--status-done)" : "var(--text-tertiary)", fontWeight: 700 }}>
                                        {job.status.toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>{job.durationHours.toFixed(2)}h</td>
                                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{job.grams.toFixed(0)}g</td>
                                    <td style={{ padding: "8px 10px", color: "var(--text-tertiary)" }}>{job.dateStr}</td>
                                    <td style={{ padding: "8px 10px" }}>
                                      {job.isLogged ? (
                                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Already Logged</span>
                                      ) : (
                                        <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>Ready to Add</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Audit Summary & Approval Action */}
                        {(() => {
                          const selectedJobs = scannedJobs.filter(j => selectedJobIds.includes(j.jobId));
                          const selHours = selectedJobs.reduce((sum, j) => sum + j.durationHours, 0);
                          const selGrams = selectedJobs.reduce((sum, j) => sum + j.grams, 0);
                          const wearCost = selHours * (parseFloat(cc1WearRatePerHour) || 6.0);

                          return (
                            <div style={{ marginTop: 16, padding: 14, background: "rgba(255,128,0,0.06)", border: "1px solid rgba(255,128,0,0.3)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>
                                  Selected: {selectedJobs.length} jobs &bull; {selHours.toFixed(1)} operating hours &bull; {Math.round(selGrams)}g filament
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                  Accumulated Machine Wear Burden: <strong>{wearCost.toFixed(2)} EGP</strong> ({scanTargetPrinter})
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-accent"
                                onClick={handleApproveMoonrakerJobs}
                                disabled={selectedJobs.length === 0}
                              >
                                Approve & Add to {scanTargetPrinter} Odometers
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {scanTab === "unassigned_orders" && (
                  <div>
                    {(() => {
                      const unassigned = orders.filter(o => (o.status || "").toLowerCase().trim() === "done" && !getPrinterFromNotes(o.notes));
                      if (unassigned.length === 0) {
                        return (
                          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                            All completed website orders are already attributed to individual printer hardware odometers.
                          </div>
                        );
                      }

                      return (
                        <div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                            Found <strong>{unassigned.length}</strong> completed website orders not yet attributed to a specific hardware printer. Select an order to attribute its print hours and grams to {scanTargetPrinter}:
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                            {unassigned.map(o => {
                              const w = Number(o.weightgrams) || 0;
                              const speed = parseFloat(printSpeedGph) || 35;
                              const h = speed > 0 ? (w / speed) : 0;
                              return (
                                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-glass)", flexWrap: "wrap", gap: 8 }}>
                                  <div>
                                    <strong style={{ fontSize: 13 }}>{o.ordername || "Order"}</strong> &bull; <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{o.name} ({o.tracking_code})</span>
                                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{w}g &bull; ~{h.toFixed(1)} hrs &bull; {o.material}</div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-accent"
                                    onClick={async () => {
                                      await handleUpdateOrderStatus(o.id, "done", scanTargetPrinter);
                                      addToast(`Attributed order ${o.tracking_code} to ${scanTargetPrinter}`, "success");
                                    }}
                                  >
                                    Assign to {scanTargetPrinter}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toasts inside Admin Dashboard */}
          <div className="toast-container">
            {toasts.map(t => (
              <div key={t.id} className={`toast ${t.type}`}>
                {t.msg}
                <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>×</button>
              </div>
            ))}
          </div>
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
        <div style={{ position: "sticky", top: 0, height: "100vh", width: "100%" }}>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 0, 7], fov: 40 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
            performance={{ min: 0.5 }}
          >
            <ambientLight intensity={0.35} />
            <directionalLight position={[8, 10, 5]} intensity={2.0} color="#ffffff" castShadow />
            <directionalLight position={[-6, -4, -6]} intensity={0.5} color="#FFB347" />
            <directionalLight position={[0, -8, 2]} intensity={0.2} color="#FF8000" />
            <pointLight position={[3, 3, 3]} intensity={0.8} color="#FF8000" distance={12} decay={2} />
            <Suspense fallback={<SceneLoader />}>
              <PrintScene />
              <Environment files={`${import.meta.env.BASE_URL}potsdamer_platz_1k.hdr`} />
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
        <div style={{ background: "var(--accent-gradient)", color: "#fff", textAlign: "center", padding: "12px 24px", fontSize: 13.5, fontWeight: 700, marginTop: 96, maxWidth: 1280, marginInline: "auto", borderRadius: "var(--radius-sm)", position: "relative", zIndex: 50, boxShadow: "var(--accent-glow)" }}>
          {config.announcement_text}
        </div>
      )}

      <main>
        {hash === "#full-gallery" && <FullGalleryView items={galleryItems} onItemClick={(item) => { setActiveGalleryItem(item); setActiveMediaIndex(0); }} />}
        
        {hash === "#order" && (
          <section className="section-container animate-in" style={{ paddingTop: 130, minHeight: "100vh", position: "relative", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div className="eyebrow-tag">3D SLICER & ORDER WORKSTATION</div>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 8 }}>{orderStep === 4 ? "Order Dispatched" : "Configure Your 3D Print"}</h1>
              {orderStep < 4 && <p style={{ margin: 0 }}>Step {orderStep} of 3 — Instant STL Geometry & Weight Analysis</p>}
              {orderStep === 1 && <a href="#home" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>Return to Studio Home</a>}
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
                        {config.materials.split(',').map(m => <option key={m} value={m.trim()}>{m.trim()}</option>)}
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
                      {config.colors.split(',').map(c => {
                        const colorName = c.trim();
                        if (!colorName) return null;
                        const hex = getColorHex(colorName);
                        const isSelected = (newOrder.color || "").toLowerCase() === colorName.toLowerCase();
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

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Notes / Special Instructions</label>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{newOrder.notes.length}/500</span>
                    </div>
                    <textarea value={newOrder.notes} maxLength={500} onChange={e => setNewOrder(p => ({ ...p, notes: e.target.value }))} placeholder="Orientation, special tolerances, requests..." rows="3" />
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label>STL, ZIP, or RAR File(s) *</label>
                    <div className={`drop-zone ${isDragging ? 'active' : ''}`} 
                         onDragOver={handleDragOver} 
                         onDragLeave={handleDragLeave} 
                         onDrop={handleDrop}
                         style={{ padding: "40px", border: formErrors.file ? "2px dashed #FF3B30" : "2px dashed var(--border-glass-strong)", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.03)", textAlign: "center", cursor: "pointer" }}>
                      <input type="file" multiple accept=".stl,.zip,.rar" onChange={handleFileChange} style={{ display: 'none' }} id="fileInput" />
                      <label htmlFor="fileInput" style={{ cursor: 'pointer', display: 'block', margin: 0 }}>
                        {selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(", ") : "Drag & Drop .STL, .ZIP, or .RAR File(s) or Click to Browse"}
                      </label>
                    </div>
                    {fileError && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{fileError}</div>}
                    {formErrors.file && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8, fontWeight: 600 }}>{formErrors.file}</div>}
                    {selectedFiles.some(f => f.name.toLowerCase().endsWith(".zip") || f.name.toLowerCase().endsWith(".rar")) && (
                      <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(255,128,0,0.08)", border: "1px solid rgba(255,128,0,0.2)", borderRadius: "var(--radius-sm)", fontSize: 12.5, color: "var(--text-secondary)" }}>
                        <strong style={{ color: "var(--accent)" }}>Archive Uploaded:</strong> Multiple 3D files detected. Contained .stl models verified. Final weight and quote will be calculated and confirmed upon operator review (Standard Rate: <strong>{config.price_per_gram} EGP/g</strong>).
                      </div>
                    )}
                  </div>

                  {/* 3D STL Object Preview & Slicer Estimation */}
                  {Boolean(selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))) && (
                    <div style={{ marginBottom: 24 }}>
                      <label>3D Model & Build Plate Preview</label>
                      <STLViewer
                        file={selectedFiles.find(f => f.name.toLowerCase().endsWith(".stl"))}
                        color={newOrder.color}
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
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-full)", background: clientMetrics.fitsBed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", color: clientMetrics.fitsBed ? "var(--status-done)" : "#ef4444", fontWeight: 700, border: `1px solid ${clientMetrics.fitsBed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
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
                              {clientMetrics.totalPrice > (parseFloat(config.price_review_threshold) || 300) ? (
                                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)", lineHeight: 1.2, marginTop: 4 }}>
                                  Review Required for Final Price
                                </div>
                              ) : (
                                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--accent)" }}>{clientMetrics.totalPrice.toFixed(2)} EGP</div>
                              )}
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
                          {clientMetrics.totalPrice > (parseFloat(config.price_review_threshold) || 300) && (
                            <div style={{
                              marginTop: 14,
                              padding: "12px 16px",
                              background: "rgba(255, 128, 0, 0.08)",
                              border: "1px solid rgba(255, 128, 0, 0.25)",
                              borderRadius: "var(--radius-sm)",
                              fontSize: 12.5,
                              lineHeight: 1.5,
                              color: "var(--text-primary)"
                            }}>
                              <div style={{ fontWeight: 800, color: "var(--accent)", marginBottom: 4 }}>
                                Operator Review Required for Accurate Pricing
                              </div>
                              <div style={{ color: "var(--text-secondary)" }}>
                                Due to the volume and geometry of this model, our workshop engineers will review your 3D design to ensure optimal print orientation, structural tolerances, and confirm accurate final pricing.
                              </div>
                            </div>
                          )}
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
                        * This is an automated preliminary estimate based on uploaded 3D geometry.
                        Final weight, print time, and price may be adjusted based on machine orientation,
                        support structures, and slicer tolerances confirmed by our workshop team.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                    <button className="btn btn-glass" onClick={() => setOrderStep(1)}>Back</button>
                    <button className="btn btn-accent" onClick={() => {
                      const errors = {};
                      if (selectedFiles.length === 0) errors.file = "Please upload at least one STL, ZIP, or RAR file.";
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
                      <span className="review-item-value" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: getColorHex(newOrder.color), border: "1px solid rgba(255,255,255,0.4)", display: "inline-block" }} />
                        {newOrder.material?.toUpperCase()} ({newOrder.color})
                      </span>
                    </div>
                    <div className="review-item">
                      <span className="review-item-label">File Name</span>
                      <span className="review-item-value" style={{ wordBreak: "break-all" }}>{newOrder.fileName}</span>
                    </div>

                    {clientMetrics ? (
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
                          {clientMetrics.totalPrice > (parseFloat(config.price_review_threshold) || 300) ? (
                            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)", textAlign: "right" }}>
                              Review Required for Final Price
                            </span>
                          ) : (
                            <span style={{ fontSize: 20, fontWeight: 900, color: "var(--accent)" }}>
                              {clientMetrics.totalPrice.toFixed(2)} EGP
                            </span>
                          )}
                        </div>
                        {clientMetrics.totalPrice > (parseFloat(config.price_review_threshold) || 300) && (
                          <div style={{
                            marginTop: 10,
                            padding: "10px 14px",
                            background: "rgba(255, 128, 0, 0.08)",
                            border: "1px solid rgba(255, 128, 0, 0.25)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            lineHeight: 1.4
                          }}>
                            Our workshop team will review the 3D model for accurate pricing and confirm the final quote before printing begins.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ margin: "6px 0", borderTop: "1px solid var(--border-glass)" }}></div>
                        <div className="review-item">
                          <span className="review-item-label">Base Rate</span>
                          <span className="review-item-value">{config.price_per_gram} EGP/g</span>
                        </div>
                        <div className="review-item" style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border-glass)" }}>
                          <span className="review-item-label" style={{ fontSize: 15, fontWeight: 700 }}>Est. Total</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)" }}>
                            Calculated upon slicing ({config.price_per_gram} EGP/g)
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

                  {lastSubmittedQuote && (
                    <div className="review-summary-card" style={{ maxWidth: 440, margin: "24px auto", textAlign: "left", background: "rgba(255,255,255,0.02)" }}>
                      <div className="review-item">
                        <span className="review-item-label">Part Name</span>
                        <span className="review-item-value">{lastSubmittedQuote.orderName}</span>
                      </div>
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
                    <a href="#track" className="btn btn-accent" style={{ width: "100%" }} onClick={() => setOrderStep(1)}>Go Track Your Order</a>
                    <a href="#home" className="btn btn-glass" style={{ width: "100%" }} onClick={() => setOrderStep(1)}>Back to Studio Home</a>
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
                <a href="#home" style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", fontWeight: 600 }}>Back to Studio Home</a>
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

                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-glass)", fontSize: 13, color: "var(--text-secondary)" }}>
                      <span>Material: <strong style={{ color: "var(--text-primary)" }}>{r.material || "PLA"}</strong></span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        Color:
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: getColorHex(r.color), border: "1px solid rgba(255,255,255,0.3)", display: "inline-block" }} />
                        <strong style={{ color: "var(--text-primary)" }}>{r.color || "Standard"}</strong>
                      </span>
                      {r.weightgrams > 0 && <span>Weight: <strong style={{ color: "var(--text-primary)" }}>{r.weightgrams} g</strong></span>}
                      {r.totalprice > 0 ? (
                        <span style={{ marginLeft: "auto" }}>Price: <strong style={{ color: "var(--accent)", fontSize: 15 }}>{r.totalprice.toFixed(2)} EGP</strong></span>
                      ) : (
                        <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 12 }}>Rate: {config.price_per_gram} EGP/g</span>
                      )}
                    </div>
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
          {/* ── HERO ── */}
          <section id="home" className="section-container animate-in">
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
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 36, height: 36, color: "var(--accent)"}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: "Fast Turnaround", desc: "Most orders done in 24–48hrs" },
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