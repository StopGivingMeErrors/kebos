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

---

## Ordered plan

### Stage 0 — Backup (rollback: N/A; keep the export)

1. Firebase Console → Firestore → **Import/Export** → export to a GCS bucket you control  
   **or** `gcloud firestore export gs://YOUR_BUCKET/kevos-backup-$(date)`  
2. Confirm the export finished before continuing.

### Stage 1 — Env vars on Vercel (rollback: remove new vars; redeploy previous)

Add (do not commit real values):

| Variable | Purpose |
|----------|---------|
| `FIREBASE_PROJECT_ID` | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Admin SDK (paste with `\n` or real newlines) |
| `RESEND_API_KEY` | Email (rotate if ever exposed outside Vercel) |
| `EMAIL_FROM` | e.g. `Kevos <bookings@kevos.site>` |
| `UPSTASH_REDIS_REST_URL` | Optional; rate limit via Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Optional; without these, Firestore `_rateLimits` fallback is used |

**Rollback:** unset new vars → redeploy previous Vercel deployment.

### Stage 2 — App deploy (APIs + frontend) BEFORE rules

Deploy the app so `/api/book`, `/api/cancel`, `/api/send-email` exist with Admin SDK.

**Rollback:** Vercel → Deployments → Promote previous successful deployment.

### Stage 3 — Smoke tests (app live, **old rules** still OK)

1. Guest books a slot → booking saved, confirmation email arrives  
2. New cancel link in email works (`/cancel-booking?token=…`)  
3. An **existing legacy** cancel link (doc-id token) still works  
4. Barber cancels from dashboard (must already have `staff:true` claim — see Stage 4 if login works but cancel returns 403)  
5. Barber generates slots  

If guest book/cancel fails, **stop** and roll back Stage 2. Do **not** deploy rules.

### Stage 4 — Barber staff claim (rollback: clear claim)

1. Find UID: Firebase Console → **Authentication** → **Users** → copy the barber’s **User UID**  
2. Delete any non-barber users in Authentication (if sign-up was ever open)  
3. Dry-run then apply (from a machine with Admin env loaded, **you** run this — not CI):

```bash
node scripts/set-staff-claim.js <BARBER_UID>
node scripts/set-staff-claim.js <BARBER_UID> --apply
```

4. Barber **signs out** of the dashboard, then **signs in** once (ID token must refresh to include `staff:true`).

**Rollback:**

```bash
node scripts/set-staff-claim.js <BARBER_UID> --clear --apply
```

Then barber signs out/in again.

### Stage 5 — Consistency audit (read-only)

```bash
node scripts/audit-consistency.js
```

Review orphans / double bookings. **Do not auto-fix.** Decide manually if anything needs repair.

### Stage 6 — Firestore rules LAST

```bash
npx firebase login
npx firebase use kebos-d63af
npx firebase deploy --only firestore:rules
```

Rules require `request.auth.token.staff == true` for schedule writes and booking reads.  
Guests use APIs only. Staff cannot write `bookings` from the client (cancel via `/api/cancel`).

**Rollback:** restore `firestore.rules.prev` and `npx firebase deploy --only firestore:rules`.

### Stage 7 — Smoke tests again (after rules)

Repeat Stage 3. Also confirm:

- Random signed-in user **without** `staff` cannot open dashboard data (permission-denied on bookings list)  
- Guest still books/cancels via API  

---

## Cancel-link compatibility

No booking ID migration. `/api/cancel` resolves:

1. `bookings/{token}` by document ID (legacy + current)  
2. Query `cancelToken == token`  

New bookings: `crypto.randomUUID()` = document id = `cancelToken`.

---

## Local tests (emulator only — not production)

Requires **JDK 21+** on `PATH`.

```bash
npm run test:rules
npm run test:book-concurrency
npm run test:book-concurrency:unit
node tests/statsLogic.test.js
node tests/rateLimit.test.js
npm run build
```

---

## Staff model

- Custom claim `staff: true` (not “any signed-in user”)  
- `scripts/set-staff-claim.js` dry-run by default; `--apply` writes  
- Rules: `isStaff()` → `request.auth.token.staff == true`  
- `/api/cancel` barber path: Admin `verifyIdToken` + `decoded.staff === true` → else 403  
