# Kevos security deploy plan

**Deploy only when the shop is closed (quiet time).**  
Production data is live. Take a Firestore export backup before changing rules or claims.

Keep a copy of the **previous** `firestore.rules` so you can redeploy it in one command if anything breaks:

```bash
# Before changing rules, archive the currently deployed rules file, e.g.:
copy firestore.rules firestore.rules.prev
# Rollback later:
copy firestore.rules.prev firestore.rules
npx firebase deploy --only firestore:rules
```

Never commit `.env.local`, service account JSON, or `*.pem` (see `.gitignore`).

---

## Ordered plan

### Stage 0 — Backup (rollback: N/A; keep the export)

1. Firebase Console → Firestore → **Import/Export** → export to a GCS bucket you control  
   **or** `gcloud firestore export gs://YOUR_BUCKET/kevos-backup-$(date)`  
2. Confirm the export finished before continuing.

### Stage 1 — Env vars on Vercel (rollback: remove new vars; redeploy previous)

| Variable | Purpose |
|----------|---------|
| `FIREBASE_PROJECT_ID` | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Admin SDK — full PEM; use `\n` between lines in Vercel. Bad format → clear 500 + logged reason (`ADMIN_KEY_FORMAT`) |
| `RESEND_API_KEY` | Email (rotate if ever exposed outside Vercel) |
| `EMAIL_FROM` | e.g. `Kevos <bookings@kevos.site>` |
| `UPSTASH_REDIS_REST_URL` | **Recommended** shared rate limit |
| `UPSTASH_REDIS_REST_TOKEN` | **Recommended** with URL above |
| `ALLOWED_ORIGINS` | Optional comma list. Defaults: `https://kevos.site`, `https://www.kevos.site`, `https://kebos.vercel.app`. Localhost only outside production/preview. |

**Rate limiting:** Prefer **Upstash** in production (works across all serverless instances).  
Without Upstash, APIs use Firestore collection `_rateLimits` (fixed window + `expireAt`).

**Firestore TTL (fallback only):** Firebase Console → Firestore → **TTL** → enable TTL on collection `_rateLimits`, field `expireAt` (timestamp). Docs are overwritten in-place each window; TTL deletes abandoned keys so the collection does not grow forever.

**Rollback:** unset new vars → redeploy previous Vercel deployment.

### Stage 2 — App deploy (APIs + frontend) BEFORE rules

Deploy so `/api/book`, `/api/cancel`, `/api/send-email` exist with Admin SDK.  
All three share `api/_lib/cors.js` (strict Origin; missing Origin → 403).

**Rollback:** Vercel → Deployments → Promote previous successful deployment.

### Stage 3 — Smoke tests (app live, **old rules** still OK)

1. Guest books from **https://kevos.site** → booking saved, confirmation email  
2. New cancel link works  
3. Legacy cancel link (doc-id token) works  
4. Barber cancel from dashboard (needs `staff:true` — Stage 4)  
5. Barber generates slots  
6. Confirm a forged Origin would be rejected (optional curl with `Origin: https://evil.example` → 403)

If guest book/cancel fails, **stop** and roll back Stage 2. Do **not** deploy rules.

### Stage 4 — Barber staff claim (rollback: clear claim)

1. Find UID: Firebase Console → **Authentication** → **Users** → copy **User UID**  
2. Delete any non-barber users  
3. Verify (read-only), then apply:

```bash
node scripts/check-staff-claim.js <BARBER_UID>
node scripts/set-staff-claim.js <BARBER_UID>           # dry-run
node scripts/set-staff-claim.js <BARBER_UID> --apply
node scripts/check-staff-claim.js <BARBER_UID>         # confirm staff:true
```

4. Barber **signs out**, then **signs in** once.

**Rollback:** `node scripts/set-staff-claim.js <BARBER_UID> --clear --apply` then sign out/in.

### Stage 5 — Consistency audit (read-only)

```bash
node scripts/audit-consistency.js
```

Do not auto-fix.

### Stage 6 — Firestore rules LAST

```bash
npx firebase use kebos-d63af
npx firebase deploy --only firestore:rules
```

**Rollback:** restore `firestore.rules.prev` and redeploy rules.

### Stage 7 — Smoke tests again

Repeat Stage 3. Confirm non-staff Auth users cannot read bookings / write schedules.

---

## Cancel-link compatibility

`/api/cancel` resolves token by document ID first, then `cancelToken` field.  
No booking ID migration. New bookings: `crypto.randomUUID()` = doc id = `cancelToken`.

---

## Client IP for rate limits

Uses `x-vercel-forwarded-for` when present; otherwise the **rightmost** hop of `x-forwarded-for` (not the client-spoofable leftmost value). See `api/_lib/clientIp.js`.

---

## Local tests (emulator only — not production)

Requires **JDK 21+**.

```bash
npm run test:cors
npm run test:client-ip
npm run test:admin-config
npm run test:ratelimit
npm run test:rules
npm run test:security
npm run build
```

---

## Staff model

- Custom claim `staff: true` via `scripts/set-staff-claim.js` (dry-run default; `--apply` writes)  
- Read-only check: `scripts/check-staff-claim.js`  
- Rules: `isStaff()` → `request.auth.token.staff == true`  
- Barber `/api/cancel`: Admin `verifyIdToken` + `decoded.staff === true` → else 403  
