# Kevos

Online appointment booking for a barber shop. Guests pick an open slot and leave a name and email — **no customer accounts**. The barber manages the schedule from a private dashboard.

## Why no guest accounts

Most customers book once and leave. Forcing sign-up adds friction and stores passwords you do not need. Possession of the cancel link (token in the email) is enough for a guest to cancel. The barber signs in with Firebase Auth and a custom claim.

## Architecture

| Piece | Role |
| --- | --- |
| React (Create React App) | Public booking UI, cancel page, barber dashboard & statistics |
| Vercel serverless (`api/`) | `book`, `cancel`, `send-email`, `health` — Firebase Admin SDK |
| Cloud Firestore | Schedules and bookings |
| Resend | Confirmation and cancellation emails |
| Upstash Redis (REST) | Rate limiting (Firestore `_rateLimits` only as fail-open fallback) |

```
Guest browser ──► React SPA ──► /api/book | /api/cancel ──► Firestore + Resend
Barber browser ─► Dashboard (Auth + staff claim) ──► Firestore (client reads)
```

## Security model

| Actor | Can | Enforced by |
| --- | --- | --- |
| Anyone | Read open slots; book via API; cancel via email token | Public slot reads; Admin SDK for book/cancel writes |
| Guest with cancel link | Preview date/time/name; POST cancel | Token = booking document id (legacy compatible); preview omits email |
| Barber (`staff: true` claim) | Dashboard, schedules, read bookings, staff cancel | Firebase Auth custom claim + Firestore rules |
| Other signed-in users | Nothing sensitive | Rules deny non-staff |

Additional controls:

- **Origin allowlist** on mutating APIs (POST). Cancel **GET** preview also accepts same-origin browser requests that omit `Origin` (`Sec-Fetch-Site: same-origin` or allowlisted `Referer`).
- **Rate limiting** per IP (and email on book) via Upstash when configured.
- Staff claim set with `scripts/set-staff-claim.js` (operator only). Barber must sign out and in once after the claim is set.

## Data model

**`schedules/{slotId}`** — `date` (ISO), `time`, `isBooked`

**`bookings/{cancelToken}`** — document id is the cancel token (`crypto.randomUUID()`). Fields include `name`, `email`, `slotId`, `date`, `time`, `status` (`active` \| `cancelled`), `cancelToken`, `timestamp`.

**`_rateLimits/{id}`** — server-only rate windows (Admin SDK); clients denied by rules.

## Environment variables (names only)

Set these on Vercel (Production). Values never belong in git.

| Name | Used for |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Admin SDK (PEM with `\n` newlines) |
| `RESEND_API_KEY` | Email |
| `EMAIL_FROM` | From header |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limit (preferred) |
| or `*_KV_REST_API_URL` / `*_KV_REST_API_TOKEN` | Vercel KV-style Upstash REST |
| `ALLOWED_ORIGINS` | Optional comma-separated origin override |

Client Firebase config lives in `src/firebase/firebaseConfig.js` (public web API key only).

## Local development

```bash
npm ci
npm start
```

Emulator tests (Java 21 required for the Firestore emulator):

```bash
# Windows example
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

npm run test:security
npm run build
```

Individual suites: `test:rules`, `test:book-concurrency`, `test:ratelimit`, `test:cors`, `test:client-ip`, `test:stats`, `test:stats-cache`, `test:admin-config`, `test:upstash-env`.

Staff claim (operator, with Admin credentials in env — never commit keys):

```bash
node scripts/set-staff-claim.js <UID> --apply
node scripts/check-staff-claim.js <UID>
```

## Screenshot

<!-- SCREENSHOT: paste a public booking or dashboard image here -->

_Add a screenshot of the booking page or dashboard when available._

## License

Private project — all rights reserved.
