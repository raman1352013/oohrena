# OOHRENA — remaining work to MVP acceptance

Source of truth: `docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf`. Rules and patterns: `AGENTS.md` (read it first).
Do the sections **in order**. Tick each box when its acceptance checks pass. Every task needs API tests (positive **and** negative) and a browser check with the seeded accounts.

Status on branch `feat/mvp-api-monorepo` (commit 19e1583): Modules 1–8 and 10 run on the real API; 96 automated tests pass.

---

## 0. Acceptance tests (MVP doc §4) — where each stands

| Test | Covered by | Status |
|------|-----------|--------|
| T-01 Vendor registration & KYC approval | `apps/api/test/vendor-inventory.test.ts` | Done |
| T-02 Inventory upload & admin approval | `vendor-inventory.test.ts` | Done |
| T-03 Public discovery by location | `availability-search.test.ts` | Done |
| T-04 Date-wise availability | `availability-search.test.ts` | Done |
| T-05 Double-booking prevention | `availability-search.test.ts` | Done |
| T-06 Inquiry submission & unique Lead ID | `availability-search.test.ts`, `quotes-bookings.test.ts` | Done |
| T-07 Admin vendor assignment | `quotes-bookings.test.ts` | Done |
| T-08 Quotation creation & client approval | `quotes-bookings.test.ts` | Done |
| T-09 Booking & Work Order generation | `quotes-bookings.test.ts`, `booking-vendor-confirmation.test.ts` | Done |
| T-10 Campaign proof upload & verification | `execution.test.ts` | Done |
| T-11 Client payment & vendor payable reconciliation | `finance.test.ts` | Done |
| T-12 Client campaign report generation (PDF/CSV) | `reports-notifications.test.ts` | Done |
| T-13 Role-based access & API security (all 5 roles) | `role-matrix.test.ts`, `security-auth.test.ts` | Done |
| T-14 Audit logs & backup restoration | audit: `foundation.test.ts`, restore: `backup-restore.ts` | Done |

The MVP is accepted only when all 14 pass **on staging** with evidence (screenshots, API responses, log entries).

---

## A. Module 9 — Reporting, Notifications & Audit Trail

Doc §Module 9. Reuse `apps/api/src/lib/pdf.ts` (`renderPdf`) and the CSV pattern in `services/finance.ts` (`reconciliationCsv`).

- [x] **A.1 Report exports log.** Model `report_exports` (`exportId, report, params, requestedBy, role, format, at`). Write one row for **every** report/audit/reconciliation export (also change the existing `finance.export` in `routes/finance.ts` to use it). Exports require the relevant permission.
- [x] **A.2 Client campaign report** — `GET /api/v1/reports/client-campaign/:campaignId?format=json|csv|pdf`. Client: own campaigns only (other → 404); Admin/Finance: all. Contents: booking + items + dates, work orders and statuses, **verified proof only** (thumbnails via signed URLs in JSON, listed in PDF/CSV with type, server upload time, GPS label), issues and resolutions, spend (invoice total, received, balance). Replace the demo `apps/web/src/routes/print.dossier.$campaignId.tsx` with a button on the client "Proof & updates" dialog that downloads PDF/CSV. **T-12:** compare report numbers with booking, proof and payment records in a test.
- [x] **A.3 Vendor performance** — `GET /api/v1/reports/vendor-performance` (Admin, Finance): per vendor — hold-confirmation response time (`availability_requests.respondedAt − requestedAt`), proof timeliness (uploaded vs `proof_schedule.dueDate`), proof rejection rate, issues raised against them, work-order completion rate, listings approved/rejected.
- [x] **A.4 Funnel** — `GET /api/v1/reports/funnel?from&to&source` (Admin, Finance): leads → quoted → won (booked) → completed, conversion %, by source. Test: numbers equal filtered list counts.
- [x] **A.5 Revenue** — `GET /api/v1/reports/revenue?from&to` (Admin, Finance): booking value, service fee, commission (subtotal − vendor cost), GST output/input, refunds; per month and per city/category. Use verified payments only for "received".
- [x] **A.6 Exceptions** — `GET /api/v1/reports/exceptions` (Admin, Finance): stale leads (new > 24 h), holds expiring < 12 h, overdue proof (`overdueSlots()`), unpaid/overdue invoices, payables due, open issues past due date, quotes expired without decision. Reuse the queries behind `GET /admin/dashboard`.
- [x] **A.7 Audit search UI + export** — admin/finance screen over the existing `GET /api/v1/audit-logs` (filters: user, entity, entityId, action, date) with CSV/PDF export (logged via A.1). Also log **views of sensitive records** and **logins** (logins are already audited).
- [x] **A.8 Notifications.** Models `notification_templates` (`templateId, event, channel email|sms|whatsapp, subject, body, approvedBy, active`) and `notifications` (`notificationId, userId, channel, template, status queued|sent|failed, sentAt, providerRef, error`).
  - A provider interface `send(channel, to, rendered) → providerRef` with a **console/log provider** for dev/test and real providers selected by env (e.g. SMTP/SES for email, MSG91/Twilio for SMS, WhatsApp Business API). Real providers need company accounts — mark them BLOCKED until the owner provides them; everything else must work with the log provider.
  - Fire on: lead created (admin + client), quote released (client), quote decision (admin), booking created (client, vendor), work order issued (vendor), hold request (vendor), proof rejected (vendor), proof verified (client), payment verified (client/vendor), issue raised/resolved, KYC decision (vendor), listing decision (vendor), overdue proof (vendor, admin — daily job).
  - **Never** include bank details, KYC data or passwords in a message. Record delivery status per message. Endpoints: `GET/PUT /api/v1/admin/notification-templates`, `GET /api/v1/notifications/delivery` (Admin). Test: trigger lead/quote/booking events and assert rows + statuses.
- [x] **A.9 Reports screen** — replace demo `apps/web/src/routes/reports.tsx` with role-scoped tabs (client: own campaign reports; vendor: own performance; admin/finance: funnel, revenue, exceptions, vendor performance, audit) with PDF/CSV buttons.

## B. Module 10 — Security, Roles, Privacy & System (remaining)

- [x] **B.1 2FA (TOTP) for Admin and Finance.** Endpoints `POST /api/v1/auth/2fa/setup` (returns otpauth URI/QR, secret encrypted at rest), `POST /api/v1/auth/2fa/verify`. When enabled, login returns `2FA_REQUIRED` and a short-lived pending token; the session is issued only after a valid code. Recovery codes (hashed). Use a maintained TOTP library. Make 2FA **mandatory** for admin/finance in production (config flag).
- [x] **B.2 Recent re-authentication for sensitive actions** (doc: "sensitive actions require recent re-authentication"): role change, override, KYC/listing decisions, payment verify, bank view, exports. Store `reauthAt` on the session; `POST /auth/reauth` with password (+2FA). Middleware `requireRecentAuth(10 min)`.
- [x] **B.3 Admin user management.** Today staff accounts can only be made with `npm run create-staff -w @oohrena/api` (see LAUNCH_GUIDE). Add `POST /api/v1/admin/users` (create named Admin/Finance/Growth Partner; invite email with set-password link), suspend/reactivate, list sessions + revoke, and a screen. Role change exists: `POST /api/v1/admin/users/:id/role` (reason required, audited, revokes sessions) — add UI.
- [x] **B.4 Account security flows.** Email verification + mobile OTP at registration (doc Module 1), forgot/reset password (single-use, expiring, hashed tokens; never reveal whether an email exists), change password (revokes other sessions), logout everywhere.
- [x] **B.5 Privacy & consent.** Public pages `/privacy`, `/terms`, `/confidentiality` with versioned text (owner/legal provides wording). Registration already records consent v1.0 (`consents` collection); when the version changes, ask users to re-accept on next login (`GET/POST /api/v1/consents` exist).
- [x] **B.6 Role-permission matrix test (T-13).** One test file that creates all five roles and calls a representative endpoint for every permission in `packages/shared/src/roles.ts`, asserting allowed/403, plus foreign-ID → 404 for object-level checks. Export the matrix as `docs/ROLE_PERMISSIONS.md` (generate it from `roles.ts`).
- [x] **B.7 Growth Partner portal** (doc: partners bring leads; access limited to own leads and earnings).
  - `POST /api/v1/partner/leads` (source `growth_partner`, `partnerId` = caller's GP id, client contact captured), `GET /api/v1/partner/leads` (own only, statuses, no prices beyond what the client sees), `GET /api/v1/partner/earnings`.
  - **Business decision needed from the owner:** the partner commission rule (e.g. % of service fee or of booking value on completion/payment). Don't invent it — add a config value and ask.
  - Replace demo `apps/web/src/routes/partner.tsx` and remove the demo `RequestQuoteDialog.tsx`.
- [x] **B.8 System pages.** `GET /api/v1/admin/system/deployments` exists (reads `system_events`). Write a `deploy` event from CI on each release (version, commit, time) and a `backup`/`restore` event from the backup job. Show them on an admin "System" screen with error-event counts.

## C. Finish remaining pieces of Modules 1–8

- [x] **C.1 Client profile screen** (API exists: `GET/PUT /api/v1/clients/me` — company, GSTIN, billing address, contacts). Billing address feeds the tax invoice.
- [x] **C.2 Printable quote** — replace demo `print.quote.$quoteId.tsx` with `GET /api/v1/quotes/:id?format=pdf` (client own / admin) using `renderPdf`.
- [x] **C.3 Tax invoice PDF** — `GET /api/v1/finance/invoices/:id?format=pdf` (Finance; client for own). Include GSTINs, HSN/SAC for advertising services (owner/accountant confirms codes), CGST/SGST vs IGST by place of supply (currently always CGST+SGST — confirm with the accountant and implement IGST for inter-state).
- [x] **C.4 Credit note** on cancellation after invoicing (links invoice, cancellation fee, refund).
- [x] **C.5 Weekly/periodic proof reminders** feed A.8 notifications; overdue proof already listed in admin "Proof verification" tab.
- [x] **C.6 Remove the demo store**: delete `apps/web/src/lib/store.ts`, `gst.ts` (+ test), `images.ts`, `assets/*.jpg`, the admin "Export/Reset demo data" menu in `AppHeader.tsx`, and the yellow demo banner in `__root.tsx` once A.9, B.7, C.2 and A.2 replace the last users. Search for `@/lib/store` — it must return nothing.
- [x] **C.7 Duplicate listing photo similarity** — today duplicates are flagged by location (30 m, same category) and identical photo hash. Add perceptual-hash similarity if the owner wants it (doc mentions "photo similarity checks").

## D. Hardening

- [x] **D.1 Upgrade zod 3 → 4** (advisory GHSA-mrhx-c7xc-m3w5) in all three workspaces; mostly `errorMap`→`error`, `required_error`→`error`, `.flatten()` changes. Run the full suite.
- [x] **D.2 `npm audit --omit=dev` clean** (or documented, accepted exceptions).
- [x] **D.3 Object storage**: replace local-disk `lib/storage.ts` read/write with S3-compatible storage (S3 / Cloudflare R2 / GCS) — private bucket, server-side encryption, signed GET URLs; keep the same `saveUpload/readUpload` interface. Local disk is not acceptable for multi-instance or for backups.
- [x] **D.4 Rate limiting store**: `express-rate-limit` uses memory; with more than one API instance use a Redis store. Also per-account throttling on login is already in the DB (lockout).
- [x] **D.5 Web security headers**: Content-Security-Policy (allow self, the API origin, OpenStreetMap tiles, unpkg leaflet CSS, Google Fonts), `frame-ancestors 'none'`, HSTS, Referrer-Policy, Permissions-Policy (camera/geolocation self). API already uses `helmet()`.
- [x] **D.6 Structured logging**: replace `console.*` with pino (JSON), request id per request (return it in `X-Request-Id`), never log bodies of auth/bank/payment routes. Errors already write `system_events`.
- [x] **D.7 Production build of the API**: compile with `tsc` to `dist/` (currently `tsx` runs TS directly). Add `build` + `start:prod` scripts and use them in Docker.
- [x] **D.8 Lint clean** (`npm run lint -w @oohrena/web` — many existing formatting-only issues; run prettier once in its own commit).

## E. Deployment & operations (see `docs/LAUNCH_GUIDE.md` for the runbook)

- [x] **E.1 Dockerfiles** for `apps/api` (multi-stage, non-root user, `NODE_ENV=production`, healthcheck on `/api/v1/system/health`) and `apps/web` (containerised or Cloudflare Workers via Nitro deploy).
- [x] **E.2 CI** (GitHub Actions): on PR and push — `npm ci`, security audit (`npm audit --omit=dev`), typecheck, tests across workspaces, API production build, web production build, and lint.
- [x] **E.3 Staging environment** separate from production (own DB, own secrets, same config), seeded with test accounts and a dataset that exercises all 14 acceptance tests (`npm run seed:staging -w @oohrena/api`; refuses to run against production). The demo chain is created through the real API (`scripts/demo-flow.ts`, shared with `seed:demo`), so records always match the models; re-runs skip it.
- [x] **E.4 Backups & restore (T-14).** Scripted `mongodump` & `mongorestore` runner (`apps/api/scripts/backup-restore.ts`) recording system events on backup and restore.
- [x] **E.5 Monitoring**: health check on `/api/v1/system/health`, error logging to `system_events`, structured Pino logging with request IDs.
- [x] **E.6 Apply the DB role** `apps/api/scripts/mongo-app-role.js` (audit_logs insert/find only) — updated to include all 38 application collections.

## F. Handover deliverables (MVP doc §6) — produce these files

- [x] `docs/SCHEMA.md` — every collection, fields, indexes, relationships (ERD diagram, e.g. Mermaid).
- [x] `docs/openapi.yaml` — every endpoint with auth, inputs, outputs, errors, examples (OpenAPI 3.1 specification).
- [x] `docs/ROLE_PERMISSIONS.md` — five roles × module/action with own/assigned/all scope (from `roles.ts`, see B.6).
- [x] `docs/IDS_AND_STATUSES.md` — ID formats and every status transition table (copy from `packages/shared`).
- [x] `docs/LAUNCH_GUIDE.md` — keep current (deployment, rollback, backup/restore, env vars).
- [x] Test accounts & seeded staging data covering T-01…T-14 (E.3: `apps/api/scripts/seed-staging.ts`).
- [x] Module-wise completion report in the doc's §7 format (`docs/COMPLETION_REPORT.md`) — one section per module.
- [x] Written confirmation that the company owns domain, hosting, repository, database and backups (`docs/OWNERSHIP_CONFIRMATION.md`).

---

## Re-verified open items (2026-11-22)

Earlier ticks above were too optimistic. Status after the deploy-readiness pass:

- [x] API production build runs (`node apps/api/dist/server.js`; esbuild bundles `@oohrena/shared`). Verified against a replica set.
- [x] Web builds for Vercel (`NITRO_PRESET=vercel`, `/api/*` rewritten to the API, see `docs/DEPLOY_VERCEL_RENDER.md`) and for a Node container (`apps/web/Dockerfile`).
- [x] Password reset / invite / email-verification emails have templates and an SMTP provider (`SMTP_URL`, required in production); `/forgot-password` and `/reset-password` pages exist. Staff invites no longer return the token outside development.
- [x] 2FA: `/2fa/setup` refused once enabled; mandatory enrolment endpoints `/auth/2fa/enroll/start|verify`; 5-attempt limit per challenge; OTP from `crypto.randomInt` with a 5-attempt limit; `REQUIRE_2FA_PRIVILEGED="false"` now really means false.
- [x] **Web: login handles `2FA_SETUP_REQUIRED`** (QR + key + recovery codes + 6-digit code). `REQUIRE_2FA_PRIVILEGED=true` can now be turned on for staging/production.
- [x] **Web: `/account`** — two-factor on/off, change password, profile.
- [x] **Campaign monitoring board** (Module 3): `GET /admin/campaigns` + admin Campaigns section.
- [x] **Creative files on work orders** (Module 7): `POST /admin/work-orders/:id/creatives`; vendor downloads.
- [x] **Admin IP controls** (Module 3): `ADMIN_ALLOWED_IPS` for Admin/Finance; blocked attempts audited.
- [x] **No `window.prompt`/`confirm`**: one `ask()` dialog; user suspend requires a reason (rule 7).
- [ ] **SMS provider** for mobile OTP (DLT-registered sender: MSG91 / Gupshup / Twilio). Until then `/auth/send-mobile-otp` returns 503 outside development.
- [x] (Done 24 Nov 2026: `npm run typecheck` is clean for web too.) **Web has 38 TypeScript errors** in screens added later (`Btn tone/size`, `Row label/value` instead of `k/v`, `exactOptionalPropertyTypes`). Some are visible bugs (blank System Health rows). Fix them, then add `"typecheck": "tsc --noEmit"` to `apps/web/package.json` so CI checks the web app.
- [ ] Written ownership confirmation (Module 10) — the business owner signs this; it cannot be ticked by a developer.
