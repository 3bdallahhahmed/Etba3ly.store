/**
 * High-definition client-side image upscaler with adaptive edge enhancement.
 * Performs high-quality bicubic resampling + unsharp masking to restore crisp
 * textures, layer lines, and edge detail without external network dependencies.
 */

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadImage is browser-only"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    let objectUrl = null;

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image: " + (err?.message || "format error")));
    };

    if (source instanceof Blob || source instanceof File) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof HTMLImageElement || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)) {
      resolve(source);
    } else {
      reject(new Error("Unsupported image source"));
    }
  });
}

/**
 * Apply separable binomial unsharp mask to ImageData.
 * radius: 1 (fast 3-tap binomial filter: [1, 2, 1] / 4)
 * amount: 0.35 - 0.65 (default 0.45)
 * threshold: prevents amplifying flat-area noise or compression artifacts
 */
export function applyUnsharpMask(imageData, amount = 0.45, threshold = 3) {
  const { width, height, data } = imageData;
  const temp = new Float32Array(width * height * 3);

  // Horizontal blur pass [1, 2, 1] / 4
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const xPrev = x > 0 ? (rowOffset + x - 1) * 4 : idx;
      const xNext = x < width - 1 ? (rowOffset + x + 1) * 4 : idx;
      const tIdx = (rowOffset + x) * 3;

      temp[tIdx] = (data[xPrev] + data[idx] * 2 + data[xNext]) * 0.25;
      temp[tIdx + 1] = (data[xPrev + 1] + data[idx + 1] * 2 + data[xNext + 1]) * 0.25;
      temp[tIdx + 2] = (data[xPrev + 2] + data[idx + 2] * 2 + data[xNext + 2]) * 0.25;
    }
  }

  // Vertical blur pass + difference addition back to original data
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const yPrev = y > 0 ? y - 1 : y;
      const yNext = y < height - 1 ? y + 1 : y;

      const tIdxPrev = (yPrev * width + x) * 3;
      const tIdxCurr = (y * width + x) * 3;
      const tIdxNext = (yNext * width + x) * 3;

      const blurR = (temp[tIdxPrev] + temp[tIdxCurr] * 2 + temp[tIdxNext]) * 0.25;
      const blurG = (temp[tIdxPrev + 1] + temp[tIdxCurr + 1] * 2 + temp[tIdxNext + 1]) * 0.25;
      const blurB = (temp[tIdxPrev + 2] + temp[tIdxCurr + 2] * 2 + temp[tIdxNext + 2]) * 0.25;

      const pIdx = (y * width + x) * 4;
      const r = data[pIdx];
      const g = data[pIdx + 1];
      const b = data[pIdx + 2];

      const diffR = r - blurR;
      const diffG = g - blurG;
      const diffB = b - blurB;

      if (Math.abs(diffR) >= threshold) {
        data[pIdx] = Math.min(255, Math.max(0, Math.round(r + diffR * amount)));
      }
      if (Math.abs(diffG) >= threshold) {
        data[pIdx + 1] = Math.min(255, Math.max(0, Math.round(g + diffG * amount)));
      }
      if (Math.abs(diffB) >= threshold) {
        data[pIdx + 2] = Math.min(255, Math.max(0, Math.round(b + diffB * amount)));
      }
      // Alpha channel remains completely untouched
    }
  }
}

/**
 * Check if a file or URL can be upscaled (skips animated GIFs and SVGs).
 */
export function isImageUpscalable(source) {
  if (!source) return false;
  const name = typeof source === "string" ? source : (source.name || source.type || "");
  const lower = name.toLowerCase();
  if (lower.endsWith(".gif") || lower.includes("image/gif")) return false;
  if (lower.endsWith(".svg") || lower.includes("image/svg")) return false;
  return true;
}

/**
 * Upscale an image file, blob, or url by scaleFactor (e.g. 2 or 4).
 * Returns high-definition File with enhanced detail.
 */
export async function upscaleImageSource(source, scaleFactor = 2, options = {}) {
  const {
    enableSharpening = true,
    sharpenAmount = scaleFactor >= 4 ? 0.55 : 0.42,
    sharpenThreshold = 3,
    maxDimension = 4096,
  } = options;

  const img = await loadImage(source);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  if (!origW || !origH) {
    throw new Error("Invalid image dimensions");
  }

  let targetW = Math.round(origW * scaleFactor);
  let targetH = Math.round(origH * scaleFactor);

  // Clamp to safe max dimension to prevent browser canvas memory limits
  if (targetW > maxDimension || targetH > maxDimension) {
    const clampRatio = maxDimension / Math.max(targetW, targetH);
    targetW = Math.max(origW, Math.round(targetW * clampRatio));
    targetH = Math.max(origH, Math.round(targetH * clampRatio));
  }

  // If already at or above max allowed dimension, no scaling needed
  if (targetW <= origW && targetH <= origH) {
    if (source instanceof File) {
      return {
        file: source,
        previewUrl: URL.createObjectURL(source),
        originalWidth: origW,
        originalHeight: origH,
        width: origW,
        height: origH,
        scaleFactor: 1,
      };
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // For 4x scaling, perform multi-step 2-stage interpolation for smoother gradients
  if (scaleFactor >= 4 && targetW >= origW * 3) {
    const midW = Math.round(origW * 2);
    const midH = Math.round(origH * 2);
    const midCanvas = document.createElement("canvas");
    midCanvas.width = midW;
    midCanvas.height = midH;
    const midCtx = midCanvas.getContext("2d");
    midCtx.imageSmoothingEnabled = true;
    midCtx.imageSmoothingQuality = "high";
    midCtx.drawImage(img, 0, 0, midW, midH);

    ctx.drawImage(midCanvas, 0, 0, targetW, targetH);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }

  // Detail enhancement / unsharp mask pass
  if (enableSharpening) {
    try {
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      applyUnsharpMask(imgData, sharpenAmount, sharpenThreshold);
      ctx.putImageData(imgData, 0, 0);
    } catch (procErr) {
      console.warn("Could not apply unsharp mask, using bicubic canvas output:", procErr);
    }
  }

  // Determine output MIME type & quality
  let mimeType = "image/png";
  let extension = "png";
  let quality = 0.94;

  const originalType = source instanceof File || source instanceof Blob ? source.type : "";
  const originalName = source instanceof File ? source.name : typeof source === "string" ? source : "image.png";

  if (originalType === "image/jpeg" || originalName.toLowerCase().match(/\.jpe?g$/)) {
    mimeType = "image/jpeg";
    extension = "jpg";
    quality = 0.94;
  } else if (originalType === "image/webp" || originalName.toLowerCase().endsWith(".webp")) {
    mimeType = "image/webp";
    extension = "webp";
    quality = 0.94;
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  const baseName = originalName.replace(/\.[^/.]+$/, "").replace(/_upscaled_[0-9]+x/g, "");
  const newFileName = `${baseName}_upscaled_${scaleFactor}x.${extension}`;

  const newFile = new File([blob], newFileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file: newFile,
    blob,
    previewUrl,
    originalWidth: origW,
    originalHeight: origH,
    width: targetW,
    height: targetH,
    scaleFactor,
  };
}

/**
 * Upscale a File object
 */
export async function upscaleImageFile(file, scaleFactor = 2, options = {}) {
  if (!isImageUpscalable(file)) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      originalWidth: null,
      originalHeight: null,
      width: null,
      height: null,
      scaleFactor: 1,
    };
  }
  return await upscaleImageSource(file, scaleFactor, options);
}
