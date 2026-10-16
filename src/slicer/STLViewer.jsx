// src/slicer/STLViewer.jsx
// Interactive 3D STL Model & Slicer Viewer for Centurai Print OS

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  PRINTER_PROFILES,
  autoOrientForPrinting,
  estimatePrintMetrics,
  sliceMesh,
  generateElegooGcode
} from './slicerEngine.js';

export function resolveColorHex(colorVal) {
  if (!colorVal) return 0x1e232a;
  if (typeof colorVal === 'number') return colorVal;
  const s = String(colorVal).toLowerCase().trim();
  if (s.startsWith('#')) {
    const parsed = parseInt(s.replace('#', ''), 16);
    if (!isNaN(parsed)) return parsed;
  }
  if (s.includes('white') || s.includes('marble')) return 0xf1f5f9;
  if (s.includes('black') || s.includes('carbon') || s.includes('obsidian')) return 0x1e232a;
  if (s.includes('orange') || s.includes('mclaren')) return 0xff8000;
  if (s.includes('silver') || s.includes('grey') || s.includes('gray') || s.includes('titanium')) return 0x94a3b8;
  if (s.includes('red') || s.includes('crimson')) return 0xef4444;
  if (s.includes('blue') || s.includes('sky') || s.includes('cobalt')) return 0x3b82f6;
  if (s.includes('green') || s.includes('emerald')) return 0x10b981;
  if (s.includes('yellow')) return 0xeab308;
  if (s.includes('purple')) return 0x8b5cf6;
  return 0x1e232a;
}

const STLViewer = forwardRef(function STLViewer({
  file,
  fileUrl,
  color = 'Black',
  infillPercent = 20,
  materialKey = 'pla',
  pricePerGram = 3.0,
  layerHeight = 0.20,
  nozzleSize = 0.40,
  printerId = 'centauri_carbon',
  onMetricsChange,
  showSlicerControls = false,
  height = '280px',
  compact = false
}, ref) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelGroupRef = useRef(null);
  const toolpathGroupRef = useRef(null);
  const geometryRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading 3D model...');
  const [viewMode, setViewMode] = useState('model'); // 'model' | 'toolpath'
  const [sliceData, setSliceData] = useState(null);
  const [activeLayer, setActiveLayer] = useState(1);
  const [maxLayers, setMaxLayers] = useState(1);
  const [soloLayer, setSoloLayer] = useState(false);
  const [isSlicing, setIsSlicing] = useState(false);

  // Auto-frame camera based on model size
  function autoFrameCamera(geo) {
    if (!geo || !controlsRef.current || !cameraRef.current) return;
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    const sx = Math.max(1, bbox.max.x - bbox.min.x);
    const sy = Math.max(1, bbox.max.y - bbox.min.y);
    const sz = Math.max(1, bbox.max.z - bbox.min.z);
    const modelMax = Math.max(sx, sy, sz);

    const targetY = Math.max(6, sy * 0.4);
    controlsRef.current.target.set(0, targetY, 0);

    // Position camera so model fills 60-70% of the viewport prominently
    const dist = Math.max(85, modelMax * 1.55);
    cameraRef.current.position.set(dist * 0.72, dist * 0.65, dist * 0.82);
    cameraRef.current.near = 1;
    cameraRef.current.far = 4000;
    cameraRef.current.updateProjectionMatrix();
    controlsRef.current.update();
  }

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const getH = () => {
      if (typeof height === 'number') return height;
      if (typeof height === 'string' && height.endsWith('px')) return parseInt(height, 10);
      return container.clientHeight && container.clientHeight > 50 ? container.clientHeight : 400;
    };

    const width = container.clientWidth || 300;
    const h = getH();

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0f14);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / h, 1, 4000);
    camera.position.set(130, 120, 160);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Bed floor clamp
    controls.minDistance = 20;
    controls.maxDistance = 1200;
    controls.target.set(0, 15, 0);
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(150, 260, 180);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x4070a0, 0.65);
    fillLight.position.set(-140, 120, -140);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff8000, 1.4, 400);
    rimLight.position.set(0, 140, -160);
    scene.add(rimLight);

    // Build Plate (Centauri Carbon 256x256mm)
    const bedGroup = new THREE.Group();
    const bedW = 256, bedD = 256;

    // PEI textured surface plate
    const bedGeo = new THREE.BoxGeometry(bedW, 2, bedD);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x161a22,
      roughness: 0.85,
      metalness: 0.2
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.position.y = -1;
    bedMesh.receiveShadow = true;
    bedGroup.add(bedMesh);

    // Grid lines (25.6mm squares = 10x10 divisions on 256mm bed)
    const grid = new THREE.GridHelper(bedW, 10, 0xff8000, 0x27303d);
    grid.position.y = 0.05;
    bedGroup.add(grid);

    // Border
    const borderGeo = new THREE.BufferGeometry();
    const hw = bedW / 2, hd = bedD / 2;
    const borderPts = new Float32Array([
      -hw, 0.1, -hd,   hw, 0.1, -hd,
       hw, 0.1, -hd,   hw, 0.1,  hd,
       hw, 0.1,  hd,  -hw, 0.1,  hd,
      -hw, 0.1,  hd,  -hw, 0.1, -hd
    ]);
    borderGeo.setAttribute('position', new THREE.BufferAttribute(borderPts, 3));
    const borderLine = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color: 0xff8000, linewidth: 2 }));
    bedGroup.add(borderLine);

    scene.add(bedGroup);

    // Groups for model and toolpaths
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    const toolpathGroup = new THREE.Group();
    scene.add(toolpathGroup);
    toolpathGroupRef.current = toolpathGroup;

    // Animation Loop
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle Resize
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth || 300;
      const newH = getH();
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [height]);

  // Load and Parse STL File
  useEffect(() => {
    if (!file && !fileUrl) {
      clearModel();
      return;
    }

    setLoading(true);
    setLoadingText('Loading STL...');

    const loader = new STLLoader();

    if (file instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const geo = loader.parse(e.target.result);
          applyGeometry(geo);
        } catch (err) {
          console.error('Error parsing STL:', err);
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (typeof fileUrl === 'string' && fileUrl.trim()) {
      loader.load(
        fileUrl,
        (geo) => {
          applyGeometry(geo);
        },
        undefined,
        (err) => {
          console.error('Error loading remote STL:', err);
          setLoading(false);
        }
      );
    }
  }, [file, fileUrl]);

  // Update mesh color when color prop changes
  useEffect(() => {
    if (modelGroupRef.current) {
      const colorHex = resolveColorHex(color);
      modelGroupRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.color.set(colorHex);
          child.material.needsUpdate = true;
        }
      });
    }
  }, [color]);

  // Re-estimate metrics when infill, material, pricePerGram, layerHeight, or nozzleSize changes
  useEffect(() => {
    if (!geometryRef.current) return;
    const est = estimatePrintMetrics(geometryRef.current, {
      infillPercent,
      materialKey,
      pricePerGram,
      layerHeight,
      nozzleSize: nozzleSize || (layerHeight <= 0.10 ? 0.20 : 0.40),
      printerId
    });
    if (onMetricsChange) onMetricsChange(est);
  }, [infillPercent, materialKey, pricePerGram, layerHeight, nozzleSize, printerId]);

  // Clear 3D model
  function clearModel() {
    if (modelGroupRef.current) {
      while (modelGroupRef.current.children.length > 0) {
        modelGroupRef.current.remove(modelGroupRef.current.children[0]);
      }
    }
    clearToolpaths();
    geometryRef.current = null;
    setSliceData(null);
  }

  function clearToolpaths() {
    if (toolpathGroupRef.current) {
      while (toolpathGroupRef.current.children.length > 0) {
        toolpathGroupRef.current.remove(toolpathGroupRef.current.children[0]);
      }
    }
  }

  // Apply geometry to scene
  function applyGeometry(geo) {
    clearModel();
    geo.computeVertexNormals();

    // Auto-orient for best FDM print orientation (minimise height, maximise bed contact)
    autoOrientForPrinting(geo);

    geometryRef.current = geo;

    // Center horizontally and ground base on bed (y = 0)
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    const cx = (bbox.max.x + bbox.min.x) / 2;
    const cy = bbox.min.y;
    const cz = (bbox.max.z + bbox.min.z) / 2;
    geo.translate(-cx, -cy, -cz);
    geo.computeBoundingBox();

    // Material with chosen filament color aesthetic
    const mat = new THREE.MeshStandardMaterial({
      color: resolveColorHex(color),
      metalness: 0.25,
      roughness: 0.35
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    modelGroupRef.current.add(mesh);

    // Auto-frame camera so model is prominent and clean
    autoFrameCamera(geo);

    // Estimate print metrics
    const est = estimatePrintMetrics(geo, {
      infillPercent,
      materialKey,
      pricePerGram,
      layerHeight,
      nozzleSize: nozzleSize || (layerHeight <= 0.10 ? 0.20 : 0.40),
      printerId
    });
    if (onMetricsChange) onMetricsChange(est);

    setLoading(false);
  }

  // Slice model on demand for toolpath visualization
  function handleSliceNow() {
    if (!geometryRef.current || isSlicing) return;
    setIsSlicing(true);
    setLoadingText('Slicing layers...');

    setTimeout(() => {
      try {
        const res = sliceMesh(geometryRef.current, {
          infillPercent,
          materialKey,
          pricePerGram,
          layerHeight,
          nozzleSize: nozzleSize || (layerHeight <= 0.10 ? 0.20 : 0.40),
          printerId
        });
        setSliceData(res);
        setMaxLayers(res.numLayers);
        setActiveLayer(res.numLayers);
        renderToolpaths(res);
        setViewMode('toolpath');
        if (modelGroupRef.current) modelGroupRef.current.visible = false;
        if (toolpathGroupRef.current) toolpathGroupRef.current.visible = true;
        if (onMetricsChange) onMetricsChange(res);
      } catch (err) {
        console.error('Slicing error:', err);
      }
      setIsSlicing(false);
    }, 50);
  }

  // Render toolpaths into Three.js lines
  function renderToolpaths(res) {
    clearToolpaths();

    const outerMat = new THREE.LineBasicMaterial({ color: 0xff8000, linewidth: 2 });
    const innerMat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 1 });
    const infillMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, linewidth: 1 });
    const skinMat = new THREE.LineBasicMaterial({ color: 0xe0245e, linewidth: 1 });

    res.toolpathLayers.forEach((layer) => {
      const layerGroup = new THREE.Group();
      layerGroup.name = `layer_${layer.layerIndex}`;
      layerGroup.userData = { layerIndex: layer.layerIndex };

      // Outer wall
      if (layer.outerWall && layer.outerWall.length > 0) {
        const pts = [];
        layer.outerWall.forEach(seg => {
          pts.push(new THREE.Vector3(seg[0].x, seg[0].z, seg[0].y));
          pts.push(new THREE.Vector3(seg[1].x, seg[1].z, seg[1].y));
        });
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        layerGroup.add(new THREE.LineSegments(geo, outerMat));
      }

      // Inner wall
      if (layer.innerWall && layer.innerWall.length > 0) {
        const pts = [];
        layer.innerWall.forEach(seg => {
          pts.push(new THREE.Vector3(seg[0].x, seg[0].z, seg[0].y));
          pts.push(new THREE.Vector3(seg[1].x, seg[1].z, seg[1].y));
        });
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        layerGroup.add(new THREE.LineSegments(geo, innerMat));
      }

      // Infill
      if (layer.infill && layer.infill.length > 0) {
        const pts = [];
        layer.infill.forEach(seg => {
          pts.push(new THREE.Vector3(seg[0].x, seg[0].z, seg[0].y));
          pts.push(new THREE.Vector3(seg[1].x, seg[1].z, seg[1].y));
        });
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        layerGroup.add(new THREE.LineSegments(geo, layer.isSolid ? skinMat : infillMat));
      }

      toolpathGroupRef.current.add(layerGroup);
    });

    filterLayers(res.numLayers, false);
  }

  // Filter layer visibility
  function filterLayers(currentL, isSolo) {
    if (!toolpathGroupRef.current) return;
    toolpathGroupRef.current.children.forEach(grp => {
      const idx = grp.userData.layerIndex;
      if (isSolo) {
        grp.visible = idx === currentL;
      } else {
        grp.visible = idx <= currentL;
      }
    });
  }

  // Switch view mode
  function handleToggleMode(mode) {
    setViewMode(mode);
    if (mode === 'model') {
      if (modelGroupRef.current) modelGroupRef.current.visible = true;
      if (toolpathGroupRef.current) toolpathGroupRef.current.visible = false;
    } else {
      if (!sliceData) {
        handleSliceNow();
      } else {
        if (modelGroupRef.current) modelGroupRef.current.visible = false;
        if (toolpathGroupRef.current) toolpathGroupRef.current.visible = true;
      }
    }
  }

  // Reset Camera View
  function handleResetCamera() {
    if (geometryRef.current) {
      autoFrameCamera(geometryRef.current);
    } else if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(130, 120, 160);
      controlsRef.current.target.set(0, 15, 0);
      controlsRef.current.update();
    }
  }

  // Expose slicing & G-code methods via ref
  useImperativeHandle(ref, () => ({
    slice: handleSliceNow,
    getSliceResult: () => sliceData,
    generateGcode: (name) => sliceData ? generateElegooGcode(sliceData, name) : null,
    resetCamera: handleResetCamera,
    autoFrame: () => autoFrameCamera(geometryRef.current)
  }));

  return (
    <div style={{ position: 'relative', width: '100%', height, minHeight: typeof height === 'number' ? height : undefined, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(10, 12, 16, 0.85)' }}>
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', minHeight: '100%' }} />

      {/* Loading Overlay */}
      {(loading || isSlicing) && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10, 12, 16, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(255, 128, 0, 0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{loadingText}</span>
        </div>
      )}

      {/* Top Floating Controls Bar */}
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none', zIndex: 5 }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6, background: 'rgba(20, 25, 35, 0.8)', backdropFilter: 'blur(12px)', padding: '4px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-glass)' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '4px 10px', fontSize: 11, background: viewMode === 'model' ? 'var(--accent)' : 'transparent', color: viewMode === 'model' ? '#000' : 'var(--text-primary)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700 }}
            onClick={() => handleToggleMode('model')}
          >
            3D Model
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '4px 10px', fontSize: 11, background: viewMode === 'toolpath' ? 'var(--accent)' : 'transparent', color: viewMode === 'toolpath' ? '#000' : 'var(--text-primary)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700 }}
            onClick={() => handleToggleMode('toolpath')}
          >
            {sliceData ? 'Toolpath' : 'Slice Preview'}
          </button>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-glass"
          style={{ pointerEvents: 'auto', padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-full)' }}
          onClick={handleResetCamera}
          title="Reset Camera & Center Model"
        >
          Reset View
        </button>
      </div>

      {/* Bottom Toolpath Layer Slider (visible when in toolpath mode) */}
      {viewMode === 'toolpath' && sliceData && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, background: 'rgba(20, 25, 35, 0.9)', backdropFilter: 'blur(16px)', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: 12, zIndex: 5 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700, minWidth: 90 }}>
            Layer {activeLayer}/{maxLayers}
          </span>
          <input
            type="range"
            min={1}
            max={maxLayers}
            value={activeLayer}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setActiveLayer(val);
              filterLayers(val, soloLayer);
            }}
            style={{ flex: 1, height: 4, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={soloLayer}
              onChange={(e) => {
                setSoloLayer(e.target.checked);
                filterLayers(activeLayer, e.target.checked);
              }}
              style={{ accentColor: 'var(--accent)' }}
            />
            Solo
          </label>
        </div>
      )}
    </div>
  );
});

export default STLViewer;
