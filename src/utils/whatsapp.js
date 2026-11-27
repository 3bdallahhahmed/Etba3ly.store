export const DEFAULT_WHATSAPP_MESSAGE = "Hello Etba3ly! I need help with a 3D print.";

/**
 * Normalizes a local Egyptian or international phone string into a wa.me URL.
 */
export function buildWhatsAppUrl(rawNumber, message = DEFAULT_WHATSAPP_MESSAGE) {
  const digits = String(rawNumber || "").replace(/\D/g, "");
  let intl = digits;
  if (intl.startsWith("00")) {
    intl = intl.slice(2);
  } else if (intl.startsWith("0")) {
    intl = "2" + intl;
  }
  const base = intl ? `https://wa.me/${intl}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
