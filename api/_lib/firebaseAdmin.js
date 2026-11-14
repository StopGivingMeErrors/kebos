const {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

let initialized = false;

/**
 * Normalize FIREBASE_PRIVATE_KEY from Vercel/env.
 * Handles quoted values and literal \n sequences.
 */
function getPrivateKey() {
  let raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;

  raw = String(raw).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }

  const key = raw.replace(/\\n/g, "\n");

  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(key)) {
    const err = new Error(
      "FIREBASE_PRIVATE_KEY is malformed (missing BEGIN PRIVATE KEY). Check quoting and \\n escapes in Vercel."
    );
    err.code = "ADMIN_KEY_FORMAT";
    throw err;
  }

  if (!key.includes("\n")) {
    const err = new Error(
      "FIREBASE_PRIVATE_KEY has no newlines after \\n expansion. Paste the full key with \\n between PEM lines."
    );
    err.code = "ADMIN_KEY_FORMAT";
    throw err;
  }

  return key;
}

function missingAdminEnvMessage() {
  const missing = [];
  if (!process.env.FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
  if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!process.env.FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  return `Missing Firebase Admin credentials: ${missing.join(", ")}`;
}

function initFirebaseAdmin() {
  if (initialized || getApps().length) {
    initialized = true;
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "kebos-d63af";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Prefer explicit cert env; else Application Default Credentials (local scripts)
  if ((!clientEmail || !process.env.FIREBASE_PRIVATE_KEY) && gac) {
    try {
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      initialized = true;
      return;
    } catch (error) {
      console.error(
        "[firebaseAdmin] GOOGLE_APPLICATION_CREDENTIALS init failed:",
        error.message
      );
      const err = new Error(
        "Firebase Admin ADC failed. Check GOOGLE_APPLICATION_CREDENTIALS path."
      );
      err.code = "ADMIN_CONFIG";
      throw err;
    }
  }

  let privateKey;
  try {
    privateKey = getPrivateKey();
  } catch (error) {
    if (error.code === "ADMIN_KEY_FORMAT") {
      console.error("[firebaseAdmin]", error.message);
      throw error;
    }
    throw error;
  }

  if (!clientEmail || !privateKey) {
    const message = missingAdminEnvMessage();
    console.error("[firebaseAdmin]", message);
    const err = new Error(message);
    err.code = "ADMIN_CONFIG";
    throw err;
  }

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error) {
    console.error(
      "[firebaseAdmin] Failed to initialize Admin SDK (check FIREBASE_PRIVATE_KEY newlines/format):",
      error.message
    );
    const err = new Error(
      "Firebase Admin failed to initialize. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY formatting."
    );
    err.code = "ADMIN_KEY_FORMAT";
    err.cause = error;
    throw err;
  }

  initialized = true;
}

function getDb() {
  initFirebaseAdmin();
  return getFirestore();
}

function getAuth() {
  // Lazy-load Auth: firebase-admin v14 → jwks-rsa@4 → jose@6 is ESM-only and
  // crashes Vercel CJS bundles with ERR_REQUIRE_ESM if required at module load.
  initFirebaseAdmin();
  const { getAuth: getAuthMod } = require("firebase-admin/auth");
  return getAuthMod();
}

/** Safe public message for API responses (no secret material). */
function adminConfigClientMessage(error) {
  if (error?.code === "ADMIN_KEY_FORMAT") {
    return "Server email/booking service misconfigured (Firebase key format).";
  }
  if (error?.code === "ADMIN_CONFIG") {
    return "Server email/booking service is not configured.";
  }
  return "Server is not configured";
}

module.exports = {
  initFirebaseAdmin,
  getDb,
  getAuth,
  getPrivateKey,
  adminConfigClientMessage,
};
