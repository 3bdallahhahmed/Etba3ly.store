import React, { useState, useRef, useEffect } from "react";
import STLViewer from "../slicer/STLViewer.jsx";
import { SERVICE_TIERS } from "./ServiceTierSelector.jsx";

const QUALITY_OPTIONS = [
  {
    id: "economy",
    title: "Fast",
    subtitle: "Quicker & budget",
    layerHeight: SERVICE_TIERS.economy.layerHeight,
    infill: SERVICE_TIERS.economy.infill,
    nozzle: SERVICE_TIERS.economy.nozzle
  },
  {
    id: "standard",
    title: "Standard",
    subtitle: "Balanced finish",
    layerHeight: SERVICE_TIERS.standard.layerHeight,
    infill: SERVICE_TIERS.standard.infill,
    nozzle: SERVICE_TIERS.standard.nozzle
  },
  {
    id: "professional",
    title: "Fine",
    subtitle: "Smooth detail",
    layerHeight: SERVICE_TIERS.professional.layerHeight,
    infill: SERVICE_TIERS.professional.infill,
    nozzle: SERVICE_TIERS.professional.nozzle
  }
];

function formatDurationShort(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "--";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.max(1, Math.round((totalSeconds % 3600) / 60));
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function getQualityLabel(tier, layerHeight, infill) {
  if (tier === "economy") return "Fast";
  if (tier === "standard") return "Standard";
  if (tier === "professional") return "Fine";
  return `Custom (${Number(layerHeight || 0.2).toFixed(2)}mm, ${infill || 20}%)`;
}

function UploadCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CubeMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ArchiveMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LinkChainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function OrderFlow({
  orderStep,
  setOrderStep,
  orderItems,
  itemEstimates,
  orderSummary,
  newOrder,
  setNewOrder,
  config,
  materialRates,
  selectedTier,
  setSelectedTier,
  orderInfill,
  setOrderInfill,
  orderLayerHeight,
  setOrderLayerHeight,
  orderNozzle,
  setOrderNozzle,
  enableSupports,
  setEnableSupports,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileChange,
  onUpdateItemQty,
  onRemoveItem,
  onClearItems,
  fileError,
  formErrors,
  setFormErrors,
  handlePhoneChange,
  handleOrderSubmit,
  isUploading,
  successModal,
  lastSubmittedQuote,
  copiedTrackingCode,
  setCopiedTrackingCode,
  copyToClipboard,
  addToast,
  navigateTo,
  getColorHex,
  isValidEmail,
  isValidEgyptPhone,
  isValidUrl,
  normalizeUrl,
  getPlatformFromUrl,
  onResetOrderFlow
}) {
  const fileInputRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const previewDialogRef = useRef(null);

  const [showLinkInput, setShowLinkInput] = useState(Boolean(newOrder.fileLink));
  const [showCustomPrint, setShowCustomPrint] = useState(false);
  const [inspectingItem, setInspectingItem] = useState(null);
  const [touchedDetails, setTouchedDetails] = useState({});

  const isLinkVisible = showLinkInput || Boolean(newOrder.fileLink);

  // Keep viewport cleanly framed and accessible on step transitions
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const timer = setTimeout(() => {
      if (stepHeadingRef.current) {
        stepHeadingRef.current.focus({ preventScroll: true });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [orderStep]);

  // Native modal dialog open/close + Safari closedby="any" light-dismiss fallback
  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;

    if (inspectingItem) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [inspectingItem]);

  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Resolve materials list cleanly
  const availableMaterials = React.useMemo(() => {
    if (materialRates && Object.keys(materialRates).length > 0) {
      return Object.entries(materialRates).map(([key, m]) => ({
        key,
        name: m.name,
        rate: Number(m.selling_rate) || Number(config.price_per_gram) || 3.5,
        inStock: m.in_stock !== false
      }));
    }
    if (config.materials) {
      return config.materials
        .split(",")
        .map((raw) => {
          const s = raw.trim();
          const isRestocking = s.toLowerCase().includes("[restocking]");
          const cleanName = s
            .replace(/\[restocking\]/gi, "")
            .replace(/\[rate:[\d.]+\]/gi, "")
            .replace(/\[cost:[\d.]+\]/gi, "")
            .trim();
          if (!cleanName) return null;
          return {
            key: cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            name: cleanName,
            rate: Number(config.price_per_gram) || 3.5,
            inStock: !isRestocking
          };
        })
        .filter(Boolean);
    }
    return [{ key: "pla", name: "PLA", rate: 3.5, inStock: true }];
  }, [materialRates, config.materials, config.price_per_gram]);

  const availableColors = React.useMemo(() => {
    return (config.colors || "White, Black, Silver, Red")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }, [config.colors]);

  // Estimate lookup map by item id
  const estimateById = React.useMemo(() => {
    const map = {};
    (itemEstimates || []).forEach((entry) => {
      if (entry && entry.id) {
        map[entry.id] = entry.estimate;
      }
    });
    return map;
  }, [itemEstimates]);

  function handleSelectQuality(opt) {
    setSelectedTier(opt.id);
    setOrderLayerHeight(opt.layerHeight);
    setOrderInfill(opt.infill);
    setOrderNozzle(opt.nozzle);
  }

  function handleContinueToDetails() {
    const errors = {};
    const cleanLink = (newOrder.fileLink || "").trim();
    const hasFiles = orderItems.length > 0;
    const hasLink = Boolean(cleanLink);

    if (!hasFiles && !hasLink) {
      errors.file = "Add at least one 3D model file or paste a model link to continue.";
    }
    if (hasLink && !isValidUrl(cleanLink)) {
      errors.fileLink = "Please enter a valid URL starting with https:// or http://";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length === 0) {
      setOrderStep(2);
    }
  }

  function validateDetailField(field, value) {
    if (field === "name") {
      return !String(value || "").trim() ? "Please enter your full name." : null;
    }
    if (field === "phone") {
      if (!String(value || "").trim()) return "Please enter your Egyptian phone number.";
      if (!isValidEgyptPhone(value)) return "Enter an 11-digit Egyptian number (e.g. 010 1234 5678).";
      return null;
    }
    if (field === "email") {
      if (!String(value || "").trim()) return "Please enter your email address.";
      if (!isValidEmail(value)) return "Enter an email address like you@example.com.";
      return null;
    }
    return null;
  }

  function handleDetailBlur(field) {
    setTouchedDetails((prev) => ({ ...prev, [field]: true }));
    const err = validateDetailField(field, newOrder[field]);
    setFormErrors((prev) => ({ ...prev, [field]: err }));
  }

  function handleDetailsSubmit(e) {
    e.preventDefault();
    const nameErr = validateDetailField("name", newOrder.name);
    const phoneErr = validateDetailField("phone", newOrder.phone);
    const emailErr = validateDetailField("email", newOrder.email);

    setTouchedDetails({ name: true, phone: true, email: true });
    const nextErrors = {};
    if (nameErr) nextErrors.name = nameErr;
    if (phoneErr) nextErrors.phone = phoneErr;
    if (emailErr) nextErrors.email = emailErr;

    setFormErrors((prev) => ({
      ...prev,
      name: nameErr,
      phone: phoneErr,
      email: emailErr
    }));

    if (nameErr) {
      nameInputRef.current?.focus();
      return;
    }
    if (phoneErr) {
      phoneInputRef.current?.focus();
      return;
    }
    if (emailErr) {
      emailInputRef.current?.focus();
      return;
    }

    setOrderStep(3);
  }

  const stepsMeta = [
    { num: 1, label: "Models" },
    { num: 2, label: "Details" },
    { num: 3, label: "Review" },
    { num: 4, label: "Submitted" }
  ];

  const headingByStep = {
    1: "Upload & Configure",
    2: "Your Details",
    3: "Review Your Order",
    4: "Order Submitted"
  };

  const subtitleByStep = {
    1: "Add one or more models, choose quantities, and get an instant price.",
    2: "Tell us where to reach you when your print is ready.",
    3: "Check your parts, settings, and total before sending to the printer queue.",
    4: "Your files are in our queue. Use your tracking code anytime."
  };

  const compactSummaryPriceText = orderSummary.hasSlicedWeight
    ? `${orderSummary.estimatedTotal} EGP`
    : orderSummary.hasPendingQuoteItems
    ? "Quote on review"
    : "--";

  return (
    <section className="order-page-section animate-in">
      <div className="order-page-shell">
        {/* Header & 4-Step Progress Indicator */}
        <header className="order-header">
          {orderStep === 1 && (
            <div className="order-header-top">
              <a
                href="/home"
                className="order-home-link"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("home");
                }}
              >
                &larr; Back to Home
              </a>
            </div>
          )}
          <h1 ref={stepHeadingRef} tabIndex={-1} className="order-title">
            {headingByStep[orderStep]}
          </h1>
          <p className="order-subtitle">{subtitleByStep[orderStep]}</p>

          <nav aria-label="Order progress" className="order-stepper-nav">
            <ol className="stepper order-classic-stepper">
              {stepsMeta.map((st, idx) => {
                const isCompleted = orderStep > st.num || (orderStep === 4 && st.num === 4);
                const isActive = orderStep === st.num && orderStep < 4;
                const canJumpBack = orderStep < 4 && st.num < orderStep;
                return (
                  <React.Fragment key={st.num}>
                    {idx > 0 && (
                      <li
                        aria-hidden="true"
                        className={`stepper-line ${orderStep > st.num - 1 ? "filled" : ""}`}
                      />
                    )}
                    <li
                      className={`stepper-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                      aria-current={orderStep === st.num ? "step" : undefined}
                    >
                      {canJumpBack ? (
                        <button
                          type="button"
                          className="stepper-step-trigger"
                          onClick={() => setOrderStep(st.num)}
                        >
                          <span className="stepper-dot">
                            <CheckMarkIcon />
                          </span>
                          <span className="stepper-label">{st.label}</span>
                        </button>
                      ) : (
                        <>
                          <span className="stepper-dot">
                            {isCompleted ? <CheckMarkIcon /> : st.num}
                          </span>
                          <span className="stepper-label">{st.label}</span>
                        </>
                      )}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          </nav>
        </header>

        {/* STEP 1: UPLOAD MODELS & PRINT SETUP */}
        {orderStep === 1 && (
          <div className="order-workspace-grid animate-in">
            {/* LEFT COLUMN: Models & Quantities */}
            <div
              className={`order-panel order-models-panel ${isDragging ? "is-dragging" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                id="orderFileInput"
                type="file"
                multiple
                accept=".stl,.zip,.rar"
                onChange={(e) => {
                  handleFileChange(e);
                  e.target.value = "";
                }}
                className="sr-only"
              />

              <div className="order-panel-head">
                <div>
                  <h2 className="order-panel-title">1. Your 3D Models</h2>
                  <p className="order-panel-caption">
                    Upload one or more files, then adjust quantity for each part.
                  </p>
                </div>
                {orderItems.length > 0 && (
                  <div className="order-head-actions">
                    <button
                      type="button"
                      className="order-btn order-btn-secondary order-btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      + Add Files
                    </button>
                    <button
                      type="button"
                      className="order-btn order-btn-ghost order-btn-sm"
                      onClick={onClearItems}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {orderItems.length === 0 ? (
                <div
                  className={`order-dropzone ${isDragging ? "active" : ""} ${formErrors.file ? "has-error" : ""}`}
                  onClick={(e) => {
                    if (e.target.closest("button")) return;
                    fileInputRef.current?.click();
                  }}
                >
                  <div className="order-dropzone-icon">
                    <UploadCloudIcon />
                  </div>
                  <div className="order-dropzone-title">Drop your 3D files here</div>
                  <div className="order-dropzone-sub">
                    Supports .STL, .ZIP, or .RAR — select multiple models at once
                  </div>
                  <button
                    type="button"
                    className="order-btn order-btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose 3D Files
                  </button>
                </div>
              ) : (
                <ul className="order-parts-list" aria-label="Uploaded 3D models">
                  {orderItems.map((item) => {
                    const est = estimateById[item.id];
                    const unitWeight = est ? Number(est.totalWeightGrams ?? est.weightGrams ?? 0) : 0;
                    const lineWeight = Math.round(unitWeight * item.quantity * 100) / 100;
                    const dims = est?.metrics;
                    const fitsBed = est ? est.fitsBed : true;

                    return (
                      <li key={item.id} className="order-part-row">
                        <div className="order-part-thumb" aria-hidden={!item.thumbnail ? "true" : undefined}>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={`Preview of ${item.name}`} />
                          ) : item.kind === "archive" ? (
                            <ArchiveMiniIcon />
                          ) : (
                            <CubeMiniIcon />
                          )}
                        </div>

                        <div className="order-part-meta">
                          <div className="order-part-name-row">
                            <span className="order-part-name" title={item.name}>
                              {item.name}
                            </span>
                            {!fitsBed && (
                              <span className="order-part-warn">Exceeds 256mm bed</span>
                            )}
                          </div>
                          <div className="order-part-specs">
                            {item.kind === "archive" ? (
                              <span>Archive verified &middot; Quoted on review</span>
                            ) : est ? (
                              <span>
                                {unitWeight.toFixed(1)} g each
                                {item.quantity > 1 ? ` (${lineWeight.toFixed(1)} g total)` : ""}
                                {dims ? ` · ${dims.width}×${dims.depth}×${dims.height} mm` : ""}
                              </span>
                            ) : (
                              <span>{item.parseError ? "Workshop will verify size" : "Calculating..."}</span>
                            )}
                          </div>
                        </div>

                        <div className="order-part-controls">
                          {item.kind === "stl" && (
                            <button
                              type="button"
                              className="order-icon-btn order-inspect-btn"
                              onClick={() => setInspectingItem(item)}
                              aria-label={`Inspect ${item.name} in 3D`}
                              title="Inspect in 3D"
                            >
                              3D
                            </button>
                          )}

                          <div className="order-qty-stepper" role="group" aria-label={`Quantity for ${item.name}`}>
                            <button
                              type="button"
                              className="order-qty-btn"
                              disabled={item.quantity <= 1}
                              onClick={() => onUpdateItemQty(item.id, item.quantity - 1)}
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              &minus;
                            </button>
                            <span className="order-qty-val" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              className="order-qty-btn"
                              onClick={() => onUpdateItemQty(item.id, item.quantity + 1)}
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="order-icon-btn order-remove-btn"
                            onClick={() => onRemoveItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                            title="Remove model"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Subtle Secondary Model Link Toggle */}
              <div className="order-link-section">
                {!isLinkVisible ? (
                  <button
                    type="button"
                    className="order-link-toggle"
                    onClick={() => setShowLinkInput(true)}
                  >
                    <LinkChainIcon />
                    <span>Or paste a Printables / Thingiverse / Drive link instead</span>
                  </button>
                ) : (
                  <div className="order-link-box">
                    <div className="order-link-head">
                      <label htmlFor="order-model-link" className="order-label-inline">
                        Online 3D Model Link
                      </label>
                      {Boolean(newOrder.fileLink && isValidUrl(newOrder.fileLink)) && (
                        <span className="order-platform-tag">
                          {getPlatformFromUrl(newOrder.fileLink)?.name || "Web Link"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="order-link-remove"
                        onClick={() => {
                          setNewOrder((p) => ({ ...p, fileLink: "" }));
                          setShowLinkInput(false);
                          setFormErrors((prev) => ({ ...prev, fileLink: null }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      id="order-model-link"
                      name="fileLink"
                      type="url"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={newOrder.fileLink}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewOrder((p) => ({ ...p, fileLink: val }));
                        if (formErrors.file || formErrors.fileLink) {
                          setFormErrors((prev) => ({ ...prev, file: null, fileLink: null }));
                        }
                      }}
                      placeholder="https://www.printables.com/model/..."
                      aria-invalid={Boolean(formErrors.fileLink)}
                      className="order-input"
                    />
                  </div>
                )}
              </div>

              {(fileError || formErrors.file || formErrors.fileLink) && (
                <div role="alert" className="order-inline-error">
                  {fileError || formErrors.file || formErrors.fileLink}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Print Setup & Instant Price */}
            <div className="order-panel order-setup-panel">
              <div className="order-panel-head">
                <div>
                  <h2 className="order-panel-title">2. Print Setup</h2>
                  <p className="order-panel-caption">Applies to all models in this order.</p>
                </div>
              </div>

              {/* Material Dropdown */}
              <div className="order-field-group order-material-field">
                <div className="order-label-row">
                  <label htmlFor="order-material" className="order-field-label">
                    Material
                  </label>
                  <span className="order-legend-value">{orderSummary.activeRate.toFixed(2)} EGP/g</span>
                </div>
                <div className="order-select-wrap">
                  <select
                    id="order-material"
                    name="material"
                    value={newOrder.material}
                    onChange={(e) => setNewOrder((p) => ({ ...p, material: e.target.value }))}
                    className="order-input order-select"
                  >
                    {availableMaterials.map((mat) => (
                      <option key={mat.key} value={mat.name} disabled={!mat.inStock}>
                        {mat.name}{mat.inStock ? ` (${mat.rate.toFixed(1)} EGP/g)` : " (Restocking soon)"}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="order-select-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Color Swatches (Rounded Squares) */}
              <fieldset className="order-fieldset">
                <legend className="order-field-legend">
                  Color <span className="order-legend-value">{newOrder.color || "Select"}</span>
                </legend>
                <div className="order-color-grid">
                  {availableColors.map((colorName) => {
                    const isSelected = (newOrder.color || "").toLowerCase().trim() === colorName.toLowerCase().trim();
                    const hex = getColorHex(colorName);
                    return (
                      <button
                        key={colorName}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setNewOrder((p) => ({ ...p, color: colorName }))}
                        className={`order-color-tile ${isSelected ? "selected" : ""}`}
                      >
                        <span
                          className="order-color-swatch"
                          style={{ background: hex }}
                          aria-hidden="true"
                        />
                        <span className="order-color-name">{colorName}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Quality Presets */}
              <fieldset className="order-fieldset">
                <legend className="order-field-legend">Quality</legend>
                <div className="order-quality-grid order-segmented-tray">
                  {QUALITY_OPTIONS.map((opt) => {
                    const isSelected = selectedTier === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleSelectQuality(opt)}
                        className={`order-tile-btn ${isSelected ? "selected" : ""}`}
                      >
                        <span className="order-tile-main">{opt.title}</span>
                        <span className="order-tile-sub">{opt.subtitle}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Subtle Optional Custom Settings */}
                <div className="order-advanced-wrap">
                  <button
                    type="button"
                    className="order-advanced-trigger"
                    aria-expanded={showCustomPrint}
                    onClick={() => setShowCustomPrint((v) => !v)}
                  >
                    <span>{showCustomPrint ? "Hide custom settings" : "Custom print settings"}</span>
                    <span className={`order-chevron ${showCustomPrint ? "open" : ""}`} aria-hidden="true">&#9662;</span>
                  </button>

                  {showCustomPrint && (
                    <div className="order-advanced-drawer">
                      <div className="order-adv-row">
                        <span className="order-adv-label">Strength (Infill)</span>
                        <div className="order-adv-chips order-segmented-tray">
                          {[15, 20, 30, 50, 100].map((val) => (
                            <button
                              key={val}
                              type="button"
                              aria-pressed={Number(orderInfill) === val}
                              onClick={() => {
                                setOrderInfill(val);
                                setSelectedTier("custom");
                              }}
                              className={`order-mini-chip ${Number(orderInfill) === val ? "selected" : ""}`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="order-adv-row">
                        <span className="order-adv-label">Detail (Layer Height)</span>
                        <div className="order-adv-chips order-segmented-tray">
                          {[
                            { val: 0.28, label: "0.28mm" },
                            { val: 0.20, label: "0.20mm" },
                            { val: 0.16, label: "0.16mm" },
                            { val: 0.12, label: "0.12mm" }
                          ].map((lh) => (
                            <button
                              key={lh.val}
                              type="button"
                              aria-pressed={Math.abs(Number(orderLayerHeight) - lh.val) < 0.01}
                              onClick={() => {
                                setOrderLayerHeight(lh.val);
                                setSelectedTier("custom");
                              }}
                              className={`order-mini-chip ${Math.abs(Number(orderLayerHeight) - lh.val) < 0.01 ? "selected" : ""}`}
                            >
                              {lh.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="order-adv-row order-adv-row-inline">
                        <span className="order-adv-label">Auto Supports</span>
                        <div className="order-segmented-tray order-segmented-tray-inline">
                          <button
                            type="button"
                            aria-pressed={enableSupports}
                            onClick={() => setEnableSupports(true)}
                            className={`order-mini-chip ${enableSupports ? "selected" : ""}`}
                          >
                            On
                          </button>
                          <button
                            type="button"
                            aria-pressed={!enableSupports}
                            onClick={() => setEnableSupports(false)}
                            className={`order-mini-chip ${!enableSupports ? "selected" : ""}`}
                          >
                            Off
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Compact Price Box */}
              <div className="order-price-box">
                <div className="order-price-stats">
                  <div>
                    <span className="order-stat-label">Total Weight</span>
                    <strong className="order-stat-val">
                      {orderSummary.hasSlicedWeight ? `${orderSummary.totalWeightGrams.toFixed(1)} g` : "--"}
                    </strong>
                  </div>
                  <div>
                    <span className="order-stat-label">Est. Time</span>
                    <strong className="order-stat-val">
                      {orderSummary.hasSlicedWeight ? formatDurationShort(orderSummary.totalSeconds) : "--"}
                    </strong>
                  </div>
                  <div>
                    <span className="order-stat-label">Pieces</span>
                    <strong className="order-stat-val">
                      {orderSummary.totalPieces > 0 ? orderSummary.totalPieces : "--"}
                    </strong>
                  </div>
                </div>

                <div className="order-price-total-row">
                  <div>
                    <div className="order-total-label">Estimated Price</div>
                    <div className="order-total-hint">
                      {orderSummary.hasSlicedWeight ? (
                        orderSummary.isMicroOrder ? (
                          `Minimum order rate (< ${orderSummary.microThreshold}g)`
                        ) : (
                          `${orderSummary.activeRate.toFixed(2)} EGP/g (${newOrder.material || "PLA"})`
                        )
                      ) : orderSummary.hasPendingQuoteItems ? (
                        "Quoted after workshop inspects link/archive"
                      ) : (
                        "Upload an STL to see instant pricing"
                      )}
                    </div>
                  </div>
                  <div className="order-total-amount">
                    {orderSummary.hasSlicedWeight
                      ? `${orderSummary.estimatedTotal} EGP`
                      : orderSummary.hasPendingQuoteItems
                      ? "Pending Quote"
                      : "--"}
                  </div>
                </div>

                {orderSummary.hasSlicedWeight && orderSummary.hasPendingQuoteItems && (
                  <div className="order-pending-note">
                    Plus archive/link items, confirmed upon workshop review.
                  </div>
                )}

                <button
                  type="button"
                  className="order-btn order-btn-accent order-btn-full"
                  onClick={handleContinueToDetails}
                >
                  Continue to Details &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CONTACT & NOTES DETAILS */}
        {orderStep === 2 && (
          <div className="order-single-card animate-in">
            <div className="order-compact-banner">
              <div className="order-compact-banner-info">
                <strong>
                  {orderItems.length > 0
                    ? `${orderItems.length} model${orderItems.length > 1 ? "s" : ""} (${orderSummary.totalPieces} pc${orderSummary.totalPieces > 1 ? "s" : ""})`
                    : "External Model Link"}
                </strong>
                <span>
                  {newOrder.material || "PLA"} &middot; {newOrder.color || "Standard"} &middot;{" "}
                  {getQualityLabel(selectedTier, orderLayerHeight, orderInfill)} &middot;{" "}
                  <strong>{compactSummaryPriceText}</strong>
                </span>
              </div>
              <button
                type="button"
                className="order-btn order-btn-ghost order-btn-sm"
                onClick={() => setOrderStep(1)}
              >
                Edit Models
              </button>
            </div>

            <form onSubmit={handleDetailsSubmit} noValidate className="order-details-form">
              <div className="order-field-group">
                <label htmlFor="order-name" className="order-field-label">
                  Full Name <span className="order-req" aria-hidden="true">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="order-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="next"
                  required
                  value={newOrder.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewOrder((p) => ({ ...p, name: val }));
                    if (formErrors.name) {
                      setFormErrors((prev) => ({ ...prev, name: validateDetailField("name", val) }));
                    }
                  }}
                  onBlur={() => handleDetailBlur("name")}
                  placeholder="Your full name"
                  aria-invalid={Boolean(touchedDetails.name && formErrors.name)}
                  aria-describedby={formErrors.name ? "order-name-err" : undefined}
                  className={`order-input ${touchedDetails.name && formErrors.name ? "is-invalid" : ""}`}
                />
                {formErrors.name && (
                  <div id="order-name-err" className="order-field-err">
                    {formErrors.name}
                  </div>
                )}
              </div>

              <div className="order-details-row-2">
                <div className="order-field-group">
                  <label htmlFor="order-phone" className="order-field-label">
                    Phone Number (Egypt) <span className="order-req" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={phoneInputRef}
                    id="order-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="next"
                    required
                    value={newOrder.phone}
                    onChange={(e) => {
                      handlePhoneChange(e);
                      if (formErrors.phone) {
                        setFormErrors((prev) => ({ ...prev, phone: null }));
                      }
                    }}
                    onBlur={() => handleDetailBlur("phone")}
                    placeholder="010 1234 5678"
                    aria-invalid={Boolean(touchedDetails.phone && formErrors.phone)}
                    aria-describedby={formErrors.phone ? "order-phone-err" : undefined}
                    className={`order-input ${touchedDetails.phone && formErrors.phone ? "is-invalid" : ""}`}
                  />
                  {formErrors.phone && (
                    <div id="order-phone-err" className="order-field-err">
                      {formErrors.phone}
                    </div>
                  )}
                </div>

                <div className="order-field-group">
                  <label htmlFor="order-email" className="order-field-label">
                    Email Address <span className="order-req" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={emailInputRef}
                    id="order-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    required
                    value={newOrder.email}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewOrder((p) => ({ ...p, email: val }));
                      if (formErrors.email) {
                        setFormErrors((prev) => ({ ...prev, email: validateDetailField("email", val) }));
                      }
                    }}
                    onBlur={() => handleDetailBlur("email")}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(touchedDetails.email && formErrors.email)}
                    aria-describedby={formErrors.email ? "order-email-err" : undefined}
                    className={`order-input ${touchedDetails.email && formErrors.email ? "is-invalid" : ""}`}
                  />
                  {formErrors.email && (
                    <div id="order-email-err" className="order-field-err">
                      {formErrors.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="order-field-group">
                <div className="order-label-row">
                  <label htmlFor="order-notes" className="order-field-label">
                    Notes (Optional)
                  </label>
                  <span className="order-char-count">{(newOrder.notes || "").length}/500</span>
                </div>
                <textarea
                  id="order-notes"
                  name="notes"
                  rows={3}
                  maxLength={500}
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional: tolerances, part fit notes, or preferred campus pickup time..."
                  className="order-input order-textarea"
                />
              </div>

              <div className="order-step-actions">
                <button
                  type="button"
                  className="order-btn order-btn-secondary"
                  onClick={() => setOrderStep(1)}
                >
                  &larr; Back to Models
                </button>
                <button type="submit" className="order-btn order-btn-accent">
                  Review Order &rarr;
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: REVIEW ORDER */}
        {orderStep === 3 && (
          <div className="order-review-wrap animate-in">
            <div className="order-panel">
              <div className="order-panel-head">
                <div>
                  <h2 className="order-panel-title">Parts & Quantities</h2>
                  <p className="order-panel-caption">
                    {orderItems.length > 0
                      ? `${orderItems.length} file${orderItems.length > 1 ? "s" : ""}, ${orderSummary.totalPieces} total piece${orderSummary.totalPieces > 1 ? "s" : ""}`
                      : "External model link attached"}
                  </p>
                </div>
                <button
                  type="button"
                  className="order-btn order-btn-ghost order-btn-sm"
                  onClick={() => setOrderStep(1)}
                >
                  Change Parts
                </button>
              </div>

              {orderItems.length > 0 && (
                <ul className="order-review-parts">
                  {orderItems.map((item) => {
                    const est = estimateById[item.id];
                    const unitW = est ? Number(est.totalWeightGrams ?? est.weightGrams ?? 0) : 0;
                    const lineW = Math.round(unitW * item.quantity * 100) / 100;
                    return (
                      <li key={item.id} className="order-review-part-row">
                        <div className="order-part-thumb" aria-hidden={!item.thumbnail ? "true" : undefined}>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={`Preview of ${item.name}`} />
                          ) : item.kind === "archive" ? (
                            <ArchiveMiniIcon />
                          ) : (
                            <CubeMiniIcon />
                          )}
                        </div>
                        <div className="order-part-meta">
                          <div className="order-part-name">{item.name}</div>
                          <div className="order-part-specs">
                            {est
                              ? `${unitW.toFixed(1)} g each · ${lineW.toFixed(1)} g subtotal`
                              : item.kind === "archive"
                              ? "Archive verified · Quoted on review"
                              : "Size verified by workshop"}
                          </div>
                        </div>
                        <span className="order-qty-badge">&times;{item.quantity}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {newOrder.fileLink && (
                <div className="order-review-link-row">
                  <span className="order-review-k">Model Link</span>
                  <a
                    href={normalizeUrl(newOrder.fileLink)}
                    target="_blank"
                    rel="noreferrer"
                    className="order-review-link"
                  >
                    {getPlatformFromUrl(newOrder.fileLink)?.name || "External Link"}: {newOrder.fileLink}
                  </a>
                </div>
              )}

              <div className="order-review-cols">
                <div className="order-review-block">
                  <div className="order-review-block-head">
                    <h3>Print Settings</h3>
                    <button type="button" className="order-inline-edit" onClick={() => setOrderStep(1)}>
                      Edit
                    </button>
                  </div>
                  <div className="order-kv-list">
                    <div className="order-kv">
                      <span>Material</span>
                      <strong>{newOrder.material || "PLA"}</strong>
                    </div>
                    <div className="order-kv">
                      <span>Color</span>
                      <strong className="order-color-inline">
                        <span
                          className="order-color-swatch"
                          style={{ background: getColorHex(newOrder.color) }}
                          aria-hidden="true"
                        />
                        {newOrder.color || "Standard"}
                      </strong>
                    </div>
                    <div className="order-kv">
                      <span>Quality</span>
                      <strong>{getQualityLabel(selectedTier, orderLayerHeight, orderInfill)}</strong>
                    </div>
                    <div className="order-kv">
                      <span>Fulfillment</span>
                      <strong>Campus Pickup</strong>
                    </div>
                  </div>
                </div>

                <div className="order-review-block">
                  <div className="order-review-block-head">
                    <h3>Contact Details</h3>
                    <button type="button" className="order-inline-edit" onClick={() => setOrderStep(2)}>
                      Edit
                    </button>
                  </div>
                  <div className="order-kv-list">
                    <div className="order-kv">
                      <span>Name</span>
                      <strong>{newOrder.name}</strong>
                    </div>
                    <div className="order-kv">
                      <span>Phone</span>
                      <strong>{newOrder.phone}</strong>
                    </div>
                    <div className="order-kv">
                      <span>Email</span>
                      <strong>{newOrder.email}</strong>
                    </div>
                    {newOrder.notes?.trim() && (
                      <div className="order-kv order-kv-notes">
                        <span>Notes</span>
                        <strong>{newOrder.notes.trim()}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="order-invoice-summary">
                <div className="order-kv-list">
                  <div className="order-kv">
                    <span>Combined Weight</span>
                    <strong>
                      {orderSummary.hasSlicedWeight ? `${orderSummary.totalWeightGrams.toFixed(1)} g` : "Confirmed on review"}
                    </strong>
                  </div>
                  <div className="order-kv">
                    <span>Estimated Print Time</span>
                    <strong>
                      {orderSummary.hasSlicedWeight ? formatDurationShort(orderSummary.totalSeconds) : "--"}
                    </strong>
                  </div>
                  <div className="order-kv">
                    <span>Pricing Rate</span>
                    <strong>
                      {orderSummary.isMicroOrder
                        ? `Minimum Order (${orderSummary.microFlatPrice} EGP < ${orderSummary.microThreshold}g)`
                        : `${orderSummary.activeRate.toFixed(2)} EGP/g`}
                    </strong>
                  </div>
                </div>

                <div className="order-invoice-total">
                  <span>Estimated Total</span>
                  {orderSummary.hasSlicedWeight ? (
                    <strong className="order-accent-price">{orderSummary.estimatedTotal} EGP</strong>
                  ) : (
                    <strong>Confirmed After Review</strong>
                  )}
                </div>

                {orderSummary.hasSlicedWeight && (
                  <div className="order-deposit-strip">
                    <span>
                      50% Deposit: <strong>{orderSummary.depositRequired} EGP</strong>
                    </span>
                    <span>
                      Upon Pickup: <strong>{orderSummary.remainingBalance} EGP</strong>
                    </span>
                  </div>
                )}

                <p className="order-invoice-note">
                  Calibrated for our 256 &times; 256 &times; 256 mm build plate. Final price is confirmed upon workshop review before printing.
                </p>
              </div>

              <div className="order-step-actions">
                <button
                  type="button"
                  className="order-btn order-btn-secondary"
                  onClick={() => setOrderStep(2)}
                >
                  &larr; Back to Details
                </button>
                <button
                  type="button"
                  className="order-btn order-btn-accent"
                  disabled={isUploading}
                  onClick={handleOrderSubmit}
                >
                  {isUploading ? "Submitting Order..." : "Submit Order"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: SUBMISSION CONFIRMATION */}
        {orderStep === 4 && (
          <div className="order-single-card order-success-card animate-in">
            <div className="order-success-badge" aria-hidden="true">
              <CheckMarkIcon />
            </div>
            <h2 className="order-success-heading">Your Order Is In Queue</h2>
            <p className="order-success-copy">
              Save this tracking code to check your live print status at any time.
            </p>

            <button
              type="button"
              className={`order-tracking-box ${copiedTrackingCode ? "copied" : ""}`}
              onClick={async () => {
                const ok = await copyToClipboard(successModal);
                if (ok !== false) {
                  setCopiedTrackingCode(true);
                  addToast("Tracking code copied to clipboard!", "success");
                  setTimeout(() => setCopiedTrackingCode(false), 3000);
                }
              }}
            >
              <span className="order-tracking-code">{successModal}</span>
              <span className="order-tracking-hint">
                {copiedTrackingCode ? "Copied to clipboard" : "Click to copy code"}
              </span>
            </button>

            {lastSubmittedQuote && (
              <div className="order-submitted-summary">
                <div className="order-kv-list">
                  <div className="order-kv">
                    <span>Order</span>
                    <strong>{lastSubmittedQuote.orderName}</strong>
                  </div>
                  <div className="order-kv">
                    <span>Specs</span>
                    <strong>
                      {lastSubmittedQuote.material} ({lastSubmittedQuote.color}) &middot;{" "}
                      {getQualityLabel(lastSubmittedQuote.tier)}
                    </strong>
                  </div>
                  {lastSubmittedQuote.totalPieces > 0 && (
                    <div className="order-kv">
                      <span>Pieces</span>
                      <strong>{lastSubmittedQuote.totalPieces}</strong>
                    </div>
                  )}
                  {lastSubmittedQuote.weightGrams > 0 && (
                    <div className="order-kv">
                      <span>Est. Weight</span>
                      <strong>{lastSubmittedQuote.weightGrams.toFixed(1)} g</strong>
                    </div>
                  )}
                  <div className="order-kv order-kv-strong">
                    <span>Est. Total</span>
                    <strong className="order-accent-price">
                      {lastSubmittedQuote.totalPrice > 0
                        ? `${lastSubmittedQuote.totalPrice} EGP`
                        : "Calculated upon slicing"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="order-success-actions">
              {config.whatsapp_number && (
                <a
                  href={`https://wa.me/${(config.whatsapp_number || "").replace(/\D/g, "").startsWith("0") ? "2" + (config.whatsapp_number || "").replace(/\D/g, "") : (config.whatsapp_number || "").replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Hello Etba3ly! I just submitted an order:\n- Tracking: ${successModal}\n- Order: ${lastSubmittedQuote?.orderName || "Custom 3D Print"}\n- Specs: ${lastSubmittedQuote?.material || "PLA"} (${lastSubmittedQuote?.color || "Standard"})\n- Total: ${lastSubmittedQuote && lastSubmittedQuote.totalPrice > 0 ? `${lastSubmittedQuote.totalPrice} EGP` : "Pending quote"}\n- Client: ${lastSubmittedQuote?.name || ""}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="order-btn order-btn-whatsapp order-btn-full"
                >
                  Send Order on WhatsApp
                </a>
              )}

              <button
                type="button"
                className="order-btn order-btn-accent order-btn-full"
                onClick={() => {
                  setOrderStep(1);
                  navigateTo("track");
                }}
              >
                Track Your Order
              </button>

              <div className="order-success-secondary-row">
                <button
                  type="button"
                  className="order-btn order-btn-secondary"
                  onClick={() => {
                    if (onResetOrderFlow) onResetOrderFlow();
                    setOrderStep(1);
                  }}
                >
                  Order More Parts
                </button>
                <button
                  type="button"
                  className="order-btn order-btn-ghost"
                  onClick={() => {
                    setOrderStep(1);
                    navigateTo("home");
                  }}
                >
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Optional Native <dialog> 3D Model Inspector */}
      <dialog
        ref={previewDialogRef}
        closedby="any"
        aria-labelledby="order-preview-title"
        className="order-preview-dialog"
        onClose={() => setInspectingItem(null)}
      >
        {inspectingItem && (
          <div className="order-preview-dialog-inner">
            <div className="order-preview-dialog-head">
              <div>
                <h1 id="order-preview-title" className="order-preview-dialog-title">
                  {inspectingItem.name}
                </h1>
                <p className="order-preview-dialog-sub">
                  256 &times; 256 &times; 256 mm Build Plate Preview
                </p>
              </div>
              <button
                type="button"
                className="order-btn order-btn-secondary order-btn-sm"
                onClick={() => setInspectingItem(null)}
              >
                Close
              </button>
            </div>
            <div className="order-preview-dialog-canvas">
              <STLViewer
                file={inspectingItem.file}
                color={newOrder.color || "Orange"}
                infillPercent={orderInfill}
                layerHeight={orderLayerHeight}
                nozzleSize={orderNozzle}
                enableSupports={enableSupports}
                materialKey={newOrder.material || "pla"}
                pricePerGram={orderSummary.activeRate}
                showSlicerControls={true}
                height="380px"
              />
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
