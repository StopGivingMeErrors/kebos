# Security deploy notes (book/cancel APIs + rules)

## What changed

- Guests book via `POST /api/book` (Admin SDK transaction + confirmation email).
- Guests cancel via `GET/POST /api/cancel` with `cancelToken` from the email link.
- Barber cancels via `POST /api/cancel` with `bookingId` + Firebase ID token.
- `/api/send-email` no longer accepts a caller-supplied `to`; it loads the booking email server-side.
- Origin is **required** and allowlisted; per-IP rate limits apply.
- Firestore rules: public read on `schedules` only; all booking/schedule **writes** and booking **reads** are signed-in staff only (Admin SDK bypasses rules on the server).

## Cancel-link compatibility (no data migration)

Existing emails use `/cancel-booking?token=<bookingDocId>` because older code set
`booking document id === cancelToken`.

`/api/cancel` resolves tokens in this order:

1. `bookings/{token}` by **document ID** (covers all current live cancel links)
2. Query `where cancelToken == token` (fallback)

New bookings still use `crypto.randomUUID()` as **both** the document ID and the
`cancelToken` field, so new cancel URLs keep the same shape. **Do not rewrite
existing booking IDs.**

## Deploy order (important)

1. Add Firebase Admin env vars on Vercel (below) and redeploy so `/api/book` and `/api/cancel` exist.
2. Deploy this frontend (guest flow calls the APIs).
3. **Only then** deploy Firestore rules:
   ```bash
   cd kebos
   npx firebase login
   npx firebase use kebos-d63af
   npx firebase deploy --only firestore:rules
   ```
   Deploying rules before the APIs will break guest book/cancel.

## Vercel env vars to add

| Variable | Notes |
|----------|--------|
| `FIREBASE_PROJECT_ID` | e.g. `kebos-d63af` |
| `FIREBASE_CLIENT_EMAIL` | service account email |
| `FIREBASE_PRIVATE_KEY` | full private key; in Vercel UI paste with real newlines or `\n` escapes |
| `RESEND_API_KEY` | already set |
| `EMAIL_FROM` | already set |

Never commit the service account JSON.

## Local verification

Requires **JDK 21+** on `PATH` (Firebase emulator). On this machine:
`C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot`.

```bash
npm run test:rules
npm run test:book-concurrency
npm run test:book-concurrency:unit
npm run build
```

APIs need `vercel dev` (or a deployed preview) because CRA alone does not run `/api/*`.

## Migration checklist for existing bookings

- [ ] No Firestore document rewrite required for cancel tokens.
- [ ] Old cancel links keep working after API deploy (lookup by doc id).
- [ ] After rules deploy, guest client can no longer `getDoc` bookings — cancel page must use `/api/cancel` (already wired).
- [ ] Dashboard already hides `status === "cancelled"`; cancel now marks cancelled instead of deleting.
