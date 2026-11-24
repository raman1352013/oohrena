# OOHRENA — Vendor Blueprint Implementation & Verification Report (Phase P0 & P1)

> **Prepared for:** Product Owner & Senior Technical Reviewer (Claude)  
> **Date:** November 2026  
> **Branch:** `feat/vendor-blueprint-p0-p1`  
> **Repository:** `oohrena` (npm workspaces monorepo: `apps/api`, `apps/web`, `packages/shared`)  
> **Base Specifications:**  
> - `AGENTS.md` (mandatory architectural and security rules)  
> - `docs/OOHRENA_Vendor_Dashboard_Technical_Blueprint.pdf` (28-page technical specification)  
> - `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` (build plan & acceptance test matrix)  
> - `docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf` (core marketplace requirements)

---

## 1. Executive Summary

All tasks in **Phase P0 (Auth, Roles, Audit Core, Config, Files)** are **100% completed, tested, and committed** to the `feat/vendor-blueprint-p0-p1` branch. The codebase strictly adheres to the non-negotiable rules defined in `AGENTS.md` §4, the decisions in `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` (§Decisions table), and the role/permission matrix in `packages/shared/src/roles.ts`.

### Health & Quality Gates
| Gate | Status | Command | Details |
|---|---|---|---|
| **TypeScript Typecheck** | **PASS (0 errors)** | `npm run typecheck` | Validated across `@oohrena/shared`, `@oohrena/api`, and `@oohrena/web`. |
| **Unit & Integration Tests** | **PASS (161+ tests)** | `npm test` | All tests pass in in-memory MongoDB replica sets. |
| **Web Production Build** | **PASS** | `npm run build -w @oohrena/web` | Vite + TanStack Start SSR/client bundles build cleanly. |
| **Git Working Tree** | **CLEAN** | `git status` | 5 clean, atomic commits on `feat/vendor-blueprint-p0-p1`. |

---

## 2. Commit Log on `feat/vendor-blueprint-p0-p1`

1. `e26e76a`: `feat(vendor): V0.1 vendor team roles and §2.1 RBAC matrix enforcement`
2. `9d9ba06`: `feat(system): V0.2 system_settings with versioned defaults and maker-checker`
3. `afde209`: `feat(staff): V0.3 new staff roles verifier ops auditor and admin maker-checker`
4. `a709fe9`: `feat(audit): V0.4 tamper-evident audit log with hash chain, actorType and append-only pre-hooks`
5. `c01faee`: `feat(jobs): V0.5 background job runner with distributed locking and V0.6 standard request_id error reporting`

---

## 3. Detailed Breakdown of Completed Tasks (Phase P0)

### Task V0.1 — Vendor Internal Team Roles & §2.1 RBAC Matrix
- **Objective:** Support multi-user vendor organizations with differentiated roles and least-privilege scoping.
- **Architectural Implementation:**
  - **Model:** `apps/api/src/models/foundation.ts` — `VendorUser` collection (`vendorId`, `userId`, `role` in `owner`, `manager`, `field`, `accounts`).
  - **Shared RBAC:** `packages/shared/src/roles.ts` — Added `VENDOR_ROLES` (`owner`, `manager`, `field`, `accounts`) and role labels.
  - **Middleware & Route Gating:** `apps/api/src/middleware/auth.ts`:
    - `requireVendorSubRole(...roles)` validates internal vendor team permissions.
    - `requireWorkOrderFieldAccess()` restricts field executives to view and upload proof only for work orders explicitly assigned to them.
    - Enforced blueprint §2.1 matrix: accounts role cannot execute work orders; field role cannot access bank accounts, payables, or edit listings; only owners can invite or remove team members.
  - **Web UI:** `apps/web/src/components/app/vendor/TeamPanel.tsx` — Team management interface for vendor owners to invite colleagues and assign roles.
  - **Acceptance Tests:** `apps/api/test/vendor-rbac.test.ts` (11 tests passing):
    - `AT-RBAC-01`: Field executive blocked from bank/listing edits (returns 403).
    - `AT-WO-01`: Unassigned work orders return 404 for field executives (preventing ID probing).
    - `AT-WO-02`: Assigned field executives can read and upload proof on designated work orders.
    - `AT-SEC-01`: Removed vendor team member tokens immediately rejected on next request.

---

### Task V0.2 — Versioned `system_settings` Core
- **Objective:** Eliminate hard-coded operational thresholds; provide dynamic versioned settings with maker-checker on sensitive keys.
- **Architectural Implementation:**
  - **Model:** `apps/api/src/models/settings.ts` — `SystemSetting` (`key`, `value`, `effectiveFrom`, `changedBy`, `makerApprovedBy`) and `SystemSettingHistory`.
  - **Blueprint Default Thresholds Seeded:**
    - GPS accuracy & radius: `gps.max_accuracy_m = 20`, `gps.photo_pin_max_m = 50`, `asset.duplicate_radius_m = 15`
    - Re-verification cycles: `reverify.cycle_days = 90`, `reverify.high_risk_days = 60`, `reverify.reminders = [30, 14, 7, 1]`
    - Verifier & Photo policies: `verifier.sla_days = 3`, `photo.max_age_days = 30`, `photo.min_long_side_px = 1600`, `photo.max_mb = 15`, `photo.gallery_allowed = false`
    - Commercial & Availability rules: `rate.change_guard_pct = 25`, `hold.payment_window_h = 48`, `quote.valid_days = 5`, `enquiry.ack_sla_h = 24`, `enquiry.quote_sla_h = 48`, `availability.reminder_days = 14`, `availability.unconfirmed_days = 30`
    - Proof, Payout & Dispute windows: `proof.max_upload_delay_h = 2`, `proof.inspection_every_days = 7`, `bank.payout_hold_h = 48`, `dispute.window_days = 5`, `location.retention_days = 90`
    - Scorecard weights: `score.weights = { inventory_accuracy: 25, response_time: 15, execution_timeliness: 20, proof_quality: 15, availability_reliability: 10, buyer_rating: 10, compliance: 5 }`
  - **Maker-Checker Security:** Sensitive keys (`bank.payout_hold_h`, `rate.change_guard_pct`, `reverify.cycle_days`, `score.weights`) cannot be altered by a single admin; requires proposal by one admin and approval by a second distinct admin.
  - **Service:** `apps/api/src/services/settings.ts` (`getSetting`, `setSetting`, `approveSettingChange`, `initSettings`).
  - **API Routes:** `apps/api/src/routes/settings.ts` mounted at `/api/v1/admin/settings`.
  - **Web UI:** `apps/web/src/components/app/admin/SettingsPanel.tsx`.
  - **Acceptance Tests:** `apps/api/test/settings.test.ts` (5 tests passing).

---

### Task V0.3 — New Staff Roles (`verifier`, `ops`, `auditor`) & Admin Maker-Checker
- **Objective:** Separate administrative powers across verification, operations, and compliance; enforce dual-authorization for sensitive administrative actions.
- **Architectural Implementation:**
  - **Roles Defined:** Added to `STAFF_ROLES` in `packages/shared/src/roles.ts`:
    - `verifier`: KYC document review and inventory listing verification only; forbidden from finance, users, quotes, and leads.
    - `ops`: Work order management, proofs, campaigns, issues, and lead assignment; forbidden from deciding KYC or touching finance.
    - `auditor`: Strictly read-only access to audit trail, system settings, and report exports.
  - **Admin Maker-Checker:** In `apps/api/src/models/foundation.ts`:
    - Proposing role change, account suspension, or reinstatement creates a `proposedAction`.
    - Endpoints `POST /api/v1/admin/users/:id/approve-action` and `POST /api/v1/admin/users/:id/reject-action` require a second distinct admin (`req.user.userId !== user.proposedAction.proposedBy`).
  - **Express Router Isolation:** Refactored middleware in `apps/api/src/routes/admin-inventory.ts` to prevent router shadowing on other admin routes.
  - **Web UI:** `apps/web/src/components/app/admin/UserManagement.tsx` updated with new staff role pills, pending approval indicators, and dual-admin authorization modals.
  - **Acceptance Tests:** `apps/api/test/staff-roles.test.ts` (7 tests passing).

---

### Task V0.4 — Tamper-Evident Audit Log Hardening
- **Objective:** Guarantee audit immutability, tamper evidence, and full cryptographic traceability.
- **Architectural Implementation:**
  - **Mongoose Append-Only Pre-Hooks:** `apps/api/src/models/audit-log.ts` blocks `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany`, `findOneAndDelete`, `bulkWrite`, and `save` on existing documents, throwing `"Audit log is append-only"`.
  - **Schema Enhancements:**
    - `actorType`: `"user" | "system" | "impersonation"`
    - `ip`, `device`, `userAgent`, `requestId`
    - `prevHash` (SHA-256 link to prior entry) and `hash` (SHA-256 over entire entry payload)
  - **Data Redaction:** `apps/api/src/lib/audit.ts` automatically strips sensitive fields (`twoFactorSecretEncrypted`, `twoFactorRecoveryCodes`, `passwordHash`, `accountNo`) before saving to audit history.
  - **Verification Endpoint:** `GET /api/v1/audit-logs/verify-chain` verifies hash integrity across the entire historical chain.
  - **CSV Export:** Updated `apps/api/src/routes/audit.ts` to export Actor Type, Request ID, and Hash.
  - **DB Role Hardening:** `apps/api/scripts/mongo-app-role.js` restricts DB user to `find`, `insert`, `createIndex` on `audit_logs` (blocking raw MongoDB updates/deletes).
  - **Acceptance Tests:** `apps/api/test/audit-chain.test.ts` (5 tests passing):
    - `AT-AUD-01`: Verified audit entries write `actorType`, `requestId`, `ip`, and compute valid SHA-256 hash chains.
    - `AT-AUD-02`: App-level mutation/deletion throws `"Audit log is append-only"`.

---

### Task V0.5 — Distributed Background Job Runner
- **Objective:** Run periodic maintenance jobs with cluster-safe distributed locking and complete execution history.
- **Architectural Implementation:**
  - **Models:** `apps/api/src/models/job-runner.ts`:
    - `JobLock`: MongoDB-backed distributed lock with atomic `findOneAndUpdate` and TTL expiration to prevent cluster node collision.
    - `JobRun`: Execution log capturing `jobName`, `status` (`running`, `completed`, `failed`, `skipped`), `startedAt`, `finishedAt`, `durationMs`, `processedCount`, `error`, `lockedBy`.
  - **Registered Background Jobs:**
    1. `hold_release` (every 15 min): Expires lapsed inventory holds via `expireHolds()`.
    2. `quote_expiry` (hourly): Automatically transitions expired released quotes to `expired`.
    3. `reverify_reminder` (daily): Reminds vendors of inventory due for re-verification.
    4. `permit_expiry_check` (daily): Detects expiring municipal permits/licenses.
    5. `sla_monitor` (hourly): Checks overdue work order proof uploads.
    6. `reconciliation` (daily): Reconciles ledger and payment entries.
    7. `score_compute` (daily): Computes 90-day rolling vendor performance metrics.
    8. `leakage_scan` (daily): Scans for off-platform leakage signals.
  - **Admin API Endpoints:** `apps/api/src/routes/jobs.ts`:
    - `GET /api/v1/admin/jobs`: List registered jobs and configurations.
    - `GET /api/v1/admin/jobs/runs`: Paginated history of job runs.
    - `POST /api/v1/admin/jobs/:name/run`: Manually trigger a job immediately (admin only, fully audited).
  - **Lifecycle Integration:** Mounted in `apps/api/src/server.ts` with graceful startup and timer unref.
  - **Acceptance Tests:** `apps/api/test/job-runner.test.ts` (5 tests passing distributed lock, concurrency rejection, error recovery, and admin triggers).

---

### Task V0.6 — Standard Error `request_id`
- **Objective:** Every error response body and log line must carry a correlation `request_id` for tracing.
- **Architectural Implementation:**
  - **Error Middleware:** `apps/api/src/middleware/errors.ts`:
    - Standardized error format: `{ error: { code: string, message: string, request_id: string, requestId: string, details?: unknown } }`.
    - Applied uniformly across `AppError`, 404 `notFoundHandler`, `SyntaxError` (malformed JSON), `MulterError` (uploads), `ValidationError`, MongoDB duplicate key (11000), and 500 `INTERNAL_ERROR`.
    - Correlation ID extracted from incoming `X-Request-Id` or generated via `crypto.randomUUID()`.
    - `requestId` included in `logger.error(...)` and `SystemEvent` error documents.
  - **Verification:** Verified via `apps/api/test/job-runner.test.ts` and `apps/api/test/auth-hardening.test.ts`.

---

## 4. Architectural Rules Audit (Compliance with `AGENTS.md`)

| Rule # | Requirement | Implementation Status | How It Was Verified |
|---|---|---|---|
| **§4.1** | Every endpoint authorized on server; foreign ID returns 404 | **COMPLIED** | Tested in `role-matrix.test.ts`, `vendor-rbac.test.ts`, `staff-roles.test.ts`. Foreign objects return 404. |
| **§4.2** | Validate every input with shared zod schema | **COMPLIED** | All input parsed via `validateBody(schema)` / `parseQuery(schema)`. |
| **§4.3** | Money computed server-side only | **COMPLIED** | Quotes/payments use `computeQuoteTotals`, `payableFor` in `packages/shared`. |
| **§4.4** | Audit on critical actions; append-only | **COMPLIED** | Audit log has cryptographic SHA-256 chain; mutations throw error. |
| **§4.5** | IDs come from `nextId("<PREFIX>")` | **COMPLIED** | Formats match: `USR-`, `VND-`, `LD-`, `QT-`, `BK-`, `WO-`, `INV-`. |
| **§4.6** | Status changes follow transition tables | **COMPLIED** | Invalid jumps throw `409 INVALID_TRANSITION`. |
| **§4.7** | Reasons mandatory for rejection/suspension/override | **COMPLIED** | Validated in Zod schemas and route handlers. |
| **§4.8** | DEMO inventory never bookable/quotable | **COMPLIED** | Asserted in `availability-search.test.ts`. |
| **§4.9** | Maker-checker for money & staff privileges | **COMPLIED** | Dual-authorization enforced in finance and staff management. |
| **§4.10** | Sensitive data encryption & signed URLs | **COMPLIED** | AES-256-GCM encryption at rest; signed URLs with expiration. |
| **§4.12** | Atomic hold/booking with `availabilityRev` | **COMPLIED** | Uses MongoDB transactions bumping `availabilityRev`. |

---

## 5. Next Phase: Phase P1 Roadmap (Tasks V1.1 to V1.22)

Phase P1 focuses on **Vendor Registration, KYC, and Verified Inventory Asset Lifecycle**.

### KYC Flow (Tasks V1.1 – V1.6)
- **V1.1 Business profile:** Legal name, trade name, entity type (`Proprietorship`, `Partnership`, `Pvt Ltd`, `LLP`, `Other`), registered address, operating cities.
- **V1.2 KYC documents:** Add document types (`company_proof`, `signatory_id`, `bank_proof`, `outdoor_license`). Masked numbers (`numberMasked`), expiry dates (`validTo`), Aadhaar masking check.
- **V1.3 KYC state machine:** Updated `KYC_TRANSITIONS`: `draft → submitted → under_review → needs_info ↔ submitted → approved | rejected(reason)`. Re-KYC on document expiry.
- **V1.4 Agreement:** Versioned vendor agreement consent capture with timestamp.
- **V1.5 Duplicate vendor detection (`AT-KYC-01`):** Flag matching PAN, GSTIN, or bank account.
- **V1.6 Bank account security (`AT-KYC-02`, `AT-KYC-03`):** Masked account numbers, penny-drop verification status, 48-hour payout hold on bank detail update.

### Inventory Asset Lifecycle (Tasks V1.7 – V1.22)
- **V1.7 Asset Code Generator (`AT-INV-01`, `AT-INV-17`):** Format `OHR-{STATE2}-{CITY3}-{TYPE2}-{SEQ6}` (e.g. `OHR-MH-MUM-BH-000001`).
- **V1.8 Inventory Verification Lifecycle (`AT-INV-02`):** State transitions `draft → submitted → under_review → approved | rejected`.
- **V1.9 – V1.11 GPS & EXIF Evidence Extraction (`AT-INV-03` to `AT-INV-06`):**
  - Extract GPS latitude/longitude from photo EXIF.
  - Calculate distance from declared GPS pin (`haversineDistance`).
  - Flag if distance exceeds `gps.photo_pin_max_m` (50 m) or accuracy exceeds `gps.max_accuracy_m` (20 m).
- **V1.12 Municipal Permits & Structural Certificates:** Store permit number, authority, validity, inspection frequency.
- **V1.13 Verifier Console (`AT-INV-07` to `AT-INV-09`):** Dedicated UI for staff verifiers with pass/fail checklists, photo inspection, and SLA tracking.
- **V1.17 Re-verification Cycle (`AT-INV-11`, `AT-INV-12`):** 90-day regular cycle / 60-day high-risk cycle.
- **V1.22 Vendor UI Screens:** Clean vendor inventory management views built with `kit.tsx`.
- **Exit Gate:** Automated test suite passing `AT-INV-01` through `AT-INV-20` at 100%.

---

## 6. How Claude / Senior Reviewer Can Verify Independently

You can verify all of the above directly by running these commands from the repository root:

```bash
# 1. Verify git branch and recent commits
git status
git log -n 5 --oneline

# 2. Run complete TypeScript typechecking across all workspaces
npm run typecheck

# 3. Run all unit and integration tests (in-memory replica set)
npm test

# 4. Run targeted tests for the blueprint implementations
npm test -w @oohrena/api -- test/vendor-rbac.test.ts
npm test -w @oohrena/api -- test/settings.test.ts
npm test -w @oohrena/api -- test/staff-roles.test.ts
npm test -w @oohrena/api -- test/audit-chain.test.ts
npm test -w @oohrena/api -- test/job-runner.test.ts

# 5. Build the web application bundle
npm run build -w @oohrena/web
```

---
*Report generated automatically from verified repository state.*
