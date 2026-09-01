"use strict";

const pick = (source, allowed) => {
  const output = {};
  if (!source || typeof source !== "object") return output;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) output[key] = source[key];
  }
  return output;
};

const escapeRegExp = (value) => String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const validationStatus = (error) => ["ValidationError", "CastError"].includes(error?.name) ? 400 : 500;

module.exports = { escapeRegExp, pagination, pick, validationStatus };
