import React, { useState } from "react";

export const SERVICE_TIERS = {
  economy: {
    id: "economy",
    title: "اقتصادي",
    subtitle: "طباعة سريعة، تكلفة أقل",
    badgeLabel: "Draft 0.28mm",
    layerHeight: 0.28,
    infill: 15,
    nozzle: 0.40,
    supportRemovalFee: 3.00,
    supportRatio: 0.04
  },
  standard: {
    id: "standard",
    title: "قياسي",
    subtitle: "توازن بين الجودة والسعر",
    badgeLabel: "Standard 0.20mm",
    layerHeight: 0.20,
    infill: 20,
    nozzle: 0.40,
    supportRemovalFee: 5.00,
    supportRatio: 0.05
  },
  professional: {
    id: "professional",
    title: "احترافي",
    subtitle: "تشطيب عالي الجودة",
    badgeLabel: "Fine 0.12mm",
    layerHeight: 0.12,
    infill: 25,
    nozzle: 0.40,
    supportRemovalFee: 10.00,
    supportRatio: 0.06
  }
};

export default function ServiceTierSelector({
  selectedTier = "standard",
  onSelectTier,
  orderInfill = 20,
  setOrderInfill,
  orderLayerHeight = 0.20,
  setOrderLayerHeight,
  orderNozzle = 0.40,
  setOrderNozzle,
  enableSupports = true,
  setEnableSupports
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleTierClick = (tierKey) => {
    const tier = SERVICE_TIERS[tierKey];
    if (!tier) return;
    if (onSelectTier) {
      onSelectTier(tierKey, tier);
    }
    if (setOrderLayerHeight) setOrderLayerHeight(tier.layerHeight);
    if (setOrderInfill) setOrderInfill(tier.infill);
    if (setOrderNozzle) setOrderNozzle(tier.nozzle);
  };

  return (
    <div
      className="service-tier-wrapper"
      style={{
        direction: "rtl",
        textAlign: "right",
        marginBottom: 24,
        background: "rgba(22, 26, 35, 0.7)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255, 255, 255, 0.09)",
        borderRadius: "var(--radius-sm, 18px)",
        padding: "20px 22px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)"
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text-primary, #F0F0F5)",
            margin: "0 0 4px 0",
            letterSpacing: "-0.01em"
          }}
        >
          باقة الخدمة
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #94a3b8)",
            margin: 0,
            lineHeight: 1.5
          }}
        >
          اختيار سريع يضبط الدقة والملء والتشطيب معًا.
        </p>
      </div>

      {/* Tier Options Stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 1. Economy Tier */}
        {(() => {
          const isSelected = selectedTier === "economy";
          return (
            <div
              key="economy"
              onClick={() => handleTierClick("economy")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTierClick("economy"); }}
              className={`service-tier-card ${isSelected ? "selected" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderRadius: 14,
                cursor: "pointer",
                transition: "all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
                background: isSelected ? "rgba(255, 128, 0, 0.08)" : "rgba(255, 255, 255, 0.03)",
                border: isSelected ? "2px solid #FF8000" : "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: isSelected ? "0 0 16px rgba(255, 128, 0, 0.22)" : "none",
                userSelect: "none"
              }}
            >
              {/* Right side: Icon badge and Text */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Icon Badge */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: isSelected ? "#FF8000" : "rgba(255, 255, 255, 0.05)",
                    border: isSelected ? "1px solid #FF9500" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: isSelected ? "#0a0a0f" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.2s ease"
                  }}
                >
                  {/* Lightning SVG Icon */}
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill={isSelected ? "#0a0a0f" : "none"}
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>

                {/* Text Content */}
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: isSelected ? "#ffffff" : "var(--text-primary, #F0F0F5)",
                      lineHeight: 1.3
                    }}
                  >
                    اقتصادي
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: isSelected ? "#cbd5e1" : "var(--text-secondary, #94a3b8)",
                      marginTop: 2
                    }}
                  >
                    طباعة سريعة، تكلفة أقل
                  </div>
                </div>
              </div>

              {/* Left side: Radio indicator */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isSelected ? "#FF8000" : "transparent",
                  border: isSelected ? "2px solid #FF8000" : "2px solid rgba(255, 255, 255, 0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  flexShrink: 0
                }}
              >
                {isSelected && (
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          );
        })()}

        {/* 2. Standard Tier */}
        {(() => {
          const isSelected = selectedTier === "standard";
          return (
            <div
              key="standard"
              onClick={() => handleTierClick("standard")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTierClick("standard"); }}
              className={`service-tier-card ${isSelected ? "selected" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderRadius: 14,
                cursor: "pointer",
                transition: "all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
                background: isSelected ? "rgba(255, 128, 0, 0.08)" : "rgba(255, 255, 255, 0.03)",
                border: isSelected ? "2px solid #FF8000" : "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: isSelected ? "0 0 16px rgba(255, 128, 0, 0.22)" : "none",
                userSelect: "none"
              }}
            >
              {/* Right side: Icon badge and Text */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Icon Badge */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: isSelected ? "#FF8000" : "rgba(255, 255, 255, 0.05)",
                    border: isSelected ? "1px solid #FF9500" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: isSelected ? "#0a0a0f" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.2s ease"
                  }}
                >
                  {/* Star SVG Icon */}
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill={isSelected ? "#0a0a0f" : "none"}
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>

                {/* Text Content */}
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: isSelected ? "#ffffff" : "var(--text-primary, #F0F0F5)",
                      lineHeight: 1.3
                    }}
                  >
                    قياسي
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: isSelected ? "#cbd5e1" : "var(--text-secondary, #94a3b8)",
                      marginTop: 2
                    }}
                  >
                    توازن بين الجودة والسعر
                  </div>
                </div>
              </div>

              {/* Left side: Radio indicator */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isSelected ? "#FF8000" : "transparent",
                  border: isSelected ? "2px solid #FF8000" : "2px solid rgba(255, 255, 255, 0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  flexShrink: 0
                }}
              >
                {isSelected && (
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          );
        })()}

        {/* 3. Professional Tier */}
        {(() => {
          const isSelected = selectedTier === "professional";
          return (
            <div
              key="professional"
              onClick={() => handleTierClick("professional")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTierClick("professional"); }}
              className={`service-tier-card ${isSelected ? "selected" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderRadius: 14,
                cursor: "pointer",
                transition: "all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
                background: isSelected ? "rgba(255, 128, 0, 0.08)" : "rgba(255, 255, 255, 0.03)",
                border: isSelected ? "2px solid #FF8000" : "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: isSelected ? "0 0 16px rgba(255, 128, 0, 0.22)" : "none",
                userSelect: "none"
              }}
            >
              {/* Right side: Icon badge and Text */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Icon Badge */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: isSelected ? "#FF8000" : "rgba(255, 255, 255, 0.05)",
                    border: isSelected ? "1px solid #FF9500" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: isSelected ? "#0a0a0f" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.2s ease"
                  }}
                >
                  {/* Trophy SVG Icon */}
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill={isSelected ? "#0a0a0f" : "none"}
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                  </svg>
                </div>

                {/* Text Content */}
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: isSelected ? "#ffffff" : "var(--text-primary, #F0F0F5)",
                      lineHeight: 1.3
                    }}
                  >
                    احترافي
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: isSelected ? "#cbd5e1" : "var(--text-secondary, #94a3b8)",
                      marginTop: 2
                    }}
                  >
                    تشطيب عالي الجودة
                  </div>
                </div>
              </div>

              {/* Left side: Radio indicator */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isSelected ? "#FF8000" : "transparent",
                  border: isSelected ? "2px solid #FF8000" : "2px solid rgba(255, 255, 255, 0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  flexShrink: 0
                }}
              >
                {isSelected && (
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Advanced Options Collapsible Trigger */}
      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: "transparent",
            border: "none",
            color: showAdvanced ? "var(--accent, #FF8000)" : "var(--text-secondary, #94a3b8)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "4px 0",
            transition: "color 0.2s ease"
          }}
        >
          {/* Sliders SVG Icon */}
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>خيارات متقدمة</span>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease"
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Advanced Options Panel */}
      {showAdvanced && (
        <div
          style={{
            marginTop: 14,
            padding: "16px 18px",
            background: "rgba(15, 18, 25, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}
        >
          {/* Infill Density */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #F0F0F5)", margin: 0 }}>
                كثافة الملء الداخلي (Infill)
              </label>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent, #FF8000)" }}>
                {orderInfill}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[10, 15, 20, 30, 50, 100].map((val) => {
                const isValActive = orderInfill === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      if (setOrderInfill) setOrderInfill(val);
                      if (onSelectTier) onSelectTier("custom");
                    }}
                    style={{
                      flex: "1 1 45px",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: isValActive ? "1px solid #FF8000" : "1px solid rgba(255,255,255,0.1)",
                      background: isValActive ? "rgba(255, 128, 0, 0.18)" : "rgba(255,255,255,0.03)",
                      color: isValActive ? "#FF8000" : "var(--text-secondary, #94a3b8)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {val}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* Layer Height */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #F0F0F5)", margin: 0 }}>
                ارتفاع الطبقة (Layer Height)
              </label>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent, #FF8000)" }}>
                {orderLayerHeight.toFixed(2)} مم
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {[
                { val: 0.12, label: "0.12 مم - فائق النعومة" },
                { val: 0.16, label: "0.16 مم - دقة عالية" },
                { val: 0.20, label: "0.20 مم - قياسي متوازن" },
                { val: 0.28, label: "0.28 مم - مسودة سريعة" }
              ].map((opt) => {
                const isOptActive = Math.abs(orderLayerHeight - opt.val) < 0.01;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => {
                      if (setOrderLayerHeight) setOrderLayerHeight(opt.val);
                      if (onSelectTier) onSelectTier("custom");
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: isOptActive ? "1px solid #FF8000" : "1px solid rgba(255,255,255,0.1)",
                      background: isOptActive ? "rgba(255, 128, 0, 0.18)" : "rgba(255,255,255,0.03)",
                      color: isOptActive ? "#FF8000" : "var(--text-secondary, #94a3b8)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nozzle Size and Supports Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-tertiary, #64748b)", display: "block", marginBottom: 4 }}>
                قطر الفوهة (Nozzle)
              </label>
              <select
                value={orderNozzle}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (setOrderNozzle) setOrderNozzle(n);
                  if (onSelectTier) onSelectTier("custom");
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 8,
                  background: "rgba(25, 28, 38, 0.8)",
                  color: "#F0F0F5",
                  border: "1px solid rgba(255,255,255,0.12)"
                }}
              >
                <option value={0.40}>0.40 مم (الافتراضي)</option>
                <option value={0.20}>0.20 مم (دقة فائقة)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--text-tertiary, #64748b)", display: "block", marginBottom: 4 }}>
                الدعامات (Supports)
              </label>
              <button
                type="button"
                onClick={() => {
                  if (setEnableSupports) setEnableSupports(!enableSupports);
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: enableSupports ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.04)",
                  border: enableSupports ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255,255,255,0.1)",
                  color: enableSupports ? "#10b981" : "var(--text-tertiary, #64748b)",
                  transition: "all 0.15s ease"
                }}
              >
                {enableSupports ? "تلقائي عند الحاجة" : "معطلة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
