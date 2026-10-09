import React, { useState, useEffect } from "react";
import {
  DEFAULT_STUDIO_OPTIONS,
  processPartImageFile,
  recompositeForeground,
} from "./partImageProcessor.js";

export default function GalleryStudioUploader({
  files,
  onProcessedFilesChange,
  onProcessingStateChange,
}) {
  const [studioOptions, setStudioOptions] = useState(DEFAULT_STUDIO_OPTIONS);
  const [items, setItems] = useState([]); // [{ id, rawFile, originalUrl, processedFile, previewUrl, foregroundSource, status, showOriginal }]
  const [isDragging, setIsDragging] = useState(false);

  // Reset when parent clears files (e.g., after successful upload)
  useEffect(() => {
    if (!files || files.length === 0) {
      if (items.length > 0) {
        items.forEach((it) => {
          if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
          if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        });
        setItems([]);
      }
    }
  }, [files]);

  // Sync processed files & processing status up to parent
  useEffect(() => {
    const anyProcessing = items.some((it) => it.status && it.status !== "done");
    if (onProcessingStateChange) onProcessingStateChange(anyProcessing);
    if (!anyProcessing && onProcessedFilesChange) {
      const readyFiles = items.map((it) => it.processedFile || it.rawFile).filter(Boolean);
      onProcessedFilesChange(readyFiles);
    }
  }, [items]);

  // Instant re-composite when sliders / ratio change (without re-running AI)
  useEffect(() => {
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
          if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
          return {
            ...it,
            processedFile: res.file,
            previewUrl: res.previewUrl,
          };
        })
      );
      if (active) {
        setItems(updated);
      }
    }
    recompositeAll();
    return () => {
      active = false;
    };
  }, [
    studioOptions.glowIntensity,
    studioOptions.partScale,
    studioOptions.aspectRatio,
    studioOptions.silhouetteGlow,
  ]);

  async function processNewFiles(selectedFileList, currentOpts = studioOptions) {
    const rawArr = Array.from(selectedFileList || []);
    if (rawArr.length === 0) return;

    const initialEntries = rawArr.map((file, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      rawFile: file,
      originalUrl: URL.createObjectURL(file),
      processedFile: file,
      previewUrl: null,
      foregroundSource: null,
      status: currentOpts.autoRemoveBg
        ? "Removing background..."
        : "Applying glowing frame...",
      showOriginal: false,
    }));

    setItems((prev) => [...prev, ...initialEntries]);

    for (const entry of initialEntries) {
      try {
        const result = await processPartImageFile(entry.rawFile, currentOpts, (msg) => {
          setItems((prev) =>
            prev.map((x) => (x.id === entry.id ? { ...x, status: msg } : x))
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
                }
              : x
          )
        );
      } catch (err) {
        console.error("Failed to process gallery image:", err);
        setItems((prev) =>
          prev.map((x) =>
            x.id === entry.id
              ? {
                  ...x,
                  processedFile: entry.rawFile,
                  previewUrl: entry.originalUrl,
                  status: "done",
                }
              : x
          )
        );
      }
    }
  }

  async function handleToggleAutoRemove(checked) {
    const nextOpts = { ...studioOptions, autoRemoveBg: checked };
    setStudioOptions(nextOpts);
    if (items.length === 0) return;

    const rawFilesToReprocess = items.map((it) => it.rawFile);
    items.forEach((it) => {
      if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    });
    setItems([]);
    await processNewFiles(rawFilesToReprocess, nextOpts);
  }

  function handleRemoveItem(id) {
    setItems((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) {
        if (target.originalUrl) URL.revokeObjectURL(target.originalUrl);
        if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((x) => x.id !== id);
    });
  }

  function handleDownloadItem(item) {
    const url = item.previewUrl || item.originalUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = item.processedFile ? item.processedFile.name : "etba3ly_part_glow.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <label style={{ margin: 0 }}>
          3D Printed Part Images / GIFs * (Auto Background Removal + Glowing Orange BG)
        </label>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--accent)",
            background: "rgba(255, 128, 0, 0.12)",
            padding: "3px 10px",
            borderRadius: "var(--radius-full)",
            border: "1px solid rgba(255, 128, 0, 0.25)",
          }}
        >
          Etba3ly Logo Glow Active
        </span>
      </div>

      {/* Dropzone */}
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
          padding: "22px 18px",
          border: isDragging
            ? "2px dashed var(--accent)"
            : "2px dashed rgba(255, 128, 0, 0.4)",
          borderRadius: "var(--radius-sm)",
          background: isDragging
            ? "rgba(255, 128, 0, 0.12)"
            : "rgba(255, 128, 0, 0.05)",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 14,
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
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
            Drag & Drop 3D Part Photos Here or Click to Select
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Automatically removes background and applies the glowing orange Etba3ly logo background
          </div>
        </label>
      </div>

      {/* Studio Controls */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border-glass)",
          marginBottom: items.length > 0 ? 16 : 0,
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
              onChange={(e) => handleToggleAutoRemove(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Auto-Remove Background & Apply Logo Glowing Orange
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

      {/* Live Preview Grid */}
      {items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {items.map((item) => {
            const isWorking = item.status !== "done";
            const displayUrl = item.showOriginal
              ? item.originalUrl
              : item.previewUrl || item.originalUrl;

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  border: "1px solid rgba(255, 128, 0, 0.3)",
                  background: "rgba(15, 15, 22, 0.85)",
                }}
              >
                <div
                  style={{
                    height: 165,
                    position: "relative",
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(255, 136, 15, 0.42) 0%, rgba(255, 108, 10, 0.24) 30%, rgba(255, 128, 0, 0) 65%), radial-gradient(circle at 50% 50%, #5C2E0C 0%, #3A1E0C 22%, #27180D 42%, #18100E 64%, #110E0F 82%, #0A0A0F 100%)",
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
                          border: "3px solid rgba(255,128,0,0.25)",
                          borderTopColor: "#FF8000",
                          borderRadius: "50%",
                          animation: "spin 0.9s linear infinite",
                          margin: "0 auto 8px",
                        }}
                      />
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#FFB347" }}>
                        {item.status}
                      </div>
                    </div>
                  ) : (
                    <img
                      src={displayUrl}
                      alt={item.rawFile.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                </div>

                <div
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-glass"
                    style={{ padding: "4px 8px", fontSize: 10, flex: 1 }}
                    disabled={isWorking}
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === item.id ? { ...x, showOriginal: !x.showOriginal } : x
                        )
                      )
                    }
                  >
                    {item.showOriginal ? "Show Glow BG" : "Original"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-accent"
                    style={{ padding: "4px 8px", fontSize: 10, flex: 1 }}
                    disabled={isWorking}
                    onClick={() => handleDownloadItem(item)}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "4px 8px",
                      fontSize: 10,
                      background: "#FF3B30",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-full)",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    X
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
