# OOHRENA — monorepo

360° Outdoor + Digital Advertising Marketplace. Requirements: `docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf` (primary).

```
apps/web         React (TanStack Start) frontend
apps/api         Express + MongoDB (Mongoose) REST API — /api/v1
packages/shared  Roles & permission matrix, ID formats, zod API contracts (used by web + api)
docs/            Requirement and handover PDFs
```

## Setup

```sh
npm install                      # all workspaces, from the repo root
cp apps/api/.env.example apps/api/.env   # set MONGODB_URI (must be a replica set, e.g. Atlas) and SEED_PASSWORD
npm run seed:api                 # one test account per role (non-production only)
npm run dev:api                  # http://localhost:4000/api/v1/system/health
npm run dev:web                  # http://localhost:8080 (proxies /api to :4000)
```

No MongoDB yet? `npm run dev:api:memory` runs the API on an in-memory replica set, seeded with the
test accounts below (password = `SEED_PASSWORD` in `apps/api/.env`). Data resets on every restart.

| Role | Email |
|------|-------|
| Admin | admin@test.oohrena.local |
| Finance / Audit (maker + checker) | finance@test.oohrena.local, finance2@test.oohrena.local |
| Client A / B | client@test.oohrena.local, client2@test.oohrena.local |
| Vendor A (KYC approved) / B (KYC pending) | vendor@test.oohrena.local, vendor2@test.oohrena.local |
| Growth Partner | partner@test.oohrena.local |

```sh
```

Tests: `npm test` (API tests start an in-memory MongoDB replica set; no external DB needed).

## API conventions

- Success `{ "data": ... }`, failure `{ "error": { "code", "message", "details?" } }`.
- Auth: HttpOnly `oohrena_sid` cookie for the browser (state-changing requests must come from an allowed `Origin`);
  `Authorization: Bearer <token>` for non-browser clients (send `X-Auth-Mode: token` on login to receive one).
- Every endpoint checks role **and** ownership on the server. Foreign IDs return 404, wrong role 403.
- IDs are server-generated and immutable: `USR-000001`, `VND-000001`, `LD-2026-000001`, `QT-2026-000001-V1`, ...
- Critical actions write to `audit_logs` (append-only; see `apps/api/scripts/mongo-app-role.js` for the DB-level lock).

## Module status

| # | Module | Status |
|---|--------|--------|
| 10 | Security, Roles, Privacy & System | PARTIALLY WORKING — API: auth, sessions, RBAC matrix, lockout, rate limit, CSRF, append-only audit log, consents, health. Web: real sign-in / registration / sign-out, role-gated workspaces, demo role switcher removed. Pending: 2FA, email/mobile verification, admin user screens, backup/restore runbook |
| 1 | Client Portal | PARTIALLY WORKING — register/login/profile, marketplace search (city, locality, landmark, PIN, GPS radius, map, budget, dates), listing detail with calendar, shortlist + compare, inquiry with unique Lead ID, "My inquiries". Pending: profile edit screen, quote decisions, bookings/payments/proofs/reports (portal cards marked SAMPLE) |
| 2 | Vendor Portal | PARTIALLY WORKING — registration, KYC documents (encrypted, type-checked), bank details (encrypted, masked), resubmission, own inventory with photos, submit, history, CSV import, availability calendar (live/on-request mode, block dates), hold confirmation. Pending: work orders/proof (M6–7), payables (M8) |
| 3 | Central Admin Control Tower | PARTIALLY WORKING — dashboard on live counts, central inbox (web/phone/WhatsApp/partner), lead review, assignment only to approved vendors (blocked attempts logged), quote pricing approval, booking/WO control, overrides with mandatory reason, KYC/listing review, duplicate flags. Pending: 2FA for admin |
| 4 | Unified Media Inventory Marketplace | PARTIALLY WORKING — 9 categories with attribute templates, `INV-<CAT>-000001` IDs, Draft→Pending→Approved, critical edits re-enter review, field history, CSV import with row errors, public catalogue API (no vendor identity/rate). Marketplace screen now shows only real approved listings |
| 5 | Smart Location & Availability Engine | PARTIALLY WORKING — per-day capacity (fixed periods with 15-day minimum, LED slots, fleet quantity), transactional 48 h holds (parallel requests: exactly one wins), auto-expiry, vendor confirmation flow, admin/vendor blocks, "Subject to vendor confirmation" labelling, map + list. Pending: bookings convert holds (M6), rescheduling |
| 6 | Quotation & Booking Engine | PARTIALLY WORKING — `QT-…-V1` versions (older stay readable), itemised media/production/installation, platform fee line, CGST+SGST, server-computed totals, validity (expired can’t be approved), release places holds, client approve/reject/revise with comments, `BK-` only from approved quote, holds→booked in one transaction, `WO-` per vendor, cancellation fee schedule, reschedule subject to availability, booking history. Pending: Live/Completed transitions (driven by M7), printable quote PDF on real data |
| 7 | Campaign Execution & Proof of Display | PARTIALLY WORKING — `CMP-` campaign per booking, proof schedule (installation / weekly / end), strict WO transitions (no skipping; installation proof required; completion only after end date), Issue Raised → back to previous state, photo/video proof with server timestamp + device time, honest GPS label with distance from site, admin verify / reject-with-reason → vendor re-upload, client gallery shows verified proof only via 10-minute signed links, overdue alerts, booking Live/Completed sync, issue tracker (owner, due date, resolution). Pending: notifications for overdue proof (M9), cloud object storage |
| 8 | Finance, Payments & Reconciliation | PARTIALLY WORKING — `TXI-` tax invoice from booking (CGST/SGST, advance %), client receipts / vendor payouts / refunds as `PAY-` records that need a proof file and start Unverified, maker-checker (recorder can never verify; only Finance verifies), edits only before verification with field-level payment history, vendor payables (pending → due on verified proof → paid), refunds capped by the cancellation rule, booking reconciliation with consistency checks in JSON/CSV/PDF (exports logged), Finance-only full bank details (every view logged), Admin sees status only. Pending: payment gateway (Phase 2 per doc), credit notes |
| 9 | Reporting, Notifications & Audit Trail | PARTIALLY WORKING — audit trail API (append-only, searchable). Pending: report screens/exports, notifications, report_exports log |

Known follow-up: upgrade zod 3 → 4 (advisory GHSA-mrhx-c7xc-m3w5; mitigated by request-size and array limits).
