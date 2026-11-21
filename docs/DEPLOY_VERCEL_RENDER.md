# Deploying OOHRENA: web on Vercel, API on Render

```
Browser ──► Vercel (apps/web)  ──/api/* CDN rewrite──►  Render (apps/api)  ──►  MongoDB (replica set)
            oohrena.vercel.app                          oohrena-api.onrender.com     + S3/R2 bucket, SMTP
```

The browser only ever talks to the Vercel domain. Vercel forwards `/api/*` to Render, so the
HttpOnly session cookie is first-party. **Do not** point the web app straight at `onrender.com`
with `VITE_API_URL`: `vercel.app` and `onrender.com` are different sites and the `SameSite=Lax`
login cookie would not be sent, so nobody could stay logged in.

Order: database → bucket + email → Render (API) → Vercel (web) → put the Vercel URL into Render's `CORS_ORIGINS`.

## 1. Database

Any MongoDB **replica set** (transactions are required). MongoDB Atlas (M10+ for production, region Mumbai `ap-south-1`) is the simplest choice.
- Create a database user for the app with the `oohrenaApp` role from `apps/api/scripts/mongo-app-role.js` (audit log is insert-only).
- Network access: allow Render's outbound IPs (Render → service → Connect → Outbound), not `0.0.0.0/0`.
- Turn on continuous backup / point-in-time restore.
- Connection string → `MONGODB_URI`, with database name `oohrena`.

## 2. File storage and email

- **Files**: Render's disk is wiped on every deploy, so uploads (KYC, photos, proof, payment evidence) **must** go to a private bucket: Cloudflare R2 or AWS S3, private, versioning on. Fill `S3_*`.
- **Email**: any SMTP provider (Amazon SES Mumbai, Brevo, Postmark, Zoho ZeptoMail). Verify the sender domain (SPF + DKIM). Fill `SMTP_URL` and `EMAIL_FROM`. The API refuses to start in production without `SMTP_URL`, because password reset and staff invites depend on it.
- **SMS** is not integrated yet (needs a DLT-registered sender). Mobile OTP returns `503 SMS_NOT_CONFIGURED` outside development.

## 3. API on Render

Render → **New → Blueprint** → select this repository; `render.yaml` creates `oohrena-api`.
Render asks for every `sync: false` value:

| Variable | Value | Secret? |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://USER:PASSWORD@cluster…/oohrena?retryWrites=true&w=majority` | yes |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Back it up in a password manager**: losing it makes bank numbers and KYC files unreadable. Never change it after data exists. | yes |
| `CORS_ORIGINS` | the Vercel URL(s), comma-separated, e.g. `https://oohrena.vercel.app,https://oohrena.com` | no |
| `PUBLIC_WEB_URL` | the main web URL used in emails, e.g. `https://oohrena.vercel.app` | no |
| `SMTP_URL` | `smtps://USER:PASSWORD@smtp.provider.com:465` | yes |
| `EMAIL_FROM` | `OOHRENA <no-reply@yourdomain.com>` | no |
| `S3_BUCKET` | bucket name | no |
| `S3_REGION` | `auto` for R2, `ap-south-1` for S3 Mumbai | no |
| `S3_ENDPOINT` | R2: `https://<account-id>.r2.cloudflarestorage.com`; leave empty for AWS | no |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | bucket-scoped key | yes |

Already set by `render.yaml`: `NODE_VERSION=22`, `NODE_ENV=production`, `TRUST_PROXY=2`,
`MONGOMS_DISABLE_POSTINSTALL=1`, `REQUIRE_2FA_PRIVILEGED=false`.
Optional: `REDIS_URL` (only when running 2+ instances), `LOG_LEVEL`, `RATE_LIMIT_PER_MINUTE`,
`AUTH_RATE_LIMIT_PER_MINUTE`, `SESSION_TTL_HOURS`, `HOLD_HOURS`, `DEFAULT_MARGIN_PCT`, `PARTNER_COMMISSION_PCT`.
**Never** set `SEED_PASSWORD` on production.

Check: `https://oohrena-api.onrender.com/api/v1/system/health` → `{"data":{"status":"ok","db":"up",…}}`.

**First admin** (Render → service → Shell):

```sh
STAFF_PASSWORD='<strong password>' node apps/api/dist/scripts/create-staff.js --role admin --email admin@yourdomain.com --name "Full Name" --mobile +91XXXXXXXXXX
```

Then sign in, and add the other named staff from **Control Tower → User Management** (they get an invite email).

## 4. Web on Vercel

Vercel → **Add New → Project** → import the repo:
- **Root Directory**: `apps/web`. Framework preset: *Other*. Install and build commands come from `apps/web/vercel.json`.
- **Environment variables** (Production and Preview):

| Variable | Value |
|---|---|
| `NITRO_PRESET` | `vercel` |
| `API_PROXY_ORIGIN` | `https://oohrena-api.onrender.com` (your Render URL, no trailing slash) |
| `MONGOMS_DISABLE_POSTINSTALL` | `1` |

Leave `VITE_API_URL` **unset** (same-origin through the rewrite). These are build-time values: redeploy after changing them.

Then go back to Render and make sure `CORS_ORIGINS` and `PUBLIC_WEB_URL` contain the exact Vercel URL (`https://…`, no trailing slash). Redeploy the API.

## 5. Smoke test after every deploy

1. Open the site, register a client, log out, log in.
2. "Forgot password" → the email arrives → the link opens `/reset-password` on the Vercel domain.
3. Admin: approve a vendor and a listing; client: request a quote; the full chain from `docs/LAUNCH_GUIDE.md` §8.
4. Upload a KYC document and a proof photo, redeploy the API, and confirm the files still open (proves S3 is in use).

## Custom domain (recommended before launch)

Add `oohrena.com` in Vercel. Optionally add `api.oohrena.com` in Render. Keep the `/api` rewrite either way.
Update `CORS_ORIGINS`, `PUBLIC_WEB_URL` and `API_PROXY_ORIGIN`, then redeploy both.
