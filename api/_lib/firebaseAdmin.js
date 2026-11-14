const admin = require("firebase-admin");

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
  if (initialized) {
    return admin;
  }

  const existingApps = admin.apps || [];
  if (existingApps.length) {
    initialized = true;
    return admin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "kebos-d63af";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Prefer explicit cert env; else Application Default Credentials (local scripts)
  if ((!clientEmail || !process.env.FIREBASE_PRIVATE_KEY) && gac) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      initialized = true;
      return admin;
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
    admin.initializeApp({
      credential: admin.credential.cert({
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
  return admin;
}

function getDb() {
  return initFirebaseAdmin().firestore();
}

function getAuth() {
  return initFirebaseAdmin().auth();
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
  admin,
};
