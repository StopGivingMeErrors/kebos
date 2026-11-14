/**
 * READ-ONLY: print whether a Firebase Auth user has custom claim staff:true.
 *
 * Usage:
 *   node scripts/check-staff-claim.js <UID>
 *
 * Never writes. Never sets claims (use set-staff-claim.js for that).
 *
 * Requires: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
const path = require("path");

try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch {
  // optional
}

const { initFirebaseAdmin, getAuth } = require("../api/_lib/firebaseAdmin");

async function main() {
  const uid = process.argv[2];
  if (!uid || uid.length < 8) {
    console.error("Usage: node scripts/check-staff-claim.js <UID>");
    process.exit(1);
  }

  console.log("--- check-staff-claim (READ-ONLY) ---");
  console.log(`UID: ${uid}`);
  console.log("This script does not modify any data.\n");

  initFirebaseAdmin();
  const user = await getAuth().getUser(uid);
  const claims = user.customClaims || {};
  const isStaff = claims.staff === true;

  console.log("Email:        ", user.email || "(none)");
  console.log("Disabled:     ", user.disabled === true);
  console.log("customClaims: ", JSON.stringify(claims));
  console.log("");
  if (isStaff) {
    console.log("RESULT: staff:true IS set. This user is treated as the barber.");
  } else {
    console.log("RESULT: staff:true is NOT set. This user is NOT staff.");
    console.log("To grant: node scripts/set-staff-claim.js " + uid + " --apply");
    console.log("Then the user must sign out and sign in once.");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
