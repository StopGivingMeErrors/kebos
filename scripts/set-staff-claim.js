/**
 * Set or clear the Firebase Auth custom claim staff:true on a user.
 *
 * Dry-run by default (prints what would happen). Pass --apply to write.
 * After applying, the barber must sign OUT and sign IN once so the new
 * claim appears in their ID token.
 *
 * Usage:
 *   node scripts/set-staff-claim.js <UID>
 *   node scripts/set-staff-claim.js <UID> --apply
 *   node scripts/set-staff-claim.js <UID> --clear          # dry-run remove claim
 *   node scripts/set-staff-claim.js <UID> --clear --apply
 *
 * Requires env (same as Vercel Admin SDK):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * How to find the barber UID:
 *   Firebase Console → Authentication → Users → copy User UID
 *
 * NEVER run this against production from CI. Operator runs it manually.
 */
const path = require("path");

// Load .env.local / .env if present (optional; never commit real secrets)
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch {
  // dotenv optional
}

const { initFirebaseAdmin, getAuth } = require("../api/_lib/firebaseAdmin");

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  return {
    uid: positional[0] || "",
    apply: flags.has("--apply"),
    clear: flags.has("--clear"),
  };
}

async function main() {
  const { uid, apply, clear } = parseArgs(process.argv);

  if (!uid || uid.length < 8) {
    console.error("Usage: node scripts/set-staff-claim.js <UID> [--apply] [--clear]");
    console.error("Dry-run by default. Pass --apply to mutate Auth claims.");
    process.exit(1);
  }

  initFirebaseAdmin();
  const auth = getAuth();

  console.log("--- set-staff-claim (dry-run unless --apply) ---");
  console.log(`UID:    ${uid}`);
  console.log(`Action: ${clear ? "REMOVE staff claim" : "SET staff: true"}`);
  console.log(`Mode:   ${apply ? "APPLY (will write)" : "DRY-RUN (no write)"}`);
  console.log("");

  let user;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    console.error(`Failed to load user ${uid}:`, error.message);
    process.exit(1);
  }

  const existing = user.customClaims || {};
  console.log("User email:", user.email || "(none)");
  console.log("Current customClaims:", JSON.stringify(existing));

  const nextClaims = { ...existing };
  if (clear) {
    delete nextClaims.staff;
  } else {
    nextClaims.staff = true;
  }

  console.log("Next customClaims:   ", JSON.stringify(nextClaims));
  console.log("");

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to commit this change.");
    console.log("After --apply, the barber must sign out and sign in once.");
    process.exit(0);
  }

  await auth.setCustomUserClaims(uid, nextClaims);
  console.log("DONE: custom claims updated.");
  console.log("Tell the barber to sign OUT of the dashboard, then sign IN again");
  console.log("so their ID token picks up staff:true.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
