/**
 * Write ignored .env.local pointer for scripts: GOOGLE_APPLICATION_CREDENTIALS path only.
 * Does not copy the JSON into the repo.
 *
 * Usage: node scripts/_write-local-adc-env.js <absolute-json-path>
 */
const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error("Usage: node scripts/_write-local-adc-env.js <json-path>");
  process.exit(1);
}
const abs = path.resolve(jsonPath).replace(/\\/g, "/");
const repo = path.resolve(__dirname, "..");
if (abs.toLowerCase().startsWith(repo.toLowerCase().replace(/\\/g, "/") + "/")) {
  console.error("Refusing: JSON must stay outside the repo");
  process.exit(1);
}

const envPath = path.join(repo, ".env.local");
const body = [
  "# Auto-generated for local Admin scripts. Do not commit.",
  "FIREBASE_PROJECT_ID=kebos-d63af",
  `GOOGLE_APPLICATION_CREDENTIALS=${abs}`,
  "",
].join("\n");

fs.writeFileSync(envPath, body, { encoding: "utf8", mode: 0o600 });
console.log("Wrote .env.local with GOOGLE_APPLICATION_CREDENTIALS path (ignored by git)");
