import React from "react";
import { normalizeMaterialKey } from "../utils/pricingEngine";

export default function ReviewInvoiceCard({
  clientMetrics,
  materialKey = "pla",
  materialName = "PLA",
  serviceTier = "standard",
  config = {},
  materialRates = {},
  enableSupports = true,
  orderData = {},
  showDepositInfo = true
}) {
  const hasMetrics = Boolean(clientMetrics && (clientMetrics.weightGrams || clientMetrics.filamentWeightGrams));

  const weight = hasMetrics
    ? Number(clientMetrics.weightGrams ?? clientMetrics.filamentWeightGrams ?? 0)
    : 0;

  const hours = hasMetrics
    ? clientMetrics.totalSeconds
      ? clientMetrics.totalSeconds / 3600
      : weight > 0
        ? weight / 35
        : 0.2
    : 0;

  const layers = hasMetrics
    ? clientMetrics.numLayers ||
      Math.max(1, Math.round((clientMetrics.metrics?.height || 20) / (clientMetrics.layerHeight || 0.20)))
    : 0;

  // Rate calculations
  const normKey = normalizeMaterialKey(materialKey || materialName || "pla");
  const configuredRate = parseFloat(config?.price_per_gram) || 3.5;
  const mData =
    (materialRates && (materialRates[normKey] || materialRates[materialKey?.toLowerCase()])) ||
    { selling_rate: configuredRate };
  let rate = Number(mData.selling_rate) || configuredRate;
  if ((normKey === "pla" || normKey === "pla_plus") && (rate < configuredRate || rate <= 2.0)) {
    rate = configuredRate;
  }
  const cleanMatLabel = (materialName || "PLA").replace(/\[.*?\]/g, "").trim();

  // Micro-order rule: Under 17g is flat 50 EGP. 17g and above does NOT activate (normal 3.5/g)
  const microThreshold = parseFloat(config?.micro_order_weight_threshold) || 17.0;
  const microFlatPrice = parseFloat(config?.micro_order_flat_price) || 50.0;
  const isMicroOrder = hasMetrics && weight > 0 && weight < microThreshold;

  // Supports and post-print cleaning are fully included in the 3.50 EGP/g rate
  const finalTotal = hasMetrics
    ? (isMicroOrder
        ? microFlatPrice
        : Math.ceil(weight * rate))
    : microFlatPrice;

  // Deposit calculation (50%)
  const depositRequired = Math.ceil(finalTotal * 0.5);
  const remainingBalance = finalTotal - depositRequired;

  const isReviewRequired = hasMetrics && finalTotal > (parseFloat(config?.price_review_threshold) || 300);

  return (
    <div
      className="review-invoice-card"
      style={{
        direction: "ltr",
        textAlign: "left",
        background: "rgba(20, 24, 34, 0.88)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "var(--radius-sm, 18px)",
        padding: "24px 26px",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.35)",
        color: "#F0F0F5",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Top Header: Calculator Icon + Pricing Breakdown */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Calculator SVG Icon in brand orange */}
          <div
            style={{
              color: "var(--accent, #FF8000)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="16" y1="14" x2="16" y2="18" />
              <path d="M8 10h.01" />
              <path d="M12 10h.01" />
              <path d="M16 10h.01" />
              <path d="M8 14h.01" />
              <path d="M12 14h.01" />
              <path d="M8 18h.01" />
              <path d="M12 18h.01" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.01em"
            }}
          >
            Pricing Breakdown
          </h3>
        </div>

        {hasMetrics && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 980,
              background: isMicroOrder ? "rgba(255, 128, 0, 0.15)" : "rgba(16, 185, 129, 0.15)",
              color: isMicroOrder ? "var(--accent, #FF8000)" : "#34d399",
              border: isMicroOrder ? "1px solid rgba(255, 128, 0, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)"
            }}
          >
            {isMicroOrder ? `Under ${microThreshold}g Flat: 50 EGP` : `Standard ${rate.toFixed(2)} EGP/g`}
          </span>
        )}
      </div>

      {/* Top Metrics Row: 3 Cards (Weight | Print Time | Layers) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24
        }}
      >
        {/* 1. Weight Card */}
        <div
          className="review-invoice-metric-box"
          style={{
            background: "rgba(255, 255, 255, 0.035)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "16px 8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
        >
          {/* 3D Box Icon (Orange) */}
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="#FF8000"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1
            }}
          >
            {hasMetrics ? `${weight.toFixed(1)}g` : "--"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary, #94a3b8)",
              fontWeight: 600
            }}
          >
            Weight
          </div>
        </div>

        {/* 2. Print Time Card */}
        <div
          className="review-invoice-metric-box"
          style={{
            background: "rgba(255, 255, 255, 0.035)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "16px 8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
        >
          {/* Clock Icon (Light Blue) */}
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1
            }}
          >
            {hasMetrics ? (hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(hours * 60)}m`) : "--"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary, #94a3b8)",
              fontWeight: 600
            }}
          >
            Print Time
          </div>
        </div>

        {/* 3. Layers Card */}
        <div
          className="review-invoice-metric-box"
          style={{
            background: "rgba(255, 255, 255, 0.035)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "16px 8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
        >
          {/* Layers Icon (Green) */}
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="#10B981"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1
            }}
          >
            {hasMetrics ? layers : "--"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary, #94a3b8)",
              fontWeight: 600
            }}
          >
            Layers
          </div>
        </div>
      </div>

      {/* Itemized Pricing Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Row 1: Material & 3D Printing */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 14.5,
            color: "#e2e8f0"
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {isMicroOrder
              ? `Micro-Order Base Rate (< ${microThreshold}g)`
              : `Material & 3D Printing (${cleanMatLabel} @ ${rate.toFixed(2)} EGP/g)`}
          </span>
          <span style={{ fontWeight: 700, color: "#ffffff" }}>
            {hasMetrics ? `${finalTotal} EGP` : `${rate.toFixed(2)} EGP/g`}
          </span>
        </div>

        {/* Row 2: Support Material & Post-Print Cleanup (Included) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 14,
            color: "#cbd5e1"
          }}
        >
          <span style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            Support Material & Post-Print Cleanup
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 12.5,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.25)"
            }}
          >
            Included
          </span>
        </div>

        {/* Subtle Divider Line */}
        <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", margin: "4px 0" }} />

        {/* Row 5: Total Row (Prominent Orange) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 4
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#ffffff"
            }}
          >
            Estimated Total
          </span>
          {isReviewRequired ? (
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--accent, #FF8000)",
                textAlign: "right"
              }}
            >
              Engineer Review Required for Final Price
            </span>
          ) : (
            <span
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "var(--accent, #FF8000)",
                textShadow: "0 0 16px rgba(255, 128, 0, 0.35)"
              }}
            >
              {hasMetrics ? `${finalTotal} EGP` : `Calculated upon slicing`}
            </span>
          )}
        </div>

        {/* Deposit breakdown (if applicable) */}
        {showDepositInfo && hasMetrics && !isReviewRequired && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 10,
              fontSize: 13
            }}
          >
            <div>
              <span style={{ color: "var(--text-secondary, #94a3b8)" }}>50% Deposit: </span>
              <strong style={{ color: "var(--status-done, #34C759)", display: "inline-block" }}>
                {depositRequired} EGP
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-secondary, #94a3b8)" }}>Remaining upon Pickup: </span>
              <strong style={{ color: "#ffffff", display: "inline-block" }}>
                {remainingBalance} EGP
              </strong>
            </div>
          </div>
        )}

        {/* Disclaimer Footer */}
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary, #94a3b8)",
            lineHeight: 1.5,
            marginTop: 6
          }}
        >
          {isReviewRequired ? (
            <span style={{ color: "var(--accent, #FF8000)" }}>
              Due to part volume and geometry, our workshop team will review the 3D model for optimal machine orientation and confirm exact pricing before printing.
            </span>
          ) : (
            "Preliminary estimate based on 3D geometry. Final price confirmed upon workshop review."
          )}
        </div>
      </div>
    </div>
  );
}
