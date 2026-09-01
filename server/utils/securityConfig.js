const PLACEHOLDER_MARKERS = [
  "replace-with",
  "change-me",
  "changeme",
  "placeholder",
  "example-secret"
];

const isPlaceholderSecret = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

const validateProductionSecrets = (environment = {}) => {
  const rules = [
    { name: "JWT_SECRET", required: true, minLength: 32 },
    { name: "SETUP_SECRET", required: false, minLength: 24 },
    { name: "ABOUT_ME_SECRET", required: false, minLength: 16 }
  ];
  const errors = [];
  const configured = [];

  for (const rule of rules) {
    const value = String(environment[rule.name] || "").trim();
    if (!value) {
      if (rule.required) errors.push(`${rule.name} is required`);
      continue;
    }
    configured.push({ name: rule.name, value });
    if (value.length < rule.minLength) {
      errors.push(`${rule.name} must contain at least ${rule.minLength} characters`);
    }
    if (isPlaceholderSecret(value)) {
      errors.push(`${rule.name} must not use an example placeholder`);
    }
  }

  for (let first = 0; first < configured.length; first += 1) {
    for (let second = first + 1; second < configured.length; second += 1) {
      if (configured[first].value === configured[second].value) {
        errors.push(`${configured[first].name} and ${configured[second].name} must be different`);
      }
    }
  }

  return errors;
};

module.exports = { isPlaceholderSecret, validateProductionSecrets };
