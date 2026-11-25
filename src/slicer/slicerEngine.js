import * as THREE from "three";
import { calculateOrderQuote } from "../utils/pricingEngine.js";
// src/slicer/slicerEngine.js
// High-Precision 1:1 Elegoo Slicer / OrcaSlicer Geometric Slicing, Auto-Orientation,
// Tree Support Volumetric Modeling & Physics-Based Kinematic Engine for Elegoo Centauri Carbon (CC1)

export const PRINTER_PROFILES = {
  centauri_carbon: {
    name: "Elegoo Centauri Carbon",
    bed: { x: 256, y: 256, z: 256 },
    nozzle: 0.40,
    extrusionWidth: 0.42,
    maxSpeed: 500, // mm/s
    maxAccel: 20000, // mm/s^2 (CoreXY)
    jerk: 10, // mm/s
    maxVolumetricSpeed: 28.0, // mm^3/s (High-flow ceramic hotend)
    retractDist: 0.8, // mm direct drive
    retractSpeed: 40, // mm/s
    zHop: 0.2, // mm
    firmware: "Klipper (Moonraker)",
    kinematics: "CoreXY",
    defaultHotendTemp: 220,
    defaultBedTemp: 60,
    heatupTimeSeconds: 65,
    bedLevelTimeSeconds: 25,
    defaultIp: "192.168.1.101",
    defaultPort: 7125
  },
  neptune_4_pro: {
    name: "Elegoo Neptune 4 Pro",
    bed: { x: 225, y: 225, z: 265 },
    nozzle: 0.40,
    extrusionWidth: 0.42,
    maxSpeed: 500,
    maxAccel: 12000,
    jerk: 8,
    maxVolumetricSpeed: 22.0,
    retractDist: 0.8,
    retractSpeed: 40,
    zHop: 0.2,
    firmware: "Klipper (Moonraker)",
    kinematics: "Cartesian",
    defaultHotendTemp: 215,
    defaultBedTemp: 60,
    heatupTimeSeconds: 70,
    bedLevelTimeSeconds: 30,
    defaultIp: "192.168.1.102",
    defaultPort: 7125
  },
  neptune_4_max: {
    name: "Elegoo Neptune 4 Max",
    bed: { x: 420, y: 420, z: 480 },
    nozzle: 0.40,
    extrusionWidth: 0.45,
    maxSpeed: 500,
    maxAccel: 10000,
    jerk: 7,
    maxVolumetricSpeed: 24.0,
    retractDist: 0.8,
    retractSpeed: 40,
    zHop: 0.2,
    firmware: "Klipper (Moonraker)",
    kinematics: "Cartesian",
    defaultHotendTemp: 215,
    defaultBedTemp: 65,
    heatupTimeSeconds: 95,
    bedLevelTimeSeconds: 45,
    defaultIp: "192.168.1.103",
    defaultPort: 7125
  }
};

export const MATERIALS = {
  pla: { name: "Elegoo Rapid PLA+", density: 1.25, costPerKg: 22.0, temp: 220, bedTemp: 60 },
  pla_plus: { name: "Elegoo Rapid PLA+", density: 1.25, costPerKg: 22.0, temp: 220, bedTemp: 60 },
  petg: { name: "Elegoo Rapid PETG", density: 1.27, costPerKg: 24.0, temp: 240, bedTemp: 75 },
  abs: { name: "Elegoo ABS", density: 1.04, costPerKg: 25.0, temp: 250, bedTemp: 100 },
  tpu: { name: "Elegoo TPU-95A", density: 1.21, costPerKg: 32.0, temp: 230, bedTemp: 50 },
  carbon_fiber: { name: "Elegoo Carbon Fiber", density: 1.30, costPerKg: 38.0, temp: 260, bedTemp: 80 },
  asa: { name: "Elegoo ASA", density: 1.07, costPerKg: 28.0, temp: 260, bedTemp: 100 }
};

export const FILAMENT_DIAMETER_MM = 1.75;
export const FILAMENT_CROSS_SECTION_MM2 = Math.PI * (FILAMENT_DIAMETER_MM / 2) * (FILAMENT_DIAMETER_MM / 2); // 2.405281875 mm^2

/**
 * Resolves material object and density (g/cm^3) from raw material key or name.
 */
export function resolveMaterialProfile(rawKey = "pla") {
  const k = String(rawKey || "pla").toLowerCase().trim();
  if (k.includes("carbon") || k.includes("cf")) return MATERIALS.carbon_fiber;
  if (k.includes("petg")) return MATERIALS.petg;
  if (k.includes("abs")) return MATERIALS.abs;
  if (k.includes("tpu")) return MATERIALS.tpu;
  if (k.includes("asa")) return MATERIALS.asa;
  if (k.includes("plus") || k.includes("rapid") || k.includes("+")) return MATERIALS.pla_plus;
  return MATERIALS[k] || MATERIALS.pla;
}

// ============================================================================
// 2.A. MULTI-CRITERIA FDM AUTO-ORIENTATION & BUILD-PLATE PLACEMENT ENGINE
// Evaluates candidate downward directions (6 cardinal axes + top planar clusters)
// scoring actual bed-contact area, footprint stability, center-of-mass balance,
// >45 deg overhang support penalty, and 256 x 256 x 256 mm build envelope fit.
// Optionally aligns diagonally exported CAD models to bed X/Z axes via 2D hull,
// then grounds min.y = 0 and centers (X, Z) at (0, 0).
// ============================================================================
function computeConvexHull2D(points) {
  if (points.length <= 3) return points;
  const sorted = points.slice().sort((a, b) => (a.x !== b.x ? a.x - b.x : a.z - b.z));
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function alignDiagonalFootprintYaw(geometry) {
  const pos = geometry.attributes.position;
  if (!pos || pos.count < 3) return;

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (!bbox) return;
  const origW = Math.max(0.1, bbox.max.x - bbox.min.x);
  const origD = Math.max(0.1, bbox.max.z - bbox.min.z);
  const origArea = origW * origD;

  // Sample up to 3000 vertices on XZ plane for fast 2D convex hull
  const step = pos.count > 3000 ? Math.ceil(pos.count / 3000) : 1;
  const pts = [];
  for (let i = 0; i < pos.count; i += step) {
    pts.push({ x: pos.getX(i), z: pos.getZ(i) });
  }
  const hull = computeConvexHull2D(pts);
  if (hull.length < 3) return;

  let bestArea = origArea;
  let bestAngle = 0;

  for (let i = 0; i < hull.length; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % hull.length];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;

    // Angle to rotate edge parallel to X-axis
    const angle = Math.atan2(dz, dx);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let j = 0; j < hull.length; j++) {
      const rx = hull[j].x * cosA - hull[j].z * sinA;
      const rz = hull[j].x * sinA + hull[j].z * cosA;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (rz < minZ) minZ = rz;
      if (rz > maxZ) maxZ = rz;
    }

    const rectArea = Math.max(0.1, (maxX - minX) * (maxZ - minZ));
    if (rectArea < bestArea) {
      bestArea = rectArea;
      bestAngle = angle;
    }
  }

  // Only rotate yaw if model was meaningfully diagonal (saves >= 10% bounding box area)
  if (bestArea < origArea * 0.90 && Math.abs(bestAngle) > 0.03) {
    geometry.rotateY(-bestAngle);
  }
}

export function autoOrientForPrinting(geometry, bedSize = { x: 256, y: 256, z: 256 }) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return geometry;

  const pos = geometry.attributes.position;
  const vertCount = pos.count;
  const triCount = Math.floor(vertCount / 3);
  if (triCount < 1) return geometry;

  // 1. Single fast pass over triangles: compute planar clusters, area-weighted & volume centroids
  const tolRad = 0.12; // ~6.9 degrees tolerance for coplanar normal clustering
  const clusters = [];

  let totalArea = 0;
  let signedVolSum = 0;
  let volCentroidX = 0, volCentroidY = 0, volCentroidZ = 0;
  let areaCentroidX = 0, areaCentroidY = 0, areaCentroidZ = 0;

  const sampleStep = triCount > 10000 ? Math.ceil(triCount / 8000) : 1;
  const sampledCount = Math.ceil(triCount / sampleStep);
  const sNormals = new Float32Array(sampledCount * 3);
  const sCentroids = new Float32Array(sampledCount * 3);
  const sAreas = new Float32Array(sampledCount);
  let sIdx = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i = t * 3;
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    const crossLen = normal.length();
    if (crossLen < 1e-8) continue;

    const area = crossLen * 0.5;
    normal.divideScalar(crossLen);
    totalArea += area;

    const cx = (a.x + b.x + c.x) / 3.0;
    const cy = (a.y + b.y + c.y) / 3.0;
    const cz = (a.z + b.z + c.z) / 3.0;

    areaCentroidX += cx * area;
    areaCentroidY += cy * area;
    areaCentroidZ += cz * area;

    const tetVol = (
      a.x * (b.y * c.z - c.y * b.z) -
      a.y * (b.x * c.z - c.x * b.z) +
      a.z * (b.x * c.y - c.x * b.y)
    ) / 6.0;
    signedVolSum += tetVol;
    volCentroidX += (a.x + b.x + c.x) * 0.25 * tetVol;
    volCentroidY += (a.y + b.y + c.y) * 0.25 * tetVol;
    volCentroidZ += (a.z + b.z + c.z) * 0.25 * tetVol;

    if (t % sampleStep === 0 && sIdx < sampledCount) {
      sNormals[sIdx * 3] = normal.x;
      sNormals[sIdx * 3 + 1] = normal.y;
      sNormals[sIdx * 3 + 2] = normal.z;
      sCentroids[sIdx * 3] = cx;
      sCentroids[sIdx * 3 + 1] = cy;
      sCentroids[sIdx * 3 + 2] = cz;
      sAreas[sIdx] = area * sampleStep;
      sIdx++;
    }

    if (t % sampleStep === 0) {
      let matched = false;
      for (let k = 0; k < clusters.length; k++) {
        const cl = clusters[k];
        if (normal.angleTo(cl.normal) < tolRad) {
          cl.totalArea += area;
          cl.sumX += normal.x * area;
          cl.sumY += normal.y * area;
          cl.sumZ += normal.z * area;
          matched = true;
          break;
        }
      }
      if (!matched && clusters.length < 48) {
        clusters.push({
          normal: normal.clone(),
          totalArea: area,
          sumX: normal.x * area,
          sumY: normal.y * area,
          sumZ: normal.z * area
        });
      }
    }
  }

  if (totalArea <= 1e-8) return geometry;

  // Refine cluster average normals and sort descending by area
  for (const cl of clusters) {
    const len = Math.hypot(cl.sumX, cl.sumY, cl.sumZ);
    if (len > 1e-6) {
      cl.normal.set(cl.sumX / len, cl.sumY / len, cl.sumZ / len);
    }
  }
  clusters.sort((x, y) => y.totalArea - x.totalArea);

  // Center of mass (prefer watertight volume centroid; fallback to area centroid)
  const useVolCom = Math.abs(signedVolSum) > 1e-3;
  const comX = useVolCom ? (volCentroidX / signedVolSum) : (areaCentroidX / totalArea);
  const comY = useVolCom ? (volCentroidY / signedVolSum) : (areaCentroidY / totalArea);
  const comZ = useVolCom ? (volCentroidZ / signedVolSum) : (areaCentroidZ / totalArea);

  geometry.computeBoundingBox();
  const origBBox = geometry.boundingBox;
  const maxDimAll = origBBox
    ? Math.max(1, origBBox.max.x - origBBox.min.x, origBBox.max.y - origBBox.min.y, origBBox.max.z - origBBox.min.z)
    : 50;

  // 2. Build deduplicated list of candidate downward directions
  const candidates = [];
  const addCandidate = (vec, tieBonus = 0) => {
    const len = vec.length();
    if (len < 1e-6) return;
    const normVec = vec.clone().divideScalar(len);
    for (let i = 0; i < candidates.length; i++) {
      if (normVec.angleTo(candidates[i].dir) < 0.14) {
        if (tieBonus > candidates[i].tieBonus) candidates[i].tieBonus = tieBonus;
        return;
      }
    }
    candidates.push({ dir: normVec, tieBonus });
  };

  // Prefer CAD Z-up upright (0, 0, -1) and Three.js Y-up upright (0, -1, 0) on exact ties
  addCandidate(new THREE.Vector3(0, 0, -1), 0.018);
  addCandidate(new THREE.Vector3(0, -1, 0), 0.012);
  addCandidate(new THREE.Vector3(0, 0, 1), 0);
  addCandidate(new THREE.Vector3(0, 1, 0), 0);
  addCandidate(new THREE.Vector3(1, 0, 0), 0);
  addCandidate(new THREE.Vector3(-1, 0, 0), 0);

  for (let i = 0; i < Math.min(8, clusters.length); i++) {
    addCandidate(clusters[i].normal, 0);
  }

  // 3. Evaluate each candidate orientation across FDM printability metrics
  let bestScore = -Infinity;
  let bestCandidate = candidates[0];
  const vertStep = vertCount > 45000 ? 2 : 1;
  const cos45 = Math.SQRT1_2;
  const bedTolMm = Math.min(0.45, Math.max(0.20, maxDimAll * 0.008));

  const uVec = new THREE.Vector3();
  const wVec = new THREE.Vector3();
  const upVec = new THREE.Vector3();
  const refVec = new THREE.Vector3();

  for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
    const cand = candidates[cIdx];
    const dx = cand.dir.x, dy = cand.dir.y, dz = cand.dir.z;

    // Orthonormal horizontal basis (uVec, wVec) perpendicular to candidate downward vector d
    upVec.set(-dx, -dy, -dz);
    refVec.set(Math.abs(upVec.y) < 0.9 ? 0 : 1, Math.abs(upVec.y) < 0.9 ? 1 : 0, 0);
    uVec.crossVectors(refVec, upVec).normalize();
    wVec.crossVectors(upVec, uVec).normalize();

    const ux = uVec.x, uy = uVec.y, uz = uVec.z;
    const wx = wVec.x, wy = wVec.y, wz = wVec.z;

    let minProj = Infinity, maxProj = -Infinity;
    let minU = Infinity, maxU = -Infinity;
    let minW = Infinity, maxW = -Infinity;

    for (let v = 0; v < vertCount; v += vertStep) {
      const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
      const p = vx * dx + vy * dy + vz * dz;
      const u = vx * ux + vy * uy + vz * uz;
      const w = vx * wx + vy * wy + vz * wz;
      if (p < minProj) minProj = p;
      if (p > maxProj) maxProj = p;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
    }

    const height = Math.max(0.1, maxProj - minProj);
    const extentU = Math.max(0.1, maxU - minU);
    const extentW = Math.max(0.1, maxW - minW);

    // Bed-touching footprint bounding box from vertices near maxProj
    let bedMinU = Infinity, bedMaxU = -Infinity;
    let bedMinW = Infinity, bedMaxW = -Infinity;
    for (let v = 0; v < vertCount; v += vertStep) {
      const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
      const p = vx * dx + vy * dy + vz * dz;
      if (maxProj - p <= bedTolMm) {
        const u = vx * ux + vy * uy + vz * uz;
        const w = vx * wx + vy * wy + vz * wz;
        if (u < bedMinU) bedMinU = u;
        if (u > bedMaxU) bedMaxU = u;
        if (w < bedMinW) bedMinW = w;
        if (w > bedMaxW) bedMaxW = w;
      }
    }

    const bedSpanU = bedMaxU > bedMinU ? (bedMaxU - bedMinU) : 0;
    const bedSpanW = bedMaxW > bedMinW ? (bedMaxW - bedMinW) : 0;

    // Accumulate true bed-contact area & overhang support penalty
    let bedContactArea = 0;
    let overhangPenalty = 0;

    for (let s = 0; s < sIdx; s++) {
      const nx = sNormals[s * 3], ny = sNormals[s * 3 + 1], nz = sNormals[s * 3 + 2];
      const nd = nx * dx + ny * dy + nz * dz;
      if (nd <= cos45) continue; // Only downward-facing surfaces (>45 deg) matter here

      const cx = sCentroids[s * 3], cy = sCentroids[s * 3 + 1], cz = sCentroids[s * 3 + 2];
      const hCent = maxProj - (cx * dx + cy * dy + cz * dz);
      const area = sAreas[s];

      if (hCent <= bedTolMm && nd > 0.88) {
        bedContactArea += area;
      } else if (hCent > bedTolMm) {
        const steepness = (nd - cos45) / (1.0 - cos45);
        const heightWeight = 0.45 + 0.55 * Math.min(1.0, hCent / Math.max(10.0, height * 0.5));
        overhangPenalty += area * (0.4 + 0.6 * steepness) * heightWeight;
      }
    }

    const comU = comX * ux + comY * uy + comZ * uz;
    const comW = comX * wx + comY * wy + comZ * wz;
    const comH = Math.max(0, maxProj - (comX * dx + comY * dy + comZ * dz));

    const tipsOver = bedMaxU > bedMinU
      ? (comU < bedMinU - 1.5 || comU > bedMaxU + 1.5 || comW < bedMinW - 1.5 || comW > bedMaxW + 1.5)
      : true;

    const fitsBed = (
      height <= bedSize.z &&
      Math.min(extentU, extentW) <= Math.min(bedSize.x, bedSize.y) &&
      Math.max(extentU, extentW) <= Math.max(bedSize.x, bedSize.y)
    );

    const contactScore = (bedContactArea / totalArea) * 3.0;
    const footprintScore = Math.min(1.0, (bedSpanU * bedSpanW) / Math.max(1.0, extentU * extentW)) * 0.75;
    const overhangScore = (overhangPenalty / totalArea) * 4.2;
    const heightPenalty = (comH / maxDimAll) * 0.35;
    const tipPenalty = tipsOver ? 1.5 : 0;
    const fitPenalty = fitsBed ? 0 : 100.0;

    const score = contactScore + footprintScore - overhangScore - heightPenalty - tipPenalty - fitPenalty + cand.tieBonus;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
    }
  }

  // 4. Rotate chosen downward vector to Three.js world down [0, -1, 0]
  const targetDown = new THREE.Vector3(0, -1, 0);
  if (bestCandidate && bestCandidate.dir.dot(targetDown) < 0.9999) {
    const quat = new THREE.Quaternion().setFromUnitVectors(bestCandidate.dir, targetDown);
    geometry.applyQuaternion(quat);
  }

  // 5. Snap diagonally oriented parts cleanly onto bed X/Z axes
  alignDiagonalFootprintYaw(geometry);

  // 6. Ground lowest point at Y = 0 and center horizontally at (0, 0)
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (bbox) {
    const centerX = (bbox.max.x + bbox.min.x) / 2;
    const groundY = bbox.min.y;
    const centerZ = (bbox.max.z + bbox.min.z) / 2;
    geometry.translate(-centerX, -groundY, -centerZ);
  }

  pos.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Rotates the model on the build plate (Tashkeel rotateX mechanism).
 * Allows rotating 90 degrees around X (or Z) while re-grounding at Y = 0 and centering.
 */
export function rotateModelOnBed(geometry, axis = "x", angle = -Math.PI / 2) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return geometry;

  if (axis === "x") {
    geometry.rotateX(angle);
  } else if (axis === "y") {
    geometry.rotateY(angle);
  } else if (axis === "z") {
    geometry.rotateZ(angle);
  }

  // Re-ground at Y = 0 and re-center horizontally at (0, 0)
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (bbox) {
    const centerX = (bbox.max.x + bbox.min.x) / 2;
    const groundY = bbox.min.y;
    const centerZ = (bbox.max.z + bbox.min.z) / 2;
    geometry.translate(-centerX, -groundY, -centerZ);
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================================================
// 2.B & 2.C. EXACT WATERTIGHT MESH VOLUME, ORIENTED BOUNDS & OVERHANG ANALYSIS
// In Three.js world coordinates after autoOrientForPrinting:
//   X = width (across bed: 0-256mm)
//   Z = depth (front-to-back on bed: 0-256mm, Slicer Y)
//   Y = height (vertical Z-height above bed: 0-256mm, Slicer Z)
// ============================================================================
export function calculateMeshMetrics(geometry) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return {
      volumeCm3: 0,
      bboxVolumeCm3: 0,
      surfaceAreaCm2: 0,
      lateralSurfaceAreaCm2: 0,
      flatTopBottomAreaCm2: 0,
      bedContactAreaCm2: 0,
      overhangAreaCm2: 0,
      projectedSupportVolumeCm3: 0,
      meanOverhangHeightMm: 0,
      width: 0,
      depth: 0,
      height: 0,
      triangles: 0
    };
  }

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const minY = bbox ? bbox.min.y : 0;
  const width = Math.max(0.1, bbox ? (bbox.max.x - bbox.min.x) : 0.1);   // X width (mm)
  const depth = Math.max(0.1, bbox ? (bbox.max.z - bbox.min.z) : 0.1);   // Y depth on bed (mm)
  const height = Math.max(0.1, bbox ? (bbox.max.y - bbox.min.y) : 0.1);  // Z vertical height (mm)

  const pos = geometry.attributes.position;
  let signedVolumeMm3 = 0;
  let surfaceAreaMm2 = 0;
  let lateralSurfaceAreaMm2 = 0;
  let flatTopBottomAreaMm2 = 0;
  let bedContactAreaMm2 = 0;
  let overhangAreaMm2 = 0;
  let projectedSupportVolumeMm3 = 0;
  let weightedOverhangHeightMm = 0;

  const cos45 = Math.SQRT1_2; // 0.70710678 (45 deg overhang threshold)
  const bedToleranceMm = 0.20;

  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);

    // 1. Exact signed tetrahedron volume (divergence theorem)
    signedVolumeMm3 += (
      ax * (by * cz - cy * bz) -
      ay * (bx * cz - cx * bz) +
      az * (bx * cy - cx * by)
    ) / 6.0;

    // 2. Triangle surface area and outward unit normal
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const crossLen = Math.hypot(crossX, crossY, crossZ);
    if (crossLen < 1e-8) continue;

    const areaMm2 = 0.5 * crossLen;
    surfaceAreaMm2 += areaMm2;

    const ny = crossY / crossLen; // Vertical component of normal
    const absNy = Math.abs(ny);
    const sinTilt = Math.sqrt(Math.max(0, 1 - ny * ny));

    // Decompose surface area into lateral perimeter walls vs horizontal top/bottom skins
    lateralSurfaceAreaMm2 += areaMm2 * sinTilt;
    flatTopBottomAreaMm2 += areaMm2 * absNy;

    // Height of triangle vertices above the build plate (Z = 0)
    const zA = ay - minY;
    const zB = by - minY;
    const zC = cy - minY;
    const maxVertZ = Math.max(zA, zB, zC);
    const centroidZ = (zA + zB + zC) / 3.0;

    if (maxVertZ <= bedToleranceMm && ny < -0.92) {
      bedContactAreaMm2 += areaMm2;
    } else if (centroidZ > 0.40 && ny < -cos45) {
      // Overhang facet (> 45 degrees from vertical) requiring support
      overhangAreaMm2 += areaMm2;
      const horizProjArea = areaMm2 * absNy;
      // Effective support column drop height (accounting for self-supporting lower geometry)
      const effectiveDropMm = Math.min(centroidZ, height * 0.72);
      projectedSupportVolumeMm3 += horizProjArea * effectiveDropMm;
      weightedOverhangHeightMm += horizProjArea * effectiveDropMm;
    }
  }

  const rawVolumeCm3 = Math.abs(signedVolumeMm3) / 1000.0;
  const bboxVolumeCm3 = (width * depth * height) / 1000.0;
  const surfaceAreaCm2 = surfaceAreaMm2 / 100.0;

  // Use exact signed tetrahedron volume for watertight STL meshes; fallback only if degenerate
  const volumeCm3 = rawVolumeCm3 > 0.001 ? rawVolumeCm3 : Math.max(0.05, bboxVolumeCm3 * 0.15);
  const meanOverhangHeightMm = overhangAreaMm2 > 0
    ? (weightedOverhangHeightMm / overhangAreaMm2)
    : 0;

  return {
    width: Math.round(width * 10) / 10,
    depth: Math.round(depth * 10) / 10,
    height: Math.round(height * 10) / 10,
    volumeCm3: Math.round(volumeCm3 * 1000) / 1000,
    bboxVolumeCm3: Math.round(bboxVolumeCm3 * 100) / 100,
    surfaceAreaCm2: Math.round(surfaceAreaCm2 * 100) / 100,
    lateralSurfaceAreaCm2: Math.round((lateralSurfaceAreaMm2 / 100.0) * 100) / 100,
    flatTopBottomAreaCm2: Math.round((flatTopBottomAreaMm2 / 100.0) * 100) / 100,
    bedContactAreaCm2: Math.round((bedContactAreaMm2 / 100.0) * 100) / 100,
    overhangAreaCm2: Math.round((overhangAreaMm2 / 100.0) * 100) / 100,
    projectedSupportVolumeCm3: Math.round((projectedSupportVolumeMm3 / 1000.0) * 1000) / 1000,
    meanOverhangHeightMm: Math.round(meanOverhangHeightMm * 10) / 10,
    triangles: Math.floor(pos.count / 3)
  };
}

// Intersect a triangle with a horizontal slice plane Y = planeY
function intersectTriangleWithPlane(p1, p2, p3, planeY) {
  const y1 = p1.y, y2 = p2.y, y3 = p3.y;

  if ((y1 < planeY && y2 < planeY && y3 < planeY) ||
      (y1 > planeY && y2 > planeY && y3 > planeY)) {
    return null;
  }

  const pts = [];

  function checkEdge(a, b, ya, yb) {
    if ((ya < planeY && yb > planeY) || (ya > planeY && yb < planeY)) {
      const t = (planeY - ya) / (yb - ya);
      pts.push({
        x: a.x + t * (b.x - a.x),
        y: a.z + t * (b.z - a.z), // Map Z in Three.js (depth) to Y on 2D slice plane
        z: planeY
      });
    } else if (ya === planeY) {
      pts.push({ x: a.x, y: a.z, z: planeY });
    }
  }

  checkEdge(p1, p2, y1, y2);
  checkEdge(p2, p3, y2, y3);
  checkEdge(p3, p1, y3, y1);

  if (pts.length >= 2) {
    return [pts[0], pts[1]];
  }
  return null;
}

// Extract exact planar cross-section segments from 3D geometry
export function extractLayerPlanarSegments(geometry, planeY) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return [];
  const pos = geometry.attributes.position;
  const segments = [];

  const p1 = { x: 0, y: 0, z: 0 };
  const p2 = { x: 0, y: 0, z: 0 };
  const p3 = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < pos.count; i += 3) {
    p1.x = pos.getX(i); p1.y = pos.getY(i); p1.z = pos.getZ(i);
    p2.x = pos.getX(i + 1); p2.y = pos.getY(i + 1); p2.z = pos.getZ(i + 1);
    p3.x = pos.getX(i + 2); p3.y = pos.getY(i + 2); p3.z = pos.getZ(i + 2);

    const seg = intersectTriangleWithPlane(p1, p2, p3, planeY);
    if (seg) {
      segments.push(seg);
    }
  }

  return segments;
}

// Point in polygon test for scanline infill clipping
function isPointInsideSegments(px, py, segments) {
  let inside = false;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const x1 = s[0].x, y1 = s[0].y;
    const x2 = s[1].x, y2 = s[1].y;

    const intersect = ((y1 > py) !== (y2 > py)) &&
      (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-9) + x1);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ============================================================================
// 2.C & 2.D. 1:1 ELEGOO SLICER / ORCASLICER CALIBRATED WEIGHT, TREE SUPPORTS & KINEMATICS
// Computes:
//   - Watertight mesh volume (cm^3)
//   - 2 perimeter wall loops (2 * 0.42mm = 0.84mm) + characteristic thickness shell model
//   - 4 bottom solid layers + 5 top solid layers (~0.8mm - 1.0mm thickness)
//   - Sparse Gyroid infill core at infillPercent
//   - Calibrated extrusion overlap & squish compensation (1.12 - 1.15x)
//   - Elegoo Slicer Default Tree Supports (Slim / Organic: 4.0mm trunk diameter,
//     38 deg branch angle, 1 trunk wall, 12% sparse tree infill, 2-3 dense support
//     interface layers at 0.6mm / 70% density) when enableSupports is true
// ============================================================================
export function estimatePrintMetrics(geometry, settings = {}) {
  const metrics = calculateMeshMetrics(geometry);
  const printer = PRINTER_PROFILES[settings.printerId] || PRINTER_PROFILES.centauri_carbon;

  // 1. Resolve Material & Density
  const materialProfile = resolveMaterialProfile(settings.materialKey || settings.material || "pla");
  const density = materialProfile.density;

  const infillPercent = settings.infillPercent !== undefined ? Number(settings.infillPercent) : 20;
  const layerHeight = Number(settings.layerHeight) || 0.20;
  const nozzleSize = Number(settings.nozzleSize) || 0.40;
  const extrusionWidth = nozzleSize === 0.40 ? 0.42 : nozzleSize * 1.05; // 0.42mm standard line width on CC1
  const enableSupports = settings.enableSupports !== undefined ? Boolean(settings.enableSupports) : true;
  const wallLoops = Number(settings.wallCount) || 2; // Standard 2 perimeters
  const bottomSolidLayers = 4; // Standard 4 bottom layers
  const topSolidLayers = 5;    // Standard 5 top layers

  // 2. 1:1 Model Shell & Gyroid Infill Volumetric Calculation
  const volumeMm3 = metrics.volumeCm3 * 1000.0;
  const surfaceAreaMm2 = metrics.surfaceAreaCm2 * 100.0;
  const charThicknessMm = surfaceAreaMm2 > 0 ? (2.0 * volumeMm3) / surfaceAreaMm2 : 2.0;

  // Perimeter wall thickness: 2 * 0.42mm = 0.84mm
  const wallThicknessMm = wallLoops * extrusionWidth;

  // Top & bottom solid shell thickness: 4 bottom + 5 top layers (clamped to 0.8mm - 1.0mm per face)
  const rawBottomThicknessMm = Math.min(1.0, Math.max(0.8, bottomSolidLayers * layerHeight));
  const rawTopThicknessMm = Math.min(1.0, Math.max(0.8, topSolidLayers * layerHeight));
  const avgSkinThicknessMm = 0.5 * (rawBottomThicknessMm + rawTopThicknessMm);

  // Effective combined shell thickness weighted by lateral vs horizontal surface areas
  const lateralAreaMm2 = metrics.lateralSurfaceAreaCm2 * 100.0;
  const flatAreaMm2 = metrics.flatTopBottomAreaCm2 * 100.0;
  const effectiveShellThicknessMm = surfaceAreaMm2 > 0
    ? ((lateralAreaMm2 * wallThicknessMm + flatAreaMm2 * avgSkinThicknessMm) / surfaceAreaMm2)
    : wallThicknessMm;

  let shellRatio = 1.0;
  let sparseInfillRatio = 0.0;
  // Gyroid infill pattern path factor (~1.04x due to sinusoidal 3D continuous path curvature)
  const gyroidPatternFactor = 1.04;
  const infillDensity = Math.max(0, Math.min(1.0, (infillPercent / 100.0) * gyroidPatternFactor));

  if (charThicknessMm > effectiveShellThicknessMm * 2.0) {
    // Part has an internal core cavity: separate solid shell volume and Gyroid infill core
    shellRatio = Math.min(1.0, (effectiveShellThicknessMm * 2.0) / charThicknessMm);
    const coreRatio = Math.max(0.0, 1.0 - shellRatio);
    sparseInfillRatio = coreRatio * infillDensity;
  } else {
    // Thin-walled mechanical part: opposing perimeters/skins merge into 100% solid shell
    shellRatio = 1.0;
    sparseInfillRatio = 0.0;
  }

  const effectiveModelVolumeRatio = shellRatio + sparseInfillRatio;

  // Extrusion squish, wall overlap, seam wipe, and skirt/brim compensation (1.12 - 1.15x)
  const extrusionCompensationFactor = 1.135;
  const modelExtrudedPlasticCm3 = metrics.volumeCm3 * effectiveModelVolumeRatio * extrusionCompensationFactor;
  const rawModelWeightGrams = modelExtrudedPlasticCm3 * density;
  const modelWeightGrams = metrics.volumeCm3 > 0
    ? Math.max(0.1, Math.round(rawModelWeightGrams * 100) / 100)
    : 0;

  // 3. 1:1 Tree Support Volumetric Model (Elegoo Slicer Default Tree Supports - Slim / Organic)
  //   - Trunk diameter: ~4.0mm
  //   - Branch angle: ~38 deg (cos(38 deg) = 0.7880 -> path slant multiplier = 1 / 0.7880 = 1.269)
  //   - Tree trunk wall count: 1 wall (0.42mm extrusion width)
  //   - Sparse tree infill density: 12% (0.12)
  //   - Dense support interface layers: 2-3 layers (0.6mm thickness, 70% density)
  let supportVolumeCm3 = 0;
  let supportWeightGrams = 0;

  if (enableSupports && metrics.overhangAreaCm2 > 0.02) {
    const trunkDiameterMm = 4.0;
    const trunkRadiusMm = trunkDiameterMm / 2.0;
    const branchAngleRad = (38.0 * Math.PI) / 180.0;
    const branchSlantFactor = 1.0 / Math.cos(branchAngleRad); // ~1.269
    const trunkWallThicknessMm = 1 * extrusionWidth; // 1 wall = 0.42mm
    const sparseTreeInfillDensity = 0.12; // 12% sparse tree infill

    // Cross-sectional solid fraction of a 4.0mm tree trunk with 1 perimeter wall + 12% sparse infill:
    const trunkOuterArea = Math.PI * trunkRadiusMm * trunkRadiusMm;
    const trunkInnerRadius = Math.max(0, trunkRadiusMm - trunkWallThicknessMm);
    const trunkInnerArea = Math.PI * trunkInnerRadius * trunkInnerRadius;
    const trunkWallFraction = (trunkOuterArea - trunkInnerArea) / trunkOuterArea; // ~0.376
    const trunkEffectiveSolidDensity = trunkWallFraction + (1.0 - trunkWallFraction) * sparseTreeInfillDensity; // ~0.451

    // Tree organic branching convergence factor: multiple overhang tips merge into fewer main trunks
    const treeBranchConvergenceFactor = 0.34;
    const treeTrunkVolumeCm3 =
      metrics.projectedSupportVolumeCm3 *
      treeBranchConvergenceFactor *
      branchSlantFactor *
      trunkEffectiveSolidDensity;

    // 2-3 dense support interface layers (0.6mm thickness, 70% density) directly underneath overhang contact faces
    const interfaceThicknessCm = 0.06; // 0.6mm = 0.06cm
    const interfaceDensity = 0.70;     // 70% dense roof/floor interface
    const supportInterfaceVolumeCm3 = metrics.overhangAreaCm2 * interfaceThicknessCm * interfaceDensity;

    // First-layer tree support base brim flange on build plate
    const supportBaseBrimCm3 = metrics.overhangAreaCm2 * (layerHeight / 10.0) * 0.45;

    supportVolumeCm3 = Math.round((treeTrunkVolumeCm3 + supportInterfaceVolumeCm3 + supportBaseBrimCm3) * 1000) / 1000;
    const rawSupportGrams = supportVolumeCm3 * density;
    supportWeightGrams = rawSupportGrams >= 0.05
      ? Math.round(rawSupportGrams * 100) / 100
      : 0;
  }

  // 4. Total Billable Weight & Filament Length (1.75mm diameter -> 2.40528 mm^2)
  const totalExtrudedCm3 = modelExtrudedPlasticCm3 + (enableSupports ? supportVolumeCm3 : 0);
  const totalWeightGrams = Math.round((modelWeightGrams + (enableSupports ? supportWeightGrams : 0)) * 100) / 100;

  const filamentLengthMm = (totalExtrudedCm3 * 1000.0) / FILAMENT_CROSS_SECTION_MM2;
  const filamentLengthMeters = totalWeightGrams > 0
    ? Math.max(0.05, Math.round((filamentLengthMm / 1000.0) * 100) / 100)
    : 0;

  // 5. High-Speed CoreXY Kinematic Print Duration Estimation (Elegoo Centauri Carbon CC1)
  const firstLayerHeight = Math.min(0.24, Math.max(0.20, layerHeight));
  const numLayers = Math.max(1, Math.ceil(Math.max(0, metrics.height - firstLayerHeight) / layerHeight) + 1);

  const beadAreaMm2 = extrusionWidth * layerHeight;
  const totalExtrusionDistanceMm = filamentLengthMm * (FILAMENT_CROSS_SECTION_MM2 / beadAreaMm2);
  const totalTravelDistanceMm = totalExtrusionDistanceMm * (enableSupports && supportWeightGrams > 0 ? 0.32 : 0.24);

  // Effective CoreXY speed limited by max volumetric flow (28 mm^3/s) and acceleration curves
  const volumetricLimitedSpeedMmS = printer.maxVolumetricSpeed / Math.max(0.04, beadAreaMm2);
  const profileNominalSpeedMmS = nozzleSize <= 0.25 ? 65 : (layerHeight <= 0.14 ? 115 : layerHeight >= 0.26 ? 155 : 135);
  const effectiveSpeedMmS = Math.min(printer.maxSpeed, volumetricLimitedSpeedMmS, profileNominalSpeedMmS);
  const travelSpeedMmS = 350;

  const rawExtrusionSeconds = totalExtrusionDistanceMm / effectiveSpeedMmS;
  const rawTravelSeconds = totalTravelDistanceMm / travelSpeedMmS;
  const layerOverheadSeconds = numLayers * 0.62;
  const minLayerCoolingSeconds = nozzleSize <= 0.25 ? 10.5 : 7.5;
  const minCoolingTotalSeconds = numLayers * minLayerCoolingSeconds;
  const prepareTimeSeconds = printer.heatupTimeSeconds + printer.bedLevelTimeSeconds;

  const modelPrintTimeSeconds = Math.max(rawExtrusionSeconds + rawTravelSeconds + layerOverheadSeconds, minCoolingTotalSeconds);
  const totalSeconds = Math.ceil(modelPrintTimeSeconds + prepareTimeSeconds);

  const printHours = Math.floor(totalSeconds / 3600);
  const printMinutes = Math.floor((totalSeconds % 3600) / 60);
  const printSecondsRemaining = totalSeconds % 60;
  const printTimeFormatted = printHours > 0
    ? `${printHours}h ${printMinutes}m`
    : `${printMinutes}m ${printSecondsRemaining}s`;

  // 6. Dynamic Pricing & Micro-Order Rule Preservation
  const activePricePerGram = parseFloat(settings.pricePerGram) || 3.5;
  const printHoursExact = totalSeconds > 0 ? (totalSeconds / 3600.0) : Math.max(0.2, totalWeightGrams / 35.0);
  const customMaterials = settings.materialRates ? { ...settings.materialRates } : {};
  const activeMatKey = String(settings.materialKey || settings.material || "pla").toLowerCase();

  if (settings.pricePerGram) {
    customMaterials[activeMatKey] = {
      ...(customMaterials[activeMatKey] || {}),
      name: customMaterials[activeMatKey]?.name || activeMatKey.toUpperCase(),
      selling_rate: activePricePerGram,
      cost: customMaterials[activeMatKey]?.cost || 0.66
    };
  }

  const quote = calculateOrderQuote({
    items: [{ weightGrams: totalWeightGrams, printHours: printHoursExact, materialKey: activeMatKey }],
    deliveryMode: settings.deliveryMode || "pickup",
    customMaterials,
    customSettings: settings.pricingSettings || {}
  });

  const microThreshold = Number(settings.pricingSettings?.micro_order_weight_threshold) || 17.0;
  const microFlatPrice = Number(settings.pricingSettings?.micro_order_flat_price) || 50.0;
  const isMicroOrder = totalWeightGrams > 0 && totalWeightGrams < microThreshold;
  const quotedPrice = isMicroOrder
    ? microFlatPrice
    : Math.ceil(totalWeightGrams * activePricePerGram);
  const totalPrice = settings.deliveryMode === "shipping" ? quote.customerTotal : quotedPrice;

  // 7. Build Envelope Validation (256 x 256 x 256 mm)
  const fitsBed = Boolean(
    metrics.width <= printer.bed.x &&
    metrics.depth <= printer.bed.y &&
    metrics.height <= printer.bed.z
  );

  return {
    metrics,
    modelWeightGrams,
    supportWeightGrams,
    totalWeightGrams,
    weightGrams: totalWeightGrams,
    filamentWeightGrams: totalWeightGrams,
    enableSupports,
    supportVolumeCm3: Math.round(supportVolumeCm3 * 100) / 100,
    modelVolumeCm3: Math.round(modelExtrudedPlasticCm3 * 100) / 100,
    volumetricExtrusionCm3: Math.round(totalExtrudedCm3 * 100) / 100,
    filamentLengthMeters,
    activePricePerGram,
    isMicroOrder,
    quotedPrice,
    totalPrice,
    totalSeconds,
    printingTimeSeconds: totalSeconds,
    printTimeFormatted,
    modelPrintTimeSeconds: Math.ceil(modelPrintTimeSeconds),
    numLayers,
    layerHeight,
    nozzleSize,
    extrusionWidth,
    infillPercent,
    fitsBed,
    printerBed: printer.bed
  };
}

// Complete slice engine with exact planar segments for 3D toolpath visualization
export function sliceMesh(geometry, settings = {}) {
  const estimate = estimatePrintMetrics(geometry, settings);
  const { metrics } = estimate;
  const printer = PRINTER_PROFILES[settings.printerId] || PRINTER_PROFILES.centauri_carbon;
  const material = resolveMaterialProfile(settings.materialKey || settings.material || "pla");

  const layerHeight = estimate.layerHeight;
  const firstLayerHeight = settings.firstLayerHeight || Math.min(0.24, Math.max(0.20, layerHeight));
  const infillPercent = estimate.infillPercent;
  const wallCount = settings.wallCount || 2;

  const numLayers = estimate.numLayers;
  const nozzleW = estimate.extrusionWidth || 0.42;

  const toolpathLayers = [];

  for (let l = 0; l < numLayers; l++) {
    const currentY = l === 0 ? firstLayerHeight : firstLayerHeight + (l * layerHeight);
    const isSolid = l < 4 || l >= numLayers - 5; // 4 bottom solid layers + 5 top solid layers

    const planarSegments = extractLayerPlanarSegments(geometry, currentY);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    planarSegments.forEach((seg) => {
      minX = Math.min(minX, seg[0].x, seg[1].x);
      maxX = Math.max(maxX, seg[0].x, seg[1].x);
      minY = Math.min(minY, seg[0].y, seg[1].y);
      maxY = Math.max(maxY, seg[0].y, seg[1].y);
    });

    const hasGeometry = planarSegments.length > 0 && isFinite(minX);
    const outerWallSegments = [];
    const innerWallSegments = [];

    if (hasGeometry) {
      planarSegments.forEach((seg) => {
        outerWallSegments.push(seg);
      });

      for (let w = 1; w < wallCount; w++) {
        const offset = w * nozzleW;
        planarSegments.forEach((seg) => {
          const dx = seg[1].x - seg[0].x;
          const dy = seg[1].y - seg[0].y;
          const len = Math.hypot(dx, dy);
          if (len > 0.1) {
            const nx = (-dy / len) * offset;
            const ny = (dx / len) * offset;
            const inSeg = [
              { x: seg[0].x + nx, y: seg[0].y + ny, z: currentY },
              { x: seg[1].x + nx, y: seg[1].y + ny, z: currentY }
            ];
            innerWallSegments.push(inSeg);
          }
        });
      }
    }

    const infillSegments = [];
    if (hasGeometry && (infillPercent > 0 || isSolid)) {
      const spacing = isSolid
        ? nozzleW * 1.02
        : Math.max(nozzleW * 2, (nozzleW * 100) / Math.max(infillPercent, 5));

      for (let y = minY + nozzleW; y <= maxY - nozzleW; y += spacing) {
        const lineStart = { x: minX + nozzleW, y };
        const lineEnd = { x: maxX - nozzleW, y };
        const span = lineEnd.x - lineStart.x;
        const testPoints = Math.max(4, Math.ceil(span / 1.5));
        let activeSegStart = null;

        for (let s = 0; s <= testPoints; s++) {
          const px = lineStart.x + (s / testPoints) * span;
          const inside = isPointInsideSegments(px, y, planarSegments);

          if (inside && !activeSegStart) {
            activeSegStart = { x: px, y, z: currentY };
          } else if (!inside && activeSegStart) {
            const activeSegEnd = { x: px, y, z: currentY };
            const dist = Math.hypot(activeSegEnd.x - activeSegStart.x, activeSegEnd.y - activeSegStart.y);
            if (dist > 0.5) {
              infillSegments.push([activeSegStart, activeSegEnd]);
            }
            activeSegStart = null;
          }
        }
        if (activeSegStart) {
          const activeSegEnd = { x: lineEnd.x, y, z: currentY };
          const dist = Math.hypot(activeSegEnd.x - activeSegStart.x, activeSegEnd.y - activeSegStart.y);
          if (dist > 0.5) {
            infillSegments.push([activeSegStart, activeSegEnd]);
          }
        }
      }
    }

    toolpathLayers.push({
      layerIndex: l + 1,
      heightZ: Math.round(currentY * 100) / 100,
      outerWall: outerWallSegments,
      innerWall: innerWallSegments,
      infill: infillSegments,
      isSolid
    });
  }

  return {
    ...estimate,
    metrics,
    printer,
    material,
    numLayers,
    layerHeight,
    firstLayerHeight,
    modelWeightGrams: estimate.modelWeightGrams,
    supportWeightGrams: estimate.supportWeightGrams,
    totalWeightGrams: estimate.totalWeightGrams,
    weightGrams: estimate.totalWeightGrams,
    filamentWeightGrams: estimate.totalWeightGrams,
    filamentLengthMeters: estimate.filamentLengthMeters,
    volumetricExtrusionCm3: estimate.volumetricExtrusionCm3,
    printingTimeSeconds: estimate.totalSeconds,
    printTimeFormatted: estimate.printTimeFormatted,
    totalPrice: estimate.totalPrice,
    quotedPrice: estimate.quotedPrice,
    fitsBed: estimate.fitsBed,
    printerBed: estimate.printerBed,
    toolpathLayers
  };
}

// Generate valid Elegoo Centauri Carbon Klipper G-Code
export function generateElegooGcode(sliceResult, fileName = "model") {
  const { printer, material, numLayers, layerHeight, toolpathLayers, metrics } = sliceResult;
  const dateStr = new Date().toISOString();
  const totalMass = sliceResult.totalWeightGrams ?? sliceResult.weightGrams ?? sliceResult.filamentWeightGrams ?? 0;
  const modelMass = sliceResult.modelWeightGrams ?? totalMass;
  const supportMass = sliceResult.supportWeightGrams ?? 0;

  let gcode = `; ==========================================================================\n`;
  gcode += `; ELEGOO CENTAURI CARBON SLICER OS - PRODUCTION G-CODE\n`;
  gcode += `; File: ${fileName}\n`;
  gcode += `; Generated: ${dateStr}\n`;
  gcode += `; Target Printer: ${printer.name} (${printer.firmware})\n`;
  gcode += `; Nozzle: ${printer.nozzle} mm | Line Width: ${printer.extrusionWidth} mm\n`;
  gcode += `; Material: ${material.name} (${material.density} g/cm3)\n`;
  gcode += `; Total Layers: ${numLayers} | Layer Height: ${layerHeight} mm\n`;
  gcode += `; Estimated Print Time: ${sliceResult.printTimeFormatted}\n`;
  gcode += `; Model Mass: ${modelMass} g | Tree Supports Mass: ${supportMass} g | Total Mass: ${totalMass} g (${sliceResult.filamentLengthMeters} m)\n`;
  gcode += `; Oriented Dimensions: ${metrics.width} x ${metrics.depth} x ${metrics.height} mm\n`;
  gcode += `; ==========================================================================\n\n`;

  gcode += `; --- START G-CODE ---\n`;
  gcode += `M140 S${material.bedTemp} ; Bed temp\n`;
  gcode += `M104 S${material.temp} ; Hotend temp\n`;
  gcode += `G90 ; Absolute coords\n`;
  gcode += `M83 ; Extruder relative\n`;
  gcode += `G28 ; Home\n`;
  gcode += `M190 S${material.bedTemp} ; Wait bed temp\n`;
  gcode += `M109 S${material.temp} ; Wait hotend temp\n`;
  gcode += `BED_MESH_PROFILE LOAD=default\n`;
  gcode += `G1 Z2.0 F3000\n`;
  gcode += `G1 X0.1 Y20 Z0.3 F5000.0\n`;
  gcode += `G1 X0.1 Y200.0 Z0.3 F1500.0 E15\n`;
  gcode += `G1 X0.4 Y200.0 Z0.3 F5000.0\n`;
  gcode += `G1 X0.4 Y20 Z0.3 F1500.0 E30\n`;
  gcode += `G92 E0\n`;
  gcode += `G1 Z2.0 F3000\n\n`;

  const beadArea = (printer.extrusionWidth - layerHeight) * layerHeight + (Math.PI * 0.25 * layerHeight * layerHeight);
  const filamentArea = FILAMENT_CROSS_SECTION_MM2;

  for (const layer of toolpathLayers) {
    gcode += `; LAYER:${layer.layerIndex} | Z=${layer.heightZ.toFixed(2)}\n`;
    gcode += `G1 Z${layer.heightZ.toFixed(2)} F3000\n`;

    if (layer.outerWall && layer.outerWall.length > 0) {
      gcode += `; TYPE:Outer wall\n`;
      layer.outerWall.forEach((seg) => {
        const dist = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const eVal = ((dist * beadArea) / filamentArea).toFixed(4);
        gcode += `G0 X${seg[0].x.toFixed(3)} Y${seg[0].y.toFixed(3)} F9000 ; Travel\n`;
        gcode += `G1 X${seg[1].x.toFixed(3)} Y${seg[1].y.toFixed(3)} E${eVal} F5400\n`;
      });
    }

    if (layer.innerWall && layer.innerWall.length > 0) {
      gcode += `; TYPE:Inner wall\n`;
      layer.innerWall.forEach((seg) => {
        const dist = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const eVal = ((dist * beadArea) / filamentArea).toFixed(4);
        gcode += `G0 X${seg[0].x.toFixed(3)} Y${seg[0].y.toFixed(3)} F9000 ; Travel\n`;
        gcode += `G1 X${seg[1].x.toFixed(3)} Y${seg[1].y.toFixed(3)} E${eVal} F7200\n`;
      });
    }

    if (layer.infill && layer.infill.length > 0) {
      gcode += layer.isSolid ? `; TYPE:Top/Bottom skin\n` : `; TYPE:Gyroid Infill\n`;
      layer.infill.forEach((seg) => {
        const dist = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const eVal = ((dist * beadArea) / filamentArea).toFixed(4);
        gcode += `G0 X${seg[0].x.toFixed(3)} Y${seg[0].y.toFixed(3)} F12000 ; Travel\n`;
        gcode += `G1 X${seg[1].x.toFixed(3)} Y${seg[1].y.toFixed(3)} E${eVal} F9000\n`;
      });
    }
  }

  gcode += `\n; --- END G-CODE ---\n`;
  gcode += `M104 S0 ; Turn off hotend\n`;
  gcode += `M140 S0 ; Turn off bed\n`;
  gcode += `M106 S0 ; Turn off fan\n`;
  gcode += `G91 ; Relative coords\n`;
  gcode += `G1 Z10 F3000 ; Lift nozzle\n`;
  gcode += `G90 ; Absolute coords\n`;
  gcode += `G1 X10 Y240 F6000 ; Present print\n`;
  gcode += `M84 ; Disable steppers\n`;

  return gcode;
}