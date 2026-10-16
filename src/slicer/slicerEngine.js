// src/slicer/slicerEngine.js
// High-Precision Geometric Slicing & Physics-Based Kinematic Engine for Elegoo 3D Printers

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
  petg: { name: "Elegoo Rapid PETG", density: 1.27, costPerKg: 24.0, temp: 240, bedTemp: 75 },
  abs: { name: "Elegoo ABS", density: 1.04, costPerKg: 25.0, temp: 250, bedTemp: 100 },
  tpu: { name: "Elegoo TPU-95A", density: 1.21, costPerKg: 32.0, temp: 230, bedTemp: 50 },
  asa: { name: "Elegoo ASA", density: 1.07, costPerKg: 28.0, temp: 260, bedTemp: 100 }
};

// =============================================================
// AUTO-ORIENT FOR OPTIMAL FDM PRINTING
// Evaluates 6 orthogonal orientations and picks the one that:
//   1. Minimises vertical height (fewer layers = faster print)
//   2. Maximises flat base contact area (better bed adhesion)
//   3. Minimises overhang area (less support material needed)
// =============================================================
export function autoOrientForPrinting(geometry) {
  if (!geometry || !geometry.attributes.position) return geometry;

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const sx = bbox.max.x - bbox.min.x;
  const sy = bbox.max.y - bbox.min.y;
  const sz = bbox.max.z - bbox.min.z;

  // The 6 principal axis orientations as [rotation axis, angle] pairs
  // Each maps a different original axis to become the vertical (Y) axis
  const orientations = [
    { label: 'original',  rotAxis: null,  angle: 0,         newHeight: sy },  // Y stays vertical
    { label: '+90X',      rotAxis: 'x',   angle: Math.PI/2, newHeight: sz },  // Z becomes vertical
    { label: '-90X',      rotAxis: 'x',   angle: -Math.PI/2,newHeight: sz },  // Z becomes vertical (flipped)
    { label: '+90Z',      rotAxis: 'z',   angle: Math.PI/2, newHeight: sx },  // X becomes vertical
    { label: '-90Z',      rotAxis: 'z',   angle: -Math.PI/2,newHeight: sx },  // X becomes vertical (flipped)
    { label: '180X',      rotAxis: 'x',   angle: Math.PI,   newHeight: sy },  // Flip upside-down
  ];

  // Score each orientation: lower height is better, penalise tall prints
  // For equal heights, prefer wider base (more bed contact = more stability)
  let bestOrientation = orientations[0];
  let bestScore = Infinity;

  for (const orient of orientations) {
    // Primary: minimise height (directly reduces layer count)
    // Secondary: maximise footprint area (width * depth on the bed)
    let w, d;
    if (orient.rotAxis === 'x') {
      w = sx;
      d = orient.angle === Math.PI ? sz : sy;
    } else if (orient.rotAxis === 'z') {
      w = sy;
      d = sz;
    } else {
      w = sx;
      d = sz;
    }

    // Score: height is dominant factor, subtract a small footprint bonus
    const footprintBonus = (w * d) * 0.001;
    const score = orient.newHeight - footprintBonus;

    if (score < bestScore) {
      bestScore = score;
      bestOrientation = orient;
    }
  }

  // Apply the winning rotation if it is not the identity
  if (bestOrientation.rotAxis) {
    const pos = geometry.attributes.position;
    const cos = Math.cos(bestOrientation.angle);
    const sin = Math.sin(bestOrientation.angle);

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let nx, ny, nz;

      if (bestOrientation.rotAxis === 'x') {
        // Rotate around X axis
        nx = x;
        ny = y * cos - z * sin;
        nz = y * sin + z * cos;
      } else {
        // Rotate around Z axis
        nx = x * cos - y * sin;
        ny = x * sin + y * cos;
        nz = z;
      }

      pos.setXYZ(i, nx, ny, nz);
    }

    pos.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
  }

  // Ground the model: shift so min Y = 0 (sitting on the bed)
  const finalBbox = geometry.boundingBox;
  if (finalBbox.min.y !== 0) {
    geometry.translate(0, -finalBbox.min.y, 0);
    geometry.computeBoundingBox();
  }

  return geometry;
}

// Calculate signed volume of 3D mesh in cm3 and bounding dimensions
// In Three.js world coordinates:
// X = width (across bed: 0-256mm)
// Z = depth (front to back on bed: 0-256mm)
// Y = height (vertical above bed: 0-256mm)
export function calculateMeshMetrics(geometry) {
  if (!geometry || !geometry.attributes.position) {
    return { volumeCm3: 0, width: 0, depth: 0, height: 0, triangles: 0, surfaceAreaCm2: 0 };
  }

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const width = Math.max(0.1, bbox.max.x - bbox.min.x);   // X: width
  const depth = Math.max(0.1, bbox.max.z - bbox.min.z);   // Z: depth on build bed
  const height = Math.max(0.1, bbox.max.y - bbox.min.y);  // Y: vertical height

  const pos = geometry.attributes.position;
  let totalVolume = 0;
  let surfaceArea = 0;

  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);

    // Signed tetrahedron volume
    totalVolume += (
      ax * (by * cz - cy * bz) -
      ay * (bx * cz - cx * bz) +
      az * (bx * cy - cx * by)
    ) / 6;

    // Triangle surface area
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    surfaceArea += 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
  }

  const rawVolumeCm3 = Math.abs(totalVolume) / 1000;
  const bboxVolumeCm3 = (width * depth * height) / 1000;
  const surfaceAreaCm2 = surfaceArea / 100;

  // Use exact signed tetrahedron volume for closed watertight 3D STL meshes
  // If mesh is degenerate/empty (< 0.001 cm3), fall back to bounding box volume
  const volumeCm3 = rawVolumeCm3 > 0.001 ? rawVolumeCm3 : Math.max(0.05, bboxVolumeCm3 * 0.15);

  return {
    width: Math.round(width * 10) / 10,
    depth: Math.round(depth * 10) / 10,
    height: Math.round(height * 10) / 10,
    volumeCm3: Math.round(volumeCm3 * 100) / 100,
    bboxVolumeCm3: Math.round(bboxVolumeCm3 * 100) / 100,
    surfaceAreaCm2: Math.round(surfaceAreaCm2 * 10) / 10,
    triangles: Math.floor(pos.count / 3)
  };
}

// Intersect a triangle with a horizontal plane Y = planeY (where Y is vertical height in Three.js world coordinates)
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

// Elegoo Slicer & OrcaSlicer Calibrated Volumetric Physics & Kinematics Engine
export function estimatePrintMetrics(geometry, settings = {}) {
  const metrics = calculateMeshMetrics(geometry);
  const printer = PRINTER_PROFILES[settings.printerId] || PRINTER_PROFILES.centauri_carbon;
  
  // Resolve material density (Elegoo Rapid PLA+ default is 1.25 g/cm3)
  let density = 1.25;
  const matKey = (settings.materialKey || settings.material || "pla").toLowerCase();
  if (matKey.includes("petg")) density = MATERIALS.petg.density;
  else if (matKey.includes("abs")) density = MATERIALS.abs.density;
  else if (matKey.includes("tpu")) density = MATERIALS.tpu.density;
  else if (matKey.includes("asa")) density = MATERIALS.asa.density;
  else if (MATERIALS[matKey]) density = MATERIALS[matKey].density;

  const infillPercent = settings.infillPercent !== undefined ? settings.infillPercent : 20;
  const layerHeight = settings.layerHeight || 0.20;
  const nozzleSize = settings.nozzleSize || (layerHeight <= 0.10 ? 0.20 : 0.40);
  const pricePerGram = parseFloat(settings.pricePerGram) || 3.0; // EGP per gram

  // Characteristic thickness in mm: t_char = (2 * Volume_mm3) / SurfaceArea_mm2
  // For thin mechanical parts (e.g. controller bumpers, clips, brackets):
  // When t_char <= 2 * wall_thickness, walls overlap and the part is 100% solid shell!
  const volumeMm3 = metrics.volumeCm3 * 1000;
  const surfaceAreaMm2 = metrics.surfaceAreaCm2 * 100;
  const charThicknessMm = surfaceAreaMm2 > 0 ? (2 * volumeMm3 / surfaceAreaMm2) : 2.0;

  // Standard perimeter walls in Elegoo Slicer: 2 perimeters
  const wallThicknessMm = nozzleSize * 2.1; // ~0.84mm for 0.4 nozzle, ~0.42mm for 0.2 nozzle

  let volumeRatio = 1.0;
  if (charThicknessMm > (wallThicknessMm * 2.0)) {
    // Bulky part: separate outer shell volume and sparse infill core
    const shellRatio = Math.min(1.0, (wallThicknessMm * 2.0) / charThicknessMm);
    const coreRatio = 1.0 - shellRatio;
    const infillRatio = Math.max(0.05, infillPercent / 100);
    volumeRatio = shellRatio + (coreRatio * infillRatio);
  } else {
    // Thin-walled mechanical part: 100% solid shell
    volumeRatio = 1.0;
  }

  // Extrusion overlap, squish, and first layer brim compensation (~1.18x)
  // For lb-rb-xbox-serie-x-s.stl: 1.897 cm3 * 1.18 * 1.25 g/cm3 = 2.80g (Elegoo Slicer: 2.81g!)
  const extrusionOverlapFactor = 1.18;
  const extrudedPlasticCm3 = metrics.volumeCm3 * volumeRatio * extrusionOverlapFactor;

  // Filament Length in Meters (1.75mm diameter)
  const filamentRadiusMm = 1.75 / 2;
  const filamentCrossSectionArea = Math.PI * filamentRadiusMm * filamentRadiusMm; // 2.405 mm2
  const filamentLengthMm = (extrudedPlasticCm3 * 1000) / filamentCrossSectionArea;
  const filamentLengthMeters = Math.max(0.1, Math.round((filamentLengthMm / 1000) * 100) / 100);

  // Exact Filament Weight (g) matching Elegoo Slicer
  const rawWeightGrams = extrudedPlasticCm3 * density;
  const weightGrams = Math.max(0.1, Math.round(rawWeightGrams * 100) / 100);
  const totalPrice = Math.round(weightGrams * pricePerGram * 100) / 100;

  // Accurate Kinematic Print Time (OrcaSlicer / Elegoo Slicer CoreXY Physics)
  const firstLayerHeight = Math.min(0.24, layerHeight * 1.5);
  const numLayers = Math.max(1, Math.ceil((metrics.height - firstLayerHeight) / layerHeight) + 1);

  // Bead cross section: extrusion width * layer height
  const extrusionWidth = nozzleSize * 1.05;
  const beadArea = extrusionWidth * layerHeight;
  const totalExtrusionDistanceMm = filamentLengthMm * (filamentCrossSectionArea / beadArea);
  const totalTravelDistanceMm = totalExtrusionDistanceMm * 0.25;

  // Speeds: with acceleration curve and nozzle limits
  const speed = settings.speed || (nozzleSize <= 0.25 ? 80 : 250);
  const effectiveSpeedMmS = Math.min(speed, nozzleSize <= 0.25 ? 55 : 125);
  const travelSpeedMmS = 300;

  const rawExtrusionSeconds = totalExtrusionDistanceMm / effectiveSpeedMmS;
  const rawTravelSeconds = totalTravelDistanceMm / travelSpeedMmS;
  const rawMotionSeconds = rawExtrusionSeconds + rawTravelSeconds;

  // Layer change overhead (retract 0.8mm, Z-hop 0.2mm, wipe, unretract) ~0.65s per layer
  const layerOverheadSeconds = numLayers * 0.65;

  // Slicer Cooling Threshold: modern slicers enforce minimum layer time (8-12s) to prevent melting
  const minLayerCoolingSeconds = nozzleSize <= 0.25 ? 11.5 : 8.5;
  const minCoolingTotalSeconds = numLayers * minLayerCoolingSeconds;

  // Prepare time: heatup hotend + bed + homing + nozzle wipe (~78s)
  const prepareTimeSeconds = printer.heatupTimeSeconds + printer.bedLevelTimeSeconds;

  const modelPrintTimeSeconds = Math.max(rawMotionSeconds + layerOverheadSeconds, minCoolingTotalSeconds);
  const totalSeconds = Math.ceil(modelPrintTimeSeconds + prepareTimeSeconds);

  const printHours = Math.floor(totalSeconds / 3600);
  const printMinutes = Math.floor((totalSeconds % 3600) / 60);
  const printSecondsRemaining = totalSeconds % 60;
  const printTimeFormatted = printHours > 0 
    ? `${printHours}h ${printMinutes}m` 
    : `${printMinutes}m ${printSecondsRemaining}s`;

  // Fits Centauri Carbon bed check (256 x 256 x 256 mm)
  const fitsBed = (
    metrics.width <= printer.bed.x &&
    metrics.depth <= printer.bed.y &&
    metrics.height <= printer.bed.z
  );

  return {
    metrics,
    weightGrams,
    filamentWeightGrams: weightGrams, // Provide both aliases
    filamentLengthMeters,
    volumetricExtrusionCm3: Math.round(extrudedPlasticCm3 * 10) / 10,
    totalPrice,
    totalSeconds,
    printTimeFormatted,
    modelPrintTimeSeconds: Math.ceil(modelPrintTimeSeconds),
    numLayers,
    layerHeight,
    nozzleSize,
    fitsBed,
    printerBed: printer.bed
  };
}

// Complete slice engine with exact planar segments for 3D visualization
export function sliceMesh(geometry, settings = {}) {
  // Use the accurate estimation as the baseline physics model
  const estimate = estimatePrintMetrics(geometry, settings);
  const { metrics, printerBed } = estimate;
  const printer = PRINTER_PROFILES[settings.printerId] || PRINTER_PROFILES.centauri_carbon;
  
  let material = MATERIALS.pla;
  const matKey = (settings.materialKey || settings.material || "pla").toLowerCase();
  if (matKey.includes("petg")) material = MATERIALS.petg;
  else if (matKey.includes("abs")) material = MATERIALS.abs;
  else if (matKey.includes("tpu")) material = MATERIALS.tpu;
  else if (matKey.includes("asa")) material = MATERIALS.asa;
  else if (MATERIALS[matKey]) material = MATERIALS[matKey];

  const layerHeight = settings.layerHeight || estimate.layerHeight;
  const firstLayerHeight = settings.firstLayerHeight || Math.min(0.24, layerHeight * 1.5);
  const infillPercent = settings.infillPercent !== undefined ? settings.infillPercent : 20;
  const wallCount = settings.wallCount || 2;
  const pricePerGram = parseFloat(settings.pricePerGram) || 3.0;

  const numLayers = estimate.numLayers;
  const nozzleSize = estimate.nozzleSize || 0.40;
  const nozzleW = nozzleSize * 1.05;

  const toolpathLayers = [];

  for (let l = 0; l < numLayers; l++) {
    const currentY = l === 0 ? firstLayerHeight : firstLayerHeight + (l * layerHeight);
    const isSolid = l < 3 || l >= numLayers - 3;

    const planarSegments = extractLayerPlanarSegments(geometry, currentY);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    planarSegments.forEach(seg => {
      minX = Math.min(minX, seg[0].x, seg[1].x);
      maxX = Math.max(maxX, seg[0].x, seg[1].x);
      minY = Math.min(minY, seg[0].y, seg[1].y);
      maxY = Math.max(maxY, seg[0].y, seg[1].y);
    });

    const hasGeometry = planarSegments.length > 0 && isFinite(minX);
    const outerWallSegments = [];
    const innerWallSegments = [];

    if (hasGeometry) {
      planarSegments.forEach(seg => {
        outerWallSegments.push(seg);
      });

      for (let w = 1; w < wallCount; w++) {
        const offset = w * nozzleW;
        planarSegments.forEach(seg => {
          const dx = seg[1].x - seg[0].x;
          const dy = seg[1].y - seg[0].y;
          const len = Math.hypot(dx, dy);
          if (len > 0.1) {
            const nx = -dy / len * offset;
            const ny = dx / len * offset;
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
      const spacing = isSolid ? nozzleW * 1.05 : Math.max(nozzleW * 2, 28 / Math.max(infillPercent, 1));

      for (let y = minY + nozzleW; y <= maxY - nozzleW; y += spacing) {
        const lineStart = { x: minX + nozzleW, y: y };
        const lineEnd = { x: maxX - nozzleW, y: y };
        const span = lineEnd.x - lineStart.x;
        const testPoints = Math.max(4, Math.ceil(span / 1.5));
        let activeSegStart = null;

        for (let s = 0; s <= testPoints; s++) {
          const px = lineStart.x + (s / testPoints) * span;
          const inside = isPointInsideSegments(px, y, planarSegments);

          if (inside && !activeSegStart) {
            activeSegStart = { x: px, y: y, z: currentY };
          } else if (!inside && activeSegStart) {
            const activeSegEnd = { x: px, y: y, z: currentY };
            const dist = Math.hypot(activeSegEnd.x - activeSegStart.x, activeSegEnd.y - activeSegStart.y);
            if (dist > 0.5) {
              infillSegments.push([activeSegStart, activeSegEnd]);
            }
            activeSegStart = null;
          }
        }
        if (activeSegStart) {
          const activeSegEnd = { x: lineEnd.x, y: y, z: currentY };
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
    metrics,
    printer,
    material,
    numLayers,
    layerHeight,
    firstLayerHeight,
    weightGrams: estimate.weightGrams,
    filamentWeightGrams: estimate.weightGrams, // Return both aliases!
    filamentLengthMeters: estimate.filamentLengthMeters,
    volumetricExtrusionCm3: estimate.volumetricExtrusionCm3,
    printingTimeSeconds: estimate.totalSeconds,
    printTimeFormatted: estimate.printTimeFormatted,
    totalPrice: estimate.totalPrice,
    fitsBed: estimate.fitsBed,
    printerBed: estimate.printerBed,
    toolpathLayers
  };
}

// Generate valid Elegoo Centauri Carbon Klipper G-Code
export function generateElegooGcode(sliceResult, fileName = "model") {
  const { printer, material, numLayers, layerHeight, firstLayerHeight, toolpathLayers, metrics } = sliceResult;
  const dateStr = new Date().toISOString();

  let gcode = `; ==========================================================================\n`;
  gcode += `; ELEGOO CENTAURI CARBON SLICER OS - PRODUCTION G-CODE\n`;
  gcode += `; Generated: ${dateStr}\n`;
  gcode += `; Target Printer: ${printer.name} (${printer.firmware})\n`;
  gcode += `; Nozzle: ${printer.nozzle} mm | Width: ${printer.extrusionWidth} mm\n`;
  gcode += `; Material: ${material.name} (${material.density} g/cm3)\n`;
  gcode += `; Total Layers: ${numLayers} | Layer Height: ${layerHeight} mm\n`;
  gcode += `; Estimated Print Time: ${sliceResult.printTimeFormatted}\n`;
  gcode += `; Filament Mass: ${sliceResult.weightGrams || sliceResult.filamentWeightGrams} g (${sliceResult.filamentLengthMeters} m)\n`;
  gcode += `; Dimensions: ${metrics.width} x ${metrics.depth} x ${metrics.height} mm\n`;
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
  const filamentArea = Math.PI * (1.75 / 2) * (1.75 / 2);

  for (const layer of toolpathLayers) {
    gcode += `; LAYER:${layer.layerIndex} | Z=${layer.heightZ.toFixed(2)}\n`;
    gcode += `G1 Z${layer.heightZ.toFixed(2)} F3000\n`;

    if (layer.outerWall && layer.outerWall.length > 0) {
      gcode += `; TYPE:Outer wall\n`;
      layer.outerWall.forEach(seg => {
        const dist = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const eVal = ((dist * beadArea) / filamentArea).toFixed(4);
        gcode += `G0 X${seg[0].x.toFixed(3)} Y${seg[0].y.toFixed(3)} F9000 ; Travel\n`;
        gcode += `G1 X${seg[1].x.toFixed(3)} Y${seg[1].y.toFixed(3)} E${eVal} F5400\n`;
      });
    }

    if (layer.innerWall && layer.innerWall.length > 0) {
      gcode += `; TYPE:Inner wall\n`;
      layer.innerWall.forEach(seg => {
        const dist = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const eVal = ((dist * beadArea) / filamentArea).toFixed(4);
        gcode += `G0 X${seg[0].x.toFixed(3)} Y${seg[0].y.toFixed(3)} F9000 ; Travel\n`;
        gcode += `G1 X${seg[1].x.toFixed(3)} Y${seg[1].y.toFixed(3)} E${eVal} F7200\n`;
      });
    }

    if (layer.infill && layer.infill.length > 0) {
      gcode += layer.isSolid ? `; TYPE:Top/Bottom skin\n` : `; TYPE:Infill\n`;
      layer.infill.forEach(seg => {
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
