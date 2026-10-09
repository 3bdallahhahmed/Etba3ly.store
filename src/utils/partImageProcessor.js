/**
 * Default presets for the Etba3ly Glowing Orange background
 * Sampled directly from the official Etba3ly logo backdrop (#0A0A0F outer dark
 * with warm radial #FF8000 / #FFA40F / #27180D amber-orange center glow).
 */
export const DEFAULT_STUDIO_OPTIONS = {
  autoRemoveBg: true,
  glowIntensity: 1.0,     // 0.3 (subtle) to 2.0 (intense neon orange glow)
  partScale: 0.76,        // How much of the canvas the trimmed 3D part occupies (0.4 - 0.92)
  aspectRatio: "4:3",     // "4:3" (gallery card standard), "1:1" (square), "original"
  silhouetteGlow: true,   // Radiate orange glow from the 3D part's exact silhouette
  useFastChromaFallback: false,
};

/**
 * Load an Image element from a File, Blob, or URL
 */
export function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let objectUrl = null;

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image file"));
    };

    if (source instanceof Blob || source instanceof File) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else if (typeof source === "string") {
      img.src = source;
    } else {
      reject(new Error("Unsupported image source"));
    }
  });
}

/**
 * Corner-sampled flood-fill + soft edge alpha matte fallback
 * Used when offline or if fast chroma key mode is selected.
 */
export function removeBackgroundCornerFloodFill(img, tolerance = 38) {
  const maxDim = 1200;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Sample border pixels near corners & edges to estimate background colors
  const sampleCoords = [
    [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
    [Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3],
    [2, Math.floor(h / 2)], [w - 3, Math.floor(h / 2)],
  ];
  const bgSamples = sampleCoords.map(([sx, sy]) => {
    const idx = (Math.max(0, Math.min(h - 1, sy)) * w + Math.max(0, Math.min(w - 1, sx))) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  });

  function minColorDist(r, g, b) {
    let best = Infinity;
    for (let i = 0; i < bgSamples.length; i++) {
      const [br, bg, bb] = bgSamples[i];
      const dr = r - br;
      const dg = g - bg;
      const db = b - bb;
      // Perceptual weighted Euclidean distance
      const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
      if (dist < best) best = dist;
    }
    return best;
  }

  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  function enqueue(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    visited[p] = 1;
    const idx = p * 4;
    const dist = minColorDist(data[idx], data[idx + 1], data[idx + 2]);
    if (dist <= tolerance) {
      isBg[p] = 1;
      queue[tail++] = p;
    }
  }

  // Seed flood fill along all 4 outer edges
  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  // Apply alpha with soft feathering on boundary pixels
  const featherRange = 18;
  for (let p = 0; p < w * h; p++) {
    const idx = p * 4;
    if (isBg[p]) {
      data[idx + 3] = 0;
    } else {
      const x = p % w;
      const y = (p - x) / w;
      const touchesBg =
        (x > 0 && isBg[p - 1]) ||
        (x < w - 1 && isBg[p + 1]) ||
        (y > 0 && isBg[p - w]) ||
        (y < h - 1 && isBg[p + w]);
      if (touchesBg) {
        const dist = minColorDist(data[idx], data[idx + 1], data[idx + 2]);
        const factor = Math.min(1, Math.max(0.15, (dist - tolerance) / featherRange + 0.5));
        data[idx + 3] = Math.round(data[idx + 3] * factor);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Find the non-transparent bounding box of a foreground image/canvas
 */
function getAlphaBoundingBox(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) {
    return { x: 0, y: 0, width: w, height: h };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

/**
 * Draw the signature Etba3ly Logo Glowing Orange background onto a 2D canvas context.
 * Matches the uploaded logo backdrop:
 * - Deep obsidian outer dark (#0A0A0F)
 * - Warm radial amber-orange glow in the center (#27180D -> #1F140E -> #18100E -> #110E0F -> #0A0A0F)
 * - Vibrant Etba3ly orange core bloom (#FF8000 / #FFA40F)
 */
export function drawEtba3lyGlowingOrangeBackground(ctx, width, height, glowIntensity = 1.0) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxRadius = Math.max(width, height) * 0.68;

  // 1. Solid base matching the outer logo background (#0A0A0F)
  ctx.fillStyle = "#0A0A0F";
  ctx.fillRect(0, 0, width, height);

  // 2. Wide warm ambient amber-orange radial gradient (matches logo background falloff)
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ambientGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
  ambientGrad.addColorStop(0.0, `rgba(92, 46, 12, ${clamp(0.95 * glowIntensity)})`);
  ambientGrad.addColorStop(0.22, `rgba(58, 30, 12, ${clamp(0.88 * glowIntensity)})`);
  ambientGrad.addColorStop(0.42, `rgba(39, 24, 13, ${clamp(0.82 * glowIntensity)})`);
  ambientGrad.addColorStop(0.62, `rgba(24, 16, 14, ${clamp(0.75 * glowIntensity)})`);
  ambientGrad.addColorStop(0.82, `rgba(17, 14, 15, ${clamp(0.65 * glowIntensity)})`);
  ambientGrad.addColorStop(1.0, "rgba(10, 10, 15, 0)");

  ctx.fillStyle = ambientGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Focused glowing orange core halo (#FF8000 / #FFA40F) behind the part
  const coreRadius = Math.min(width, height) * 0.46;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  coreGrad.addColorStop(0.0, `rgba(255, 136, 15, ${clamp(0.42 * glowIntensity)})`);
  coreGrad.addColorStop(0.32, `rgba(255, 108, 10, ${clamp(0.24 * glowIntensity)})`);
  coreGrad.addColorStop(0.65, `rgba(210, 75, 8, ${clamp(0.09 * glowIntensity)})`);
  coreGrad.addColorStop(1.0, "rgba(255, 128, 0, 0)");

  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Composite a foreground image (with transparent background) onto the Etba3ly
 * Glowing Orange background and return a high-resolution Canvas.
 */
export function compositeForegroundOnLogoGlow(foregroundSource, options = {}) {
  const opts = { ...DEFAULT_STUDIO_OPTIONS, ...options };
  const srcW = foregroundSource.naturalWidth || foregroundSource.width;
  const srcH = foregroundSource.naturalHeight || foregroundSource.height;

  // Determine output dimensions
  let outW = 1200;
  let outH = 900; // Default 4:3 for gallery cards
  if (opts.aspectRatio === "1:1") {
    outW = 1080;
    outH = 1080;
  } else if (opts.aspectRatio === "16:9") {
    outW = 1280;
    outH = 720;
  } else if (opts.aspectRatio === "original" && srcW && srcH) {
    const maxOut = 1400;
    const scale = Math.min(1, maxOut / Math.max(srcW, srcH));
    outW = Math.max(600, Math.round(srcW * scale));
    outH = Math.max(600, Math.round(srcH * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // 1. Paint the Etba3ly logo glowing orange background
  drawEtba3lyGlowingOrangeBackground(ctx, outW, outH, opts.glowIntensity);

  // 2. Find bounding box of the 3D printed part so it is centered over the orange glow
  const bbox = opts.autoRemoveBg
    ? getAlphaBoundingBox(foregroundSource)
    : { x: 0, y: 0, width: srcW, height: srcH };

  const targetMaxW = outW * opts.partScale;
  const targetMaxH = outH * opts.partScale;
  const scale = Math.min(targetMaxW / bbox.width, targetMaxH / bbox.height);

  const drawW = Math.round(bbox.width * scale);
  const drawH = Math.round(bbox.height * scale);
  const drawX = Math.round((outW - drawW) / 2);
  const drawY = Math.round((outH - drawH) / 2);

  // 3. Draw shape-conforming glowing orange aura behind the 3D part's silhouette
  if (opts.silhouetteGlow && opts.glowIntensity > 0) {
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = drawW;
    glowCanvas.height = drawH;
    const gCtx = glowCanvas.getContext("2d");
    gCtx.drawImage(
      foregroundSource,
      bbox.x, bbox.y, bbox.width, bbox.height,
      0, 0, drawW, drawH
    );
    gCtx.globalCompositeOperation = "source-in";
    const tintGrad = gCtx.createRadialGradient(
      drawW / 2, drawH / 2, 0,
      drawW / 2, drawH / 2, Math.max(drawW, drawH) * 0.6
    );
    tintGrad.addColorStop(0, "#FFA40F");
    tintGrad.addColorStop(0.6, "#FF6A00");
    tintGrad.addColorStop(1, "#FD4C0D");
    gCtx.fillStyle = tintGrad;
    gCtx.fillRect(0, 0, drawW, drawH);

    ctx.save();
    const blurPx = Math.round(Math.min(outW, outH) * 0.065);
    ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = Math.min(0.85, 0.42 * opts.glowIntensity);
    // Slightly expanded silhouette halo behind the part
    const expand = 1.08;
    const gw = drawW * expand;
    const gh = drawH * expand;
    const gx = (outW - gw) / 2;
    const gy = (outH - gh) / 2;
    ctx.drawImage(glowCanvas, gx, gy, gw, gh);
    ctx.restore();
  }

  // 4. Draw subtle grounding shadow beneath the part
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
  ctx.shadowBlur = Math.round(Math.min(outW, outH) * 0.035);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(Math.min(outW, outH) * 0.015);
  ctx.drawImage(
    foregroundSource,
    bbox.x, bbox.y, bbox.width, bbox.height,
    drawX, drawY, drawW, drawH
  );
  ctx.restore();

  return canvas;
}

/**
 * Extract the foreground (transparent background) from an uploaded image File/Blob.
 * Uses @imgly/background-removal AI segmentation by default, with automatic
 * fallback to corner-flood-fill chroma segmentation if needed.
 */
export async function extractPartForeground(fileOrBlob, options = {}, onProgress = null) {
  const opts = { ...DEFAULT_STUDIO_OPTIONS, ...options };

  if (!opts.autoRemoveBg) {
    return await loadImageElement(fileOrBlob);
  }

  if (!opts.useFastChromaFallback) {
    try {
      if (onProgress) onProgress("Loading AI background remover...");
      const { removeBackground } = await import("@imgly/background-removal");
      const resultBlob = await removeBackground(fileOrBlob, {
        progress: (key, current, total) => {
          if (onProgress && total > 0) {
            const pct = Math.min(99, Math.round((current / total) * 100));
            if (key && key.includes("fetch")) {
              onProgress(`Downloading AI model (${pct}%)...`);
            } else {
              onProgress(`Removing background (${pct}%)...`);
            }
          }
        },
      });
      if (onProgress) onProgress("Applying Etba3ly glowing orange backdrop...");
      return await loadImageElement(resultBlob);
    } catch (aiErr) {
      console.warn("AI background removal failed, using smart flood-fill fallback:", aiErr);
      if (onProgress) onProgress("Using smart edge background removal...");
    }
  }

  const rawImg = await loadImageElement(fileOrBlob);
  return removeBackgroundCornerFloodFill(rawImg);
}

/**
 * Full pipeline: takes an uploaded image File, removes its background,
 * composites it onto the Etba3ly Logo Glowing Orange background, and returns
 * { file, previewUrl, foregroundSource }.
 */
export async function processPartImageFile(file, options = {}, onProgress = null) {
  // Skip animated GIFs if user wants to keep animation, otherwise process image
  if (file.name && file.name.toLowerCase().endsWith(".gif") && options.preserveAnimatedGif) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      foregroundSource: null,
    };
  }

  const foregroundSource = await extractPartForeground(file, options, onProgress);
  const canvas = compositeForegroundOnLogoGlow(foregroundSource, options);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  const baseName = (file.name || "part").replace(/\.[^/.]+$/, "");
  const processedFile = new File([blob], `${baseName}_etba3ly_glow.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file: processedFile,
    originalFile: file,
    previewUrl,
    foregroundSource,
  };
}

/**
 * Re-composite an already-extracted foregroundSource with new studio settings
 * (e.g. when user drags the Glow Intensity or Part Scale slider) without re-running AI!
 */
export async function recompositeForeground(foregroundSource, originalName = "part", options = {}) {
  const canvas = compositeForegroundOnLogoGlow(foregroundSource, options);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  const baseName = originalName.replace(/\.[^/.]+$/, "");
  const processedFile = new File([blob], `${baseName}_etba3ly_glow.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
  const previewUrl = URL.createObjectURL(blob);
  return { file: processedFile, previewUrl };
}
