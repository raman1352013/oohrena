# OOHRENA — launch guide (staging first, then production)

Read `AGENTS.md` first. Finish `docs/REMAINING_WORK.md` sections A–E before going live; the MVP document requires all 14 acceptance tests to pass **on staging** with evidence.

Rule from the MVP doc (§8.7): **the company owns and controls** the domain, hosting, repository, database and backups. Create every account below under a company email, with 2FA, and at least two named company admins. Never share one login.

---

## 1. Target setup (recommended)

| Piece | Recommendation | Why |
|------|----------------|-----|
| Database | **MongoDB Atlas**, region Mumbai (`ap-south-1`), dedicated tier (M10+) | Replica set (transactions are required for holds/bookings), automated backups, point-in-time restore |
| API | Docker container on a managed host in Mumbai (AWS ECS/App Runner, Google Cloud Run, Render, Railway) — at least 2 instances behind HTTPS | Stateless; scale horizontally once uploads are on object storage (REMAINING_WORK D.3) and rate limits use Redis (D.4) |
| Files (KYC docs, photos, proof, payment evidence) | Private S3-compatible bucket (S3 / Cloudflare R2 / GCS) with versioning | Without `S3_BUCKET`, staging/production store files in MongoDB GridFS (`FILE_STORAGE=mongo`, the default there), so they survive redeploys and are covered by database backups. Each file records its backend, so moving to S3 later keeps older files readable. |
| Web | The current build targets **Cloudflare Workers** (nitro default in the Lovable Vite config): `npm run build -w @oohrena/web` then `npx nitro deploy --prebuilt` from `apps/web`. Alternatively switch the nitro preset to `node-server` and run it as a container. | |
| Domains | `oohrena.com` (web) and `api.oohrena.com` (API) — same parent domain | The session cookie is `SameSite=Lax`; web and API must be **same-site** (same registrable domain) for the browser to send it |
| Secrets | The host's secret manager (AWS Secrets Manager / GCP Secret Manager / Render env groups) | Never in the repo, chat or tickets |

Create **two complete environments**: `staging` and `production`, each with its own database, bucket, secrets and domain (`staging.oohrena.com` / `api.staging.oohrena.com`).

## 2. Environment variables (API)

Defined and validated in `apps/api/src/config.ts`. With `NODE_ENV=production` or `staging` the API **refuses to start** without `DATA_ENCRYPTION_KEY`, and production requires `BCRYPT_COST ≥ 12`. Cookies are automatically `Secure` in staging/production.

| Variable | Production value |
|---------|------------------|
| `NODE_ENV` | `production` (or `staging`) |
| `PORT` | port your host expects (e.g. `4000`) |
| `MONGODB_URI` | Atlas SRV string for a DB user that has only the `oohrenaApp` role (§3) |
| `CORS_ORIGINS` | `https://oohrena.com,https://www.oohrena.com` (exact origins, comma-separated) |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Losing it makes bank numbers and KYC/payment files unreadable**: keep it in the secret manager **and** an offline sealed copy held by the owner. Different key per environment. |
| `FILE_STORAGE` | `s3`, `mongo` or `disk` (default: s3 with a bucket, else mongo in staging/production) |
| `UPLOAD_DIR` | local path, only used when `FILE_STORAGE=disk` (development) |
| `TRUST_PROXY` | `1` behind one load balancer/proxy (needed for correct client IPs in rate limits and audit logs) |
| `SESSION_TTL_HOURS` | `12` |
| `BCRYPT_COST` | `12` |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_MINUTES` | `5` / `15` |
| `RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` | `300` / `10` |
| `HOLD_HOURS` | `48` |
| `DEFAULT_MARGIN_PCT` | business decision (default `20`) |
| `SEED_PASSWORD` | **do not set in production** |

Web build variable: `VITE_API_URL=https://api.oohrena.com` (set at **build** time).

## 3. Database (MongoDB Atlas)

1. Create the project and an M10+ cluster in Mumbai. Enable **Cloud Backup** (daily snapshots + continuous/point-in-time) and set retention per company policy.
2. Network access: allow only the API hosts' egress IPs (or VPC peering / private endpoint). Never `0.0.0.0/0` in production.
3. Create a custom role equivalent to `apps/api/scripts/mongo-app-role.js` (insert+find only on `audit_logs`; CRUD on the other collections — update the list as described in REMAINING_WORK E.6), then a DB user `oohrena_app` with only that role. Use a separate admin user (kept by the owner) for maintenance.
4. On first start the API creates indexes automatically (`syncIndexes` in `src/db.ts`).
5. For existing databases upgraded to quick vendor sign-up (T2), run the index migration once to ensure the old `pan_1` index is dropped and replaced with the partial unique index:
   ```sh
   npm run migrate:pan-index -w @oohrena/api
   ```

## 4. Deploy the API

Until REMAINING_WORK D.7/E.1 add a compiled build and Dockerfile:

```sh
npm ci
npm run typecheck && npm test        # never deploy a red build
npm start -w @oohrena/api            # runs apps/api/src/server.ts
```

Health check: `GET https://api.oohrena.com/api/v1/system/health` → `{"data":{"status":"ok","db":"up",...}}`. Each start writes a `deploy` event to `system_events`.

## 5. Create the first admin (production has no test accounts)

Run once from a trusted machine with the production env loaded (PowerShell example):

```powershell
$env:STAFF_PASSWORD = "<a long unique password>"
npm run create-staff -w @oohrena/api -- --role admin --email ops@yourcompany.com --name "Full Name" --mobile +919800000000
```

Create at least **two** Finance users the same way (`--role finance`) — maker-checker needs two different people. Clear `STAFF_PASSWORD` afterwards. Once REMAINING_WORK B.1/B.3 are done, enable 2FA and manage further staff from the admin screen.

## 6. Deploy the web app

```sh
npm ci
VITE_API_URL=https://api.oohrena.com npm run build -w @oohrena/web
cd apps/web && npx nitro deploy --prebuilt     # Cloudflare; or containerise the node-server preset
```

Point `oohrena.com` at it. Before launch, remove the demo store and demo banner (REMAINING_WORK C.6) so nothing sample is shown publicly.

## 7. DNS, HTTPS and email

- HTTPS only (HSTS), valid certificates on both domains; redirect HTTP → HTTPS.
- Add SPF/DKIM/DMARC for the sending domain before enabling email notifications (REMAINING_WORK A.8).

## 8. Smoke test after every deploy (≈10 minutes, on staging first)

1. Health endpoint OK.
2. Register a test client; log out/in; wrong password ×5 → locked.
3. Register a test vendor, upload PAN; admin approves KYC; vendor creates a listing with a photo and submits; admin approves → it appears in marketplace search.
4. Client sends an inquiry → appears in the admin inbox; admin assigns vendor, builds and releases a quote → client approves → admin creates booking and work order → vendor sees it.
5. Vendor uploads installation proof → admin verifies → client sees it in "Proof & updates".
6. Finance raises invoice, records a payment with evidence; a **second** Finance user verifies; reconciliation PDF downloads.
7. Check the audit log shows each step with user and time.

## 9. Backups & restore drill (T-14 — must be done before go-live)

1. Confirm Atlas snapshots exist. Independently, run a scheduled export and keep it off-site (different provider/account), encrypted:
   ```sh
   mongodump --uri "$MONGODB_URI" --archive=oohrena-$(date +%F).gz --gzip
   ```
   Back up the file bucket (versioning + replication) together with the database.
2. **Restore drill** into staging (never into production):
   ```sh
   mongorestore --uri "$STAGING_ADMIN_URI" --archive=oohrena-YYYY-MM-DD.gz --gzip --drop
   ```
   Use the **same `DATA_ENCRYPTION_KEY`** as the source environment for that drill, otherwise encrypted fields/files can't be read. Then log in, open a booking, its proof, its reconciliation, and the audit log. Record date, operator, backup used and result as a `restore` system event and in the handover report.
3. Repeat the drill on a schedule (e.g. monthly) and after major releases.

## 10. Rollback

- **Code**: redeploy the previous container image / commit (keep the last 5 images). The web app is static assets — redeploy the previous build.
- **Data**: there are no destructive migrations yet. If a release must change existing data, ship it as a reviewed script, take an on-demand snapshot first, and keep a reverse script. Never edit `audit_logs`.
- If a release corrupts data: put the API in maintenance (stop traffic), restore the snapshot to a new cluster, verify, then switch `MONGODB_URI`.

## 11. Go-live checklist

- [ ] All 14 acceptance tests pass on staging with evidence; REMAINING_WORK sections A–E done.
- [ ] No demo/sample data or banner in production; seed scripts never run against production.
- [ ] Company owns domain, hosting, repo, DB, bucket and backups; at least two company admins on each.
- [ ] `DATA_ENCRYPTION_KEY` stored in the secret manager + sealed offline copy.
- [ ] Backup restore drill done and recorded.
- [ ] 2FA on for all Admin/Finance users; staff accounts named; no shared logins.
- [ ] Privacy policy, terms and confidentiality/anti-circumvention texts approved by legal and published.
- [ ] Monitoring and alerting active (health, errors, DB, storage).
- [ ] Trust rules (MVP doc §8): no unverified stats or reach claims; no "Zero Lead Leakage" claim — use "Centralised Lead Tracking & Audit Trail"; GPS/availability claims match what the system really does.
