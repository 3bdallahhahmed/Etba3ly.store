import { useState, useEffect, useRef } from "react";
import {
  DEFAULT_STUDIO_OPTIONS,
  processPartImageFile,
  recompositeForeground,
} from "./partImageProcessor.js";
import { upscaleImageFile, isImageUpscalable, loadImage } from "./imageUpscaler.js";

export default function GalleryStudioUploader({
  files,
  onProcessedFilesChange,
  onProcessingStateChange,
}) {
  // Mode: "normal" (default untouched upload with optional upscale) vs "studio" (glow background)
  const [uploadMode, setUploadMode] = useState("normal");
  // Upscale factor for normal mode: 1 (original / untouched), 2 (2x HD), 4 (4x Ultra)
  const [upscaleFactor, setUpscaleFactor] = useState(1);
  const [studioOptions, setStudioOptions] = useState(DEFAULT_STUDIO_OPTIONS);
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Keep a ref of items to safely revoke object URLs on cleanup
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Reset when parent clears files (e.g. after successful submit)
  useEffect(() => {
    if (!files || files.length === 0) {
      if (itemsRef.current.length > 0) {
        itemsRef.current.forEach((it) => {
          if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
          if (it.previewUrl && it.previewUrl !== it.originalUrl) {
            URL.revokeObjectURL(it.previewUrl);
          }
        });
        setItems([]);
      }
    }
  }, [files]);

  // Sync processed files & processing state with parent
  useEffect(() => {
    const anyProcessing = items.some((it) => it.status && it.status !== "done" && it.status !== "ready");
    if (onProcessingStateChange) onProcessingStateChange(anyProcessing);
    if (!anyProcessing && onProcessedFilesChange) {
      const readyFiles = items.map((it) => it.processedFile || it.rawFile).filter(Boolean);
      onProcessedFilesChange(readyFiles);
    }
  }, [items]);

  // Instant re-composite in studio mode when sliders change
  useEffect(() => {
    if (uploadMode !== "studio") return;
    let active = true;
    async function recompositeAll() {
      if (items.length === 0) return;
      const hasForegrounds = items.some((it) => it.foregroundSource && it.status === "done");
      if (!hasForegrounds) return;

      const updated = await Promise.all(
        items.map(async (it) => {
          if (!it.foregroundSource || it.status !== "done") return it;
          const res = await recompositeForeground(
            it.foregroundSource,
            it.rawFile.name,
            studioOptions
          );
          if (it.previewUrl && it.previewUrl !== it.originalUrl) {
            URL.revokeObjectURL(it.previewUrl);
          }
          return {
            ...it,
            processedFile: res.file,
            previewUrl: res.previewUrl,
          };
        })
      );
      if (active) setItems(updated);
    }
    recompositeAll();
    return () => {
      active = false;
    };
  }, [
    uploadMode,
    studioOptions.glowIntensity,
    studioOptions.partScale,
    studioOptions.aspectRatio,
    studioOptions.silhouetteGlow,
  ]);

  // Handle re-processing when upscaleFactor changes in normal mode
  async function handleUpscaleFactorChange(factor) {
    setUpscaleFactor(factor);
    if (items.length === 0 || uploadMode !== "normal") return;

    if (factor === 1) {
      // Revert all to original untouched files
      setItems((prev) =>
        prev.map((it) => {
          if (it.previewUrl && it.previewUrl !== it.originalUrl) {
            URL.revokeObjectURL(it.previewUrl);
          }
          return {
            ...it,
            processedFile: it.rawFile,
            previewUrl: it.originalUrl,
            scaleFactor: 1,
            upscaledDimensions: null,
            status: "ready",
            statusMessage: "Original (Untouched)",
          };
        })
      );
      return;
    }

    // Upscale each item with factor
    for (const item of items) {
      if (!isImageUpscalable(item.rawFile)) continue;
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, status: "processing", statusMessage: `Upscaling ${factor}x...` }
            : x
        )
      );

      try {
        const res = await upscaleImageFile(item.rawFile, factor);
        setItems((prev) =>
          prev.map((x) => {
            if (x.id !== item.id) return x;
            if (x.previewUrl && x.previewUrl !== x.originalUrl) {
              URL.revokeObjectURL(x.previewUrl);
            }
            return {
              ...x,
              processedFile: res.file,
              previewUrl: res.previewUrl,
              scaleFactor: factor,
              upscaledDimensions: { width: res.width, height: res.height },
              status: "done",
              statusMessage: `Upscaled ${factor}x HD`,
            };
          })
        );
      } catch (err) {
        console.error("Upscale failed for item:", item.rawFile.name, err);
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  processedFile: x.rawFile,
                  previewUrl: x.originalUrl,
                  scaleFactor: 1,
                  status: "ready",
                  statusMessage: "Original (Upscale failed)",
                }
              : x
          )
        );
      }
    }
  }

  // Toggle single item upscale
  async function handleToggleItemUpscale(item, targetFactor = 2) {
    if (item.scaleFactor === targetFactor) {
      // Revert this item to original
      if (item.previewUrl && item.previewUrl !== item.originalUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                processedFile: x.rawFile,
                previewUrl: x.originalUrl,
                scaleFactor: 1,
                upscaledDimensions: null,
                status: "ready",
                statusMessage: "Original (Untouched)",
              }
            : x
        )
      );
      return;
    }

    // Upscale this item
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? { ...x, status: "processing", statusMessage: `Upscaling ${targetFactor}x...` }
          : x
      )
    );

    try {
      const res = await upscaleImageFile(item.rawFile, targetFactor);
      setItems((prev) =>
        prev.map((x) => {
          if (x.id !== item.id) return x;
          if (x.previewUrl && x.previewUrl !== x.originalUrl) {
            URL.revokeObjectURL(x.previewUrl);
          }
          return {
            ...x,
            processedFile: res.file,
            previewUrl: res.previewUrl,
            scaleFactor: targetFactor,
            upscaledDimensions: { width: res.width, height: res.height },
            status: "done",
            statusMessage: `Upscaled ${targetFactor}x HD`,
          };
        })
      );
    } catch (err) {
      console.error("Single item upscale error:", err);
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                processedFile: x.rawFile,
                previewUrl: x.originalUrl,
                scaleFactor: 1,
                status: "ready",
                statusMessage: "Original",
              }
            : x
        )
      );
    }
  }

  // Process newly selected or dropped files
  async function processNewFiles(selectedFileList) {
    const rawArr = Array.from(selectedFileList || []);
    if (rawArr.length === 0) return;

    // Build initial entries
    const initialEntries = [];
    for (let idx = 0; idx < rawArr.length; idx++) {
      const file = rawArr[idx];
      const objectUrl = URL.createObjectURL(file);
      let dims = { width: null, height: null };
      try {
        const img = await loadImage(objectUrl);
        dims = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      } catch (dimErr) {
        console.warn("Could not read image dimensions:", dimErr);
      }

      const isNormal = uploadMode === "normal";
      const willUpscale = isNormal && upscaleFactor > 1 && isImageUpscalable(file);

      initialEntries.push({
        id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        rawFile: file,
        originalUrl: objectUrl,
        processedFile: file,
        previewUrl: objectUrl,
        dimensions: dims,
        upscaledDimensions: null,
        scaleFactor: willUpscale ? upscaleFactor : 1,
        foregroundSource: null,
        status: isNormal
          ? willUpscale
            ? "processing"
            : "ready"
          : "processing",
        statusMessage: isNormal
          ? willUpscale
            ? `Upscaling ${upscaleFactor}x...`
            : "Original (Untouched)"
          : studioOptions.autoRemoveBg
          ? "Removing background..."
          : "Applying glowing frame...",
        showOriginal: false,
      });
    }

    setItems((prev) => [...prev, ...initialEntries]);

    // Perform processing if needed
    for (const entry of initialEntries) {
      if (uploadMode === "normal") {
        if (upscaleFactor > 1 && isImageUpscalable(entry.rawFile)) {
          try {
            const upscaled = await upscaleImageFile(entry.rawFile, upscaleFactor);
            setItems((prev) =>
              prev.map((x) =>
                x.id === entry.id
                  ? {
                      ...x,
                      processedFile: upscaled.file,
                      previewUrl: upscaled.previewUrl,
                      upscaledDimensions: { width: upscaled.width, height: upscaled.height },
                      status: "done",
                      statusMessage: `Upscaled ${upscaleFactor}x HD`,
                    }
                  : x
              )
            );
          } catch (err) {
            console.error("Upscale error on upload:", err);
            setItems((prev) =>
              prev.map((x) =>
                x.id === entry.id
                  ? {
                      ...x,
                      processedFile: entry.rawFile,
                      previewUrl: entry.originalUrl,
                      scaleFactor: 1,
                      status: "ready",
                      statusMessage: "Original (Untouched)",
                    }
                  : x
              )
            );
          }
        }
      } else {
        // Studio Glow Mode: background removal & orange glow backdrop
        try {
          const result = await processPartImageFile(entry.rawFile, studioOptions, (msg) => {
            setItems((prev) =>
              prev.map((x) => (x.id === entry.id ? { ...x, statusMessage: msg } : x))
            );
          });
          setItems((prev) =>
            prev.map((x) =>
              x.id === entry.id
                ? {
                    ...x,
                    processedFile: result.file,
                    previewUrl: result.previewUrl,
                    foregroundSource: result.foregroundSource,
                    status: "done",
                    statusMessage: "Studio Glow Ready",
                  }
                : x
            )
          );
        } catch (err) {
          console.error("Studio mode processing failed:", err);
          setItems((prev) =>
            prev.map((x) =>
              x.id === entry.id
                ? {
                    ...x,
                    processedFile: entry.rawFile,
                    previewUrl: entry.originalUrl,
                    status: "done",
                    statusMessage: "Original (Processing failed)",
                  }
                : x
            )
          );
        }
      }
    }
  }

  // Switch between Normal and Studio mode
  async function handleSwitchMode(newMode) {
    if (newMode === uploadMode) return;
    setUploadMode(newMode);
    if (items.length === 0) return;

    if (newMode === "normal") {
      // Revert back to normal original files (or upscale according to upscaleFactor)
      items.forEach((it) => {
        if (it.previewUrl && it.previewUrl !== it.originalUrl) {
          URL.revokeObjectURL(it.previewUrl);
        }
      });
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          processedFile: it.rawFile,
          previewUrl: it.originalUrl,
          foregroundSource: null,
          scaleFactor: 1,
          upscaledDimensions: null,
          status: "ready",
          statusMessage: "Original (Untouched)",
        }))
      );
      if (upscaleFactor > 1) {
        handleUpscaleFactorChange(upscaleFactor);
      }
    } else {
      // Process existing files with Studio Glow
      const currentItems = [...items];
      for (const entry of currentItems) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === entry.id
              ? {
                  ...x,
                  status: "processing",
                  statusMessage: studioOptions.autoRemoveBg
                    ? "Removing background..."
                    : "Applying glowing frame...",
                }
              : x
          )
        );
        try {
          const result = await processPartImageFile(entry.rawFile, studioOptions, (msg) => {
            setItems((prev) =>
              prev.map((x) => (x.id === entry.id ? { ...x, statusMessage: msg } : x))
            );
          });
          setItems((prev) =>
            prev.map((x) =>
              x.id === entry.id
                ? {
                    ...x,
                    processedFile: result.file,
                    previewUrl: result.previewUrl,
                    foregroundSource: result.foregroundSource,
                    status: "done",
                    statusMessage: "Studio Glow Ready",
                  }
                : x
            )
          );
        } catch (err) {
          console.error("Studio mode processing failed:", err);
          setItems((prev) =>
            prev.map((x) => (x.id === entry.id ? { ...x, status: "done", statusMessage: "Original" } : x))
          );
        }
      }
    }
  }

  function handleRemoveItem(id) {
    setItems((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) {
        if (target.originalUrl) URL.revokeObjectURL(target.originalUrl);
        if (target.previewUrl && target.previewUrl !== target.originalUrl) {
          URL.revokeObjectURL(target.previewUrl);
        }
      }
      return prev.filter((x) => x.id !== id);
    });
  }

  function handleDownloadItem(item) {
    const url = item.previewUrl || item.originalUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = item.processedFile ? item.processedFile.name : item.rawFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Mode Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <label style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
          Gallery Product Media *
        </label>

        {/* Upload Mode Switcher */}
        <div
          style={{
            display: "inline-flex",
            borderRadius: "var(--radius-sm)",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--border-glass)",
            padding: 3,
            gap: 4,
          }}
        >
          <button
            type="button"
            className={`btn ${uploadMode === "normal" ? "btn-accent" : "btn-glass"}`}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: "calc(var(--radius-sm) - 2px)",
            }}
            onClick={() => handleSwitchMode("normal")}
          >
            Normal Photos (Original)
          </button>
          <button
            type="button"
            className={`btn ${uploadMode === "studio" ? "btn-accent" : "btn-glass"}`}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: "calc(var(--radius-sm) - 2px)",
            }}
            onClick={() => handleSwitchMode("studio")}
          >
            Studio Glow (Optional)
          </button>
        </div>
      </div>

      {/* Mode Description & Options Bar */}
      {uploadMode === "normal" ? (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-glass)",
            marginBottom: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text-primary)" }}>
              Normal Image Mode
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              Uploads standard photos directly without removing backgrounds or altering anything.
            </div>
          </div>

          {/* Upscale Option Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
              Upscale:
            </span>
            {[
              { label: "Original (1x)", factor: 1 },
              { label: "Upscale 2x (HD)", factor: 2 },
              { label: "Upscale 4x (Ultra HD)", factor: 4 },
            ].map(({ label, factor }) => (
              <button
                key={factor}
                type="button"
                className={`btn ${upscaleFactor === factor ? "btn-accent" : "btn-glass"}`}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: upscaleFactor === factor ? 700 : 500,
                }}
                onClick={() => handleUpscaleFactorChange(factor)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Studio Glow Controls */
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(255, 128, 0, 0.04)",
            border: "1px solid rgba(255, 128, 0, 0.25)",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: 0,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
                color: "var(--text-primary)",
              }}
            >
              <input
                type="checkbox"
                checked={studioOptions.autoRemoveBg}
                onChange={(e) =>
                  setStudioOptions((p) => ({ ...p, autoRemoveBg: e.target.checked }))
                }
                style={{ width: 16, height: 16 }}
              />
              Auto-Remove Background & Apply Orange Logo Glow
            </label>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>
                Frame:
              </span>
              {["4:3", "1:1", "16:9", "original"].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  className={`btn ${studioOptions.aspectRatio === ratio ? "btn-accent" : "btn-glass"}`}
                  style={{ padding: "3px 9px", fontSize: 11 }}
                  onClick={() => setStudioOptions((p) => ({ ...p, aspectRatio: ratio }))}
                >
                  {ratio === "original" ? "Original" : ratio}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, marginBottom: 4, display: "block" }}>
                Orange Glow Intensity ({Math.round(studioOptions.glowIntensity * 100)}%)
              </label>
              <input
                type="range"
                min="0.3"
                max="1.8"
                step="0.05"
                value={studioOptions.glowIntensity}
                onChange={(e) =>
                  setStudioOptions((p) => ({ ...p, glowIntensity: parseFloat(e.target.value) }))
                }
                style={{ width: "100%", padding: 0 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, marginBottom: 4, display: "block" }}>
                Part Size ({Math.round(studioOptions.partScale * 100)}%)
              </label>
              <input
                type="range"
                min="0.45"
                max="0.92"
                step="0.02"
                value={studioOptions.partScale}
                onChange={(e) =>
                  setStudioOptions((p) => ({ ...p, partScale: parseFloat(e.target.value) }))
                }
                style={{ width: "100%", padding: 0 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop File Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) {
            processNewFiles(e.dataTransfer.files);
          }
        }}
        style={{
          padding: "24px 18px",
          border: isDragging
            ? "2px dashed var(--accent)"
            : "2px dashed rgba(255, 255, 255, 0.2)",
          borderRadius: "var(--radius-sm)",
          background: isDragging
            ? "rgba(255, 128, 0, 0.12)"
            : "rgba(255, 255, 255, 0.02)",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: items.length > 0 ? 16 : 0,
          transition: "all 0.2s ease",
        }}
      >
        <input
          type="file"
          multiple
          accept="image/*,.gif"
          id="galleryStudioFileInput"
          style={{ display: "none" }}
          onChange={(e) => {
            processNewFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor="galleryStudioFileInput"
          style={{ cursor: "pointer", display: "block", margin: 0 }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
            Drag and Drop Photos Here or Click to Browse
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {uploadMode === "normal"
              ? upscaleFactor > 1
                ? `Normal photo upload with automatic ${upscaleFactor}x HD upscaling`
                : "Normal photo upload in original quality without background removal"
              : "Studio glow mode removes background and applies glowing orange backdrop"}
          </div>
        </label>
      </div>

      {/* Selected Items Grid */}
      {items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {items.map((item) => {
            const isWorking = item.status === "processing";
            const displayUrl = item.showOriginal
              ? item.originalUrl
              : item.previewUrl || item.originalUrl;
            const sizeKB = item.processedFile
              ? Math.round(item.processedFile.size / 1024)
              : Math.round(item.rawFile.size / 1024);

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  border:
                    uploadMode === "studio"
                      ? "1px solid rgba(255, 128, 0, 0.3)"
                      : "1px solid var(--border-glass)",
                  background: "rgba(15, 15, 22, 0.85)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Image Container */}
                <div
                  style={{
                    height: 165,
                    position: "relative",
                    background:
                      uploadMode === "studio"
                        ? "radial-gradient(circle at 50% 50%, rgba(255, 136, 15, 0.42) 0%, rgba(255, 108, 10, 0.24) 30%, rgba(255, 128, 0, 0) 65%), radial-gradient(circle at 50% 50%, #5C2E0C 0%, #3A1E0C 22%, #27180D 42%, #18100E 64%, #110E0F 82%, #0A0A0F 100%)"
                        : "#0a0a0f",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isWorking ? (
                    <div style={{ textAlign: "center", padding: 16 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          border: "3px solid rgba(255, 128, 0, 0.25)",
                          borderTopColor: "var(--accent)",
                          borderRadius: "50%",
                          animation: "spin 0.9s linear infinite",
                          margin: "0 auto 8px",
                        }}
                      />
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                        {item.statusMessage || "Processing..."}
                      </div>
                    </div>
                  ) : (
                    <img
                      src={displayUrl}
                      alt={item.rawFile.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: uploadMode === "studio" ? "cover" : "contain",
                      }}
                    />
                  )}

                  {/* Resolution & Status Badge */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 6,
                      left: 6,
                      right: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        background: "rgba(0, 0, 0, 0.75)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "#fff",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      {item.upscaledDimensions
                        ? `${item.upscaledDimensions.width}x${item.upscaledDimensions.height} (${item.scaleFactor}x HD)`
                        : item.dimensions.width
                        ? `${item.dimensions.width}x${item.dimensions.height}`
                        : `${sizeKB} KB`}
                    </span>
                    {item.scaleFactor > 1 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          background: "rgba(59, 130, 246, 0.85)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: "#fff",
                        }}
                      >
                        {item.scaleFactor}x HD
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Info & Controls */}
                <div style={{ padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.rawFile.name}
                  >
                    {item.rawFile.name}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 4,
                    }}
                  >
                    {uploadMode === "normal" ? (
                      isImageUpscalable(item.rawFile) && (
                        <button
                          type="button"
                          className="btn btn-glass"
                          style={{
                            padding: "3px 6px",
                            fontSize: 10,
                            flex: 1,
                            background:
                              item.scaleFactor > 1
                                ? "rgba(59, 130, 246, 0.2)"
                                : "rgba(255, 255, 255, 0.08)",
                            color: item.scaleFactor > 1 ? "#60A5FA" : "var(--text-secondary)",
                            border:
                              item.scaleFactor > 1
                                ? "1px solid rgba(59, 130, 246, 0.4)"
                                : "1px solid var(--border-glass)",
                          }}
                          disabled={isWorking}
                          onClick={() =>
                            handleToggleItemUpscale(
                              item,
                              item.scaleFactor === 1 ? 2 : 1
                            )
                          }
                          title={
                            item.scaleFactor > 1
                              ? "Revert to original resolution"
                              : "Upscale 2x High Definition"
                          }
                        >
                          {item.scaleFactor > 1 ? "Reset 1x" : "Upscale 2x"}
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn btn-glass"
                        style={{ padding: "3px 6px", fontSize: 10, flex: 1 }}
                        disabled={isWorking}
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((x) =>
                              x.id === item.id ? { ...x, showOriginal: !x.showOriginal } : x
                            )
                          )
                        }
                      >
                        {item.showOriginal ? "Show Glow" : "Original"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-glass"
                      style={{ padding: "3px 6px", fontSize: 10, flex: 1 }}
                      disabled={isWorking}
                      onClick={() => handleDownloadItem(item)}
                    >
                      Download
                    </button>

                    <button
                      type="button"
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        background: "#FF3B30",
                        color: "#fff",
                        border: "none",
                        borderRadius: "var(--radius-full)",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      onClick={() => handleRemoveItem(item.id)}
                      title="Remove image"
                    >
                      X
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
