const admin = require("firebase-admin");

let initialized = false;

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;
  // Vercel stores newlines as \n in env strings
  return raw.replace(/\\n/g, "\n");
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

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    const err = new Error(
      "Missing Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)"
    );
    err.code = "ADMIN_CONFIG";
    throw err;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  initialized = true;
  return admin;
}

function getDb() {
  return initFirebaseAdmin().firestore();
}

function getAuth() {
  return initFirebaseAdmin().auth();
}

module.exports = {
  initFirebaseAdmin,
  getDb,
  getAuth,
  admin,
};
