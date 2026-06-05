// src/utils/imageUtils.js

// Returns an absolute URL for images served from the Express backend.
// Accepts either:
// - absolute http(s) URLs
// - backend-relative paths like "/uploads/xyz.png"
// - raw filenames like "xyz.png" (converted to "/uploads/xyz.png")
// - null/undefined (returns a safe default placeholder)

const BACKEND_UPLOAD_PREFIX = "/uploads/";

const getPublicOrigin = () => {
  // If VITE_API_URL is configured, use its origin; otherwise fallback to current origin.
  const rawApiUrl = import.meta.env?.VITE_API_URL;
  if (typeof rawApiUrl !== "string" || rawApiUrl.trim() === "") {
    return window.location.origin;
  }

  try {
    const normalized = rawApiUrl.trim().replace(/\/$|\/api$/i, "");
    const u = new URL(normalized);
    return u.origin;
  } catch {
    return window.location.origin;
  }
};

const DEFAULT_PLACEHOLDER = () => {
  // If backend serves /uploads/default.png
  return `${getPublicOrigin()}${BACKEND_UPLOAD_PREFIX}default.png`;
};

export function getImageUrl(input) {
  if (!input) return DEFAULT_PLACEHOLDER();

  if (typeof input !== "string") {
    // Avoid crashing if an object is passed.
    return DEFAULT_PLACEHOLDER();
  }

  const s = input.trim();
  if (!s) return DEFAULT_PLACEHOLDER();

  // Absolute URL
  if (/^https?:\/\//i.test(s)) return s;

  // Backend relative path: /uploads/...
  if (s.startsWith("/uploads/")) {
    return `${getPublicOrigin()}${s}`;
  }

  // Backend relative path without leading slash
  if (!s.startsWith("/") && s.includes("/uploads/")) {
    return `${getPublicOrigin()}/${s}`.replace(/\/+/, "/");
  }

  // Raw filename
  if (!s.includes("/")) {
    return `${getPublicOrigin()}${BACKEND_UPLOAD_PREFIX}${s}`;
  }

  // Any other relative path: best-effort return as-is
  if (s.startsWith("/")) return `${getPublicOrigin()}${s}`;

  // Last resort: placeholder
  return DEFAULT_PLACEHOLDER();
}

