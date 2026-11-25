// src/slicer/stlThumbnail.js
// Lightweight offscreen Three.js 2D screenshot thumbnail generator & STL parser
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { autoOrientForPrinting } from './slicerEngine.js';
import { resolveColorHex } from './STLViewer.jsx';

let sharedRenderer = null;

function getThumbnailRenderer(size = 112) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (sharedRenderer) {
    return sharedRenderer;
  }
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    });
    renderer.setSize(size, size, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sharedRenderer = renderer;
    return sharedRenderer;
  } catch (err) {
    console.warn('Thumbnail WebGL renderer unavailable:', err);
    return null;
  }
}

/**
 * Parses an STL File once, auto-orients it flat on the build bed (y = 0),
 * centers X/Z at (0, 0), and computes normals & bounding box.
 */
export async function parseAndOrientStlFile(file) {
  const buffer = await file.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);

  if (!geometry || !geometry.attributes?.position || geometry.attributes.position.count < 3) {
    throw new Error('STL file contains no valid 3D geometry.');
  }

  geometry.computeVertexNormals();
  autoOrientForPrinting(geometry);
  geometry.computeBoundingBox();

  const bbox = geometry.boundingBox;
  if (bbox) {
    const cx = (bbox.max.x + bbox.min.x) / 2;
    const cy = bbox.min.y;
    const cz = (bbox.max.z + bbox.min.z) / 2;
    geometry.translate(-cx, -cy, -cz);
    geometry.computeBoundingBox();
  }

  return geometry;
}

/**
 * Renders a compact 2D PNG screenshot of an oriented THREE.BufferGeometry
 * in the chosen filament color for crisp part-list previews.
 */
export function renderStlThumbnail(geometry, colorName = 'Orange', size = 112) {
  if (!geometry) return null;
  const renderer = getThumbnailRenderer(size);
  if (!renderer) return null;

  let material = null;
  try {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return null;

    const sx = Math.max(0.5, bbox.max.x - bbox.min.x);
    const sy = Math.max(0.5, bbox.max.y - bbox.min.y);
    const sz = Math.max(0.5, bbox.max.z - bbox.min.z);
    const maxDim = Math.max(sx, sy, sz);

    const scene = new THREE.Scene();

    // Soft studio lighting so both Black and White filaments retain clear 3D form
    const ambient = new THREE.AmbientLight(0xffffff, 1.05);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(maxDim * 1.4, maxDim * 2.1, maxDim * 1.6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcbd5e1, 0.8);
    fillLight.position.set(-maxDim * 1.6, maxDim * 0.9, -maxDim * 1.1);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb36b, 0.45);
    rimLight.position.set(0, maxDim * 1.1, -maxDim * 1.8);
    scene.add(rimLight);

    let hex = resolveColorHex(colorName);
    // Slightly lift near-black charcoal so geometry edges read clearly at 44px
    if (hex === 0x1e232a) {
      hex = 0x333b46;
    }

    material = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.42,
      metalness: 0.16
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const camera = new THREE.PerspectiveCamera(34, 1, Math.max(0.1, maxDim * 0.02), maxDim * 30);
    const centerY = sy * 0.46;
    const radius = Math.hypot(sx, sy, sz) * 0.5;
    const dist = (radius / Math.sin((34 * Math.PI) / 360)) * 1.08;

    camera.position.set(dist * 0.68, centerY + dist * 0.54, dist * 0.72);
    camera.lookAt(0, centerY, 0);
    camera.updateProjectionMatrix();

    renderer.clear();
    renderer.render(scene, camera);

    return renderer.domElement.toDataURL('image/png');
  } catch (err) {
    console.warn('Could not render STL thumbnail:', err);
    return null;
  } finally {
    if (material) material.dispose();
  }
}
