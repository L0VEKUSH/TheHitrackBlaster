const wildcardMatch = (origin, pattern) => {
  if (!pattern.includes("*")) return false;
  const escapedPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escapedPattern}$`, "i").test(origin);
};

const patterns = [
  "https://*.vercel.app",
  "https://*.onrender.com",
  "http://localhost:5173"
];

const testOrigins = [
  "https://the-hitrack-blaster-lvwuw6sb7-lovekush-kumar-s-projects.vercel.app",
  "https://thehitrackblaster.onrender.com",
  "https://another-subdomain.onrender.com",
  "http://localhost:5173",
  "https://malicious-site.com"
];

testOrigins.forEach(origin => {
  const matchedPattern = patterns.find(pattern => {
    if (pattern === origin) return true;
    return wildcardMatch(origin, pattern);
  });
  console.log(`Origin: ${origin} | Matched Pattern: ${matchedPattern || "NONE"}`);
});
