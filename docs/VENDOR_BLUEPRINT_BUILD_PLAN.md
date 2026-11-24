# Vendor Dashboard — build plan from the Technical Blueprint v1.0

Source: `OOHRENA_Vendor_Dashboard_Technical_Blueprint.pdf` (v1.0, 23 Nov 2026, 28 pages, Hindi + English).
Team decision (meeting): the vendor flow is built to this blueprint.
This file compares every blueprint requirement with the code on `feat/deploy-vercel-render` and lists what to build, in the blueprint's own phase order (§1.3).

Status keys: **DONE** = exists and matches · **PARTIAL** = something exists but does not meet the blueprint · **MISSING** = not in the code.

Rules for whoever codes this (Antigravity or a developer):
- Keep every rule in `AGENTS.md` §4 (server-side permission + ownership, zod validation, audit, `nextId`, transition tables, reasons, encryption, transactions). The blueprint asks for the same things.
- **Stack stays MongoDB + Express + React.** The blueprint suggests PostgreSQL/PostGIS but allows a change if it is written down (§1.4). Map each blueprint table to a Mongo collection; `2dsphere` replaces PostGIS.
- **No hard-coded thresholds.** Every number the blueprint calls a default (GPS accuracy, distances, re-verification days, SLA hours, hold hours, rate-change %) is read from `system_settings` (task V0.2).
- Each task lists the blueprint acceptance tests (`AT-…`, §16) it must pass. Write each as an API test in `apps/api/test/`, including the negative cases.
- Tick the box only when its tests pass, typecheck is clean and the screen works at phone width.

---

## Decisions needed before coding (blueprint vs current MVP rules)

These conflict with `AGENTS.md` / the MVP document. Product owner must decide; write the answer here.

| # | Topic | Blueprint says | Code / AGENTS.md today | Suggested answer |
|---|-------|----------------|------------------------|------------------|
| D1 | Who sends quotes | Vendor builds and sends quotes to buyer (§6) | Central Admin builds/approves every quote (MVP "Client Transparency First") | Vendor drafts quote → Admin approves → client sees it. Keeps both. |
| D2 | Payments | Gateway, webhooks, escrow hold, milestone release, double-entry ledger (§9) | Manual payments with proof file; AGENTS.md §13 says gateway escrow/splitting is Phase 2 | Build ledger + milestones + settlement maker-checker on manual payments now; gateway/webhook later (blueprint Open Decision #3). |
| D3 | Asset ID format | `OHR-{STATE2}-{CITY3}-{TYPE2}-{SEQ6}` e.g. `OHR-MP-IND-UP-000124` | `INV-HRD-000001`; AGENTS.md: never edit an ID | Add `assetCode` in the new format for new listings, keep `_id`; backfill existing listings once with a new code (old `_id` stays). |
| D4 | Roles | 10 roles incl. vendor_owner / manager / field / accounts, verifier, ops, auditor | 5 roles: client, vendor, admin, finance, growth_partner | Add vendor sub-roles (V0.1) and staff roles verifier / ops / auditor. |
| D5 | Buyer contact to vendor | Masked until booking confirmed, then shown | Vendor never deals with client directly (admin in middle) | Keep masked always unless contract needs it after booking. |
| D6 | Release gate | No public Enquiry/Booking until all AT-INV tests pass (§1.2) | Enquiry/booking already live | Decide whether to hide enquiry/booking on production until P1 passes. |
| D7 | Open decisions §17.3 | Re-verify cycle, field verification team, commission, KYC APIs, e-invoice/TDS, gallery vs in-app camera, DOOH scope, retention, non-circumvention clause | — | Business must answer; code reads them from `system_settings`. |

---

## P0 — Auth, roles, audit core, config, files

- [ ] **V0.1 Vendor team roles** — MISSING. Today one `vendor` login per vendor.
  Add `vendor_users` (vendorId, userId, role ∈ owner | manager | field | accounts). Owner invites staff. Enforce the §2.1 matrix on the server:
  asset create/edit owner+manager; rate/availability owner+manager; quote owner+manager; proof upload owner+manager+field; bank change owner only (OTP); invoices/payments owner+accounts (manager limited); audit log owner (own vendor).
  Field users see only work orders assigned to them, never rate/price fields (field-level filtering in responses).
  Tests: AT-RBAC-01, AT-WO-01, AT-WO-02, AT-SEC-01.
- [ ] **V0.2 `system_settings`** — MISSING. Versioned key/value (`key, value, effectiveFrom, changedBy`), admin screen, every change audited, maker-checker for sensitive keys. Seed all blueprint defaults:
  `gps.max_accuracy_m=20`, `gps.photo_pin_max_m=50`, `asset.duplicate_radius_m=15`, `reverify.cycle_days=90`, `reverify.high_risk_days=60`, `reverify.reminders=[30,14,7,1]`, `verifier.sla_days=3`, `photo.max_age_days=30`, `photo.min_long_side_px=1600`, `photo.max_mb=15`, `photo.gallery_allowed=false`, `rate.change_guard_pct=25`, `hold.payment_window_h=48`, `quote.valid_days=5`, `enquiry.ack_sla_h=24`, `enquiry.quote_sla_h=48`, `availability.reminder_days=14`, `availability.unconfirmed_days=30`, `proof.max_upload_delay_h=2`, `proof.inspection_every_days=7`, `bank.payout_hold_h=48`, `dispute.window_days=5`, `location.retention_days=90`, score weights (§10.1).
- [ ] **V0.3 New staff roles** — MISSING. `verifier` (KYC/asset review only), `ops` (bookings, proof audit, disputes), `auditor` (read-only audit + reports export). Admin maker-checker on role change, suspension, reinstatement.
- [ ] **V0.4 Audit log hardening** — PARTIAL (append-only in app exists). Add `actorType` (user/system/impersonation), `ip`, `device`, `requestId`, masked before/after diff, and a hash chain (`prevHash`, `hash`). Restrict update/delete at DB level (Mongo role without update/remove on `audit_logs` — see `scripts/mongo-app-role.js`). Must-log list §11.4 incl. failed login, config change, export. Tests: AT-AUD-01, AT-AUD-02.
- [ ] **V0.5 Background job runner** — PARTIAL (only hold expiry `setInterval` in `server.ts`, proof reminders). One job runner with a lock (so two API instances don't both run) and a `job_runs` record. Jobs: `reverify_reminder` daily, `permit_expiry_check` daily, `hold_release` 15 min, `quote_expiry` hourly, `sla_monitor` hourly, `reconciliation` daily, `score_compute` daily, `leakage_scan` daily.
- [ ] **V0.6 Standard error `request_id`** — PARTIAL. Add `requestId` to every error body and log line.

## P1 — Vendor registration, KYC, verified inventory (release gate)

### KYC (§3)
- [ ] **V1.1 Business profile** — PARTIAL. Add legal name, trade name, entity type (Proprietor/Partnership/Pvt Ltd/LLP/Other), registered address, operating cities, contact persons.
- [ ] **V1.2 KYC documents** — PARTIAL (types today: pan, gst, authorisation, address_proof, other). Add `company_proof`, `signatory_id`, `bank_proof`, `outdoor_license`; per document `numberMasked`, `validTo`, `status`, `reviewerId`, `remarks`. PAN/GSTIN format checks. Aadhaar must be masked. Verifier gives Pass/Fail + comment per document; vendor sees the reason.
- [ ] **V1.3 KYC state machine** — PARTIAL (`pending/approved/rejected/suspended`). Change to `draft → submitted → under_review → needs_info ↔ submitted → approved | rejected(reason)`; `approved → suspended → approved` (reinstate maker-checker); `approved → re_kyc_due` on document expiry → `under_review`. Update `KYC_TRANSITIONS`.
- [ ] **V1.4 Agreement** — PARTIAL (consents exist). Store vendor agreement version + timestamp at submit (incl. non-circumvention clause once legal drafts it).
- [ ] **V1.5 Duplicate vendor detection** — PARTIAL (PAN unique index blocks). Flag (not just block) same PAN, GSTIN or bank account on another vendor → admin review queue. Test: AT-KYC-01.
- [ ] **V1.6 Bank account security** — PARTIAL (encrypted + masked done). Add: owner-only, OTP + recent re-auth to change, change-history collection, `payoutHoldUntil = now + 48h`, alert to old contact, name match vs KYC legal name (mismatch blocks payout), penny-drop/cancelled-cheque verification status. Tests: AT-KYC-02, AT-KYC-03.

### Inventory (§4, §5) — priority #1
- [ ] **V1.7 Asset code** — PARTIAL. Generate `assetCode` per D3, unique, never reused (also after archive). Show it on buyer pages, work orders, invoices, proofs. Tests: AT-INV-01, AT-INV-17.
- [ ] **V1.8 Asset status lifecycle** — PARTIAL (`draft/pending/approved/rejected/suspended`). Change to `draft → submitted → field_check_pending → under_review → verified → reverify_due → expired`, `under_review → rejected(reason) → draft`, `verified → suspended → under_review`, any → `archived` (blocked if open bookings). Keep a `asset_status_history` row per change. Search/booking only for `verified` and `reverify_due` (badge "Re-verification due soon"). Direct URL of a non-searchable asset returns 404. Tests: AT-INV-02, AT-INV-12, AT-BKG-01.
- [ ] **V1.9 Location fields** — PARTIAL. State/city/locality/landmark from master lists (dropdown + search, admin-managed), pincode validation, `gpsAccuracyM` (submit blocked above setting), `gpsSource` device|manual, `facingDirection`, `trafficTowards`, `roadName`, `roadType` (highway/arterial/local/junction), `visibilityDistanceM`, `sideOfRoad`. Manual pin → banner "GPS field check pending" and field check mandatory. Test: AT-INV-04.
- [ ] **V1.10 Size & specs** — PARTIAL (width/height/lit in attributes). Add `faces`, auto total sq ft, `mediaFormat` (Flex/Vinyl/LED/Backlit/Painted), `illumination` (Front-lit/Back-lit/Non-lit/Digital) + lighting hours, `minDurationDays`, `slotLengthSec` (DOOH), artwork specs (format, resolution, bleed, lead-time days).
- [ ] **V1.11 Evidence photos** — PARTIAL (SHA-256 + pHash + duplicate similarity done). Add photo `kind` = close_up | mid_range | approach | night; minimum 3 (+ night if illuminated) to submit. On upload read EXIF (GPS, time, device), store `exifLat/Lng`, `capturedAt`, `deviceId`, `distanceFromPinM`; flag > 50 m (approve disabled until resolved), flag edited/screenshot (no EXIF / software tag), warn photo older than 30 days, reject exact-hash duplicate. JPG/PNG/HEIC, ≥1600 px long side, ≤15 MB. Originals private; buyer-facing copies watermarked "OOHRENA". Tests: AT-INV-03, AT-INV-05, AT-INV-06.
- [ ] **V1.12 Asset documents** — MISSING. `asset_documents`: type permit | noc | lease | structural, number, authority, validFrom, validTo, file (encrypted), status. Permit required to submit. Permit expiry → asset auto-suspended + vendor alert. Tests: AT-INV-03, AT-INV-13.
- [ ] **V1.13 Verification rounds & verifier console** — PARTIAL (admin approve/reject listing exists). Add `asset_verifications` (roundNo, method desk|field, verifierId, checklist per evidence item Pass/Fail, result, reasonCode, remarks, startedAt, decidedAt, nextDue). Console: queue sorted by priority (new vendor, due date, value) with SLA timer; side-by-side declared data vs evidence (map pin, photo metadata, permit); Approve enabled only when every checklist item passes; reject needs reason code + comment; verifier cannot approve a vendor they are linked to (conflict of interest); risk-based field check (new vendor, high value, flagged, manual GPS). Approve sets `verifiedAt` and `reverifyDueDate = today + cycle`. Tests: AT-INV-07, AT-INV-08, AT-INV-09.
- [ ] **V1.14 KYC gate on verification** — CHECK. Vendor without approved KYC may submit an asset, but it can never be verified or appear in search. Test: AT-INV-20.
- [ ] **V1.15 Critical edit re-review** — PARTIAL (critical fields re-enter review). Location or size edit on a verified asset → `under_review`, hidden from search; rate/availability edits do not. Test: AT-INV-10.
- [ ] **V1.16 Duplicate asset** — PARTIAL (30 m similarity check). Use 15 m (setting) + same facing + similar size → flag; verifier decision merge/reject logged. Test: AT-INV-14.
- [ ] **V1.17 Re-verification** — MISSING. Reminders 30/14/7/1 days (dashboard banner + email/SMS via notifications), status `reverify_due`, vendor "Update evidence" (new photos + permit), verifier review → new due date; past due → `expired` (hidden, active bookings untouched, Ops alert); buyer complaint creates a re-verification task. Tests: AT-INV-11, AT-INV-12.
- [ ] **V1.18 Rate card** — PARTIAL (one `rate` + unit; indicative "from" price done). Add `asset_rates` versioned and immutable: components display/printing/mounting/unmounting/lighting, unit day/week/month, GST extra/inclusive flag, validFrom/To, discount slabs (duration / multi-asset). Change > 25 % → review flag. Existing quotes keep their old rate. Every rate change audited. Test: AT-INV-18.
- [ ] **V1.19 Availability** — PARTIAL (holds, blocks, transactional double-booking guard done). Add day status `maintenance`, mandatory block reason code (own campaign / repair / permit issue / other), Ops alert on frequent blocks, freshness: reminder at 14 days without calendar update, "Availability unconfirmed" badge at 30 days. Tests: AT-INV-19 (exists — keep), AT-BKG-02.
- [ ] **V1.20 CSV/Excel import** — PARTIAL (CSV + row errors, imports as draft done). Add Excel (.xlsx) and the new fields; prove 500 rows / 10 bad. Test: AT-INV-15.
- [ ] **V1.21 Cross-vendor access** — DONE for listings (404). Add audit entry for the denied attempt. Test: AT-INV-16.
- [ ] **V1.22 Vendor inventory screens** — PARTIAL. Inventory list as table + map, filters (status, city, type, re-verification due, availability), bulk actions; 7-step Add/Edit wizard (Basics → Location & GPS → Size & Illumination → Photos → Documents → Rate & Availability → Review & Submit) with the missing-items list on submit; Asset detail (code, status timeline, evidence gallery, verifier comments, re-verification countdown, booking calendar); Re-verification queue (due/overdue, one-click "Update evidence").

**P1 exit: AT-INV-01 … AT-INV-20 all pass (100%).**

## P2 — Search, enquiry, quotation (vendor side)

- [ ] **V2.1 Search** — PARTIAL. Only `verified`/`reverify_due` assets; filters city, type, bbox, dates; P95 < 800 ms (index on status + location).
- [ ] **V2.2 Vendor enquiry inbox** — MISSING (vendor sees hold requests only). Tabs New / Responded / Expired / Won / Lost; buyer contact masked (company name + category visible). SLA: acknowledge 24 h, quote 48 h; breach lowers score and suggests other vendors. Test: AT-ENQ-01.
- [ ] **V2.3 Quote builder (vendor)** — MISSING (admin builds quotes). Per D1. Add items from own verified assets, live availability check, rate auto-fill within allowed range, component breakup, GST CGST+SGST vs IGST (done in shared maths — reuse), `validUntil` default 5 days, revisions as new versions (old read-only — done), statuses add `viewed`, `withdrawn`; discount above limit needs owner approval; win/loss reason. Tests: AT-QUO-01, AT-QUO-02, AT-QUO-03.
- [ ] **V2.4 Content filter** — MISSING. Detect phone, email, URL, "WhatsApp/call me" patterns in quote notes and chat → mask/warn, count strikes. Off-platform payment instructions blocked. Test: AT-ENQ-02.
- [ ] **V2.5 Negotiation chat** — MISSING. `messages` (threadId, senderId, bodyMasked, flags) on an enquiry; filter from V2.4.

## P3 — Booking, work orders, creative, proof, tracking

- [ ] **V3.1 Booking states** — PARTIAL. `pending_payment → confirmed → creative_pending → creative_approved → printing → installation_scheduled → installed → live → completed → closed | cancelled | disputed`; terms snapshot (cancellation, payment schedule) stored on booking.
- [ ] **V3.2 Work order types & statuses** — PARTIAL (one WO per vendor; `scheduled → installed → inspection_due → completed`). Add types printing / installation / maintenance / unmounting, per asset, assigned to a vendor field user; statuses `assigned → accepted → in_progress → proof_submitted → approved | rework`. Delay past window → alert Ops + buyer.
- [ ] **V3.3 Creative flow** — PARTIAL (admin uploads creative to WO). Buyer uploads artwork → vendor spec check (size, resolution) → "Printable" or change request → buyer final approval (timestamp locked).
- [ ] **V3.4 Proof types** — PARTIAL (installation / weekly / end). Pre-installation 1 photo; installation 3 photos (close/mid/approach) + 1 video 10–20 s; night photo within 24 h if illuminated; periodic inspection 2 photos; removal 2 photos.
- [ ] **V3.5 Proof validation engine** — PARTIAL (distance label, uploader = assignee). Server checks: GPS ≤ 50 m else flag; capture time inside work window and upload delay ≤ 2 h else "Late upload"; in-app capture / mock-location → "Possible spoof"; duplicate hash → reject; result stored in `validationJson`. Proofs immutable (new version only). Tests: AT-PRF-01, AT-PRF-02, AT-PRF-03.
- [ ] **V3.6 Check-in / check-out** — MISSING. `checkins` (woId, userId, lat, lng, inAt, outAt); location tracking only while WO active and with consent; delete after retention setting.
- [ ] **V3.7 Execution dashboard (vendor)** — MISSING. Calendar/Kanban: today / tomorrow / overdue installs; per-booking timeline + completion %; campaign health (proof pending, damage, lighting failure); buyer live status timeline (artwork approved → printed → dispatched → installed → live).
- [ ] **V3.8 Dispute evidence pack** — MISSING. PDF + ZIP: asset verification history, proofs with metadata, WOs, chat, timestamps.
- [ ] **V3.9 Mobile field flow** — MISSING. PWA for field users: in-app camera capture, offline queue + retry, resumable upload.

## P4 — Invoice, payment, settlement, reconciliation (subject to D2)

- [ ] **V4.1 Milestones** — MISSING. Advance X % / installation Y % / completion rest (settings). Installation release blocked until installation proof approved; completion after removal proof + dispute window. Test: AT-PRF-04.
- [ ] **V4.2 Invoices** — PARTIAL (`TXI-` invoices, credit notes, SAC, GST split done). Gapless number series per financial year; issued invoice never editable (credit note only); separate OOHRENA → vendor commission invoice; TDS/TCS tracking. Test: AT-PAY-04.
- [ ] **V4.3 Ledger** — MISSING. Append-only double-entry `ledger_entries` (buyer receivable, held funds, vendor payable, platform revenue, tax payable); every transaction balances. Test: AT-REC-02.
- [ ] **V4.4 Settlements & payouts** — PARTIAL (payables, recorder ≠ verifier). `settlements` with gross, fee, tax, TDS, net, UTR; release needs two different Finance approvers; blocked on bank name mismatch or payout hold. Test: AT-PAY-03.
- [ ] **V4.5 Gateway & webhook** — MISSING (D2). Idempotency keys, unique gateway ref, signature check, IP allow-list. Tests: AT-PAY-01, AT-PAY-02.
- [ ] **V4.6 Bank-file reconciliation** — PARTIAL (booking-level recon). Daily match of bank/gateway file vs ledger; states matched / amount_mismatch / missing_in_bank / missing_in_ledger / duplicate; exception queue with 24/48/72 h aging; month-end report CSV/Excel/PDF. Test: AT-REC-01.
- [ ] **V4.7 Vendor statement** — PARTIAL. Booking-wise gross, fee, tax, TDS, net, payout date, UTR.
- [ ] **V4.8 Refund / penalty** — PARTIAL (refund capped by cancellation rule). Finance approval; vendor-fault penalty + score impact.

## P5 — Performance, reports, compliance, leakage

- [ ] **V5.1 Vendor score** — PARTIAL (performance report exists). Weighted 0–100 rolling 90 days: inventory accuracy 25, response time 15, execution timeliness 20, proof quality 15, availability reliability 10, buyer rating 10, compliance 5 (weights from settings); tiers Gold/Silver/Bronze/Watchlist; vendor sees breakdown + tips; appeal. Needs buyer post-campaign rating (1–5). Test: AT-SCR-01.
- [ ] **V5.2 Vendor reports** — PARTIAL. Inventory health (CSV/PDF), occupancy/revenue per asset (CSV/Excel), enquiry→booking funnel (CSV), campaign execution (PDF), payment & settlement statement (Excel/PDF), scorecard (PDF).
- [ ] **V5.3 Compliance pack for buyer** — PARTIAL (client campaign report). Add asset verification certificate, permit/NOC copies + validity, installation/live/removal proofs with metadata, invoices + receipts, vendor KYC status summary; unique report ID + generated timestamp + hash. Test: AT-RPT-01.
- [ ] **V5.4 Leakage signals** — MISSING. Rules: repeat date blocks after enquiry, unavailable after quote accept, same buyer repeat enquiry; `leakage_signals` with score; strikes Warning → search demotion → suspension, always human review, appeal. Test: AT-LKG-01.
- [ ] **V5.5 Admin impersonation** — MISSING. Read-only "view as vendor" with reason + ticket number, fully logged.
- [ ] **V5.6 Sessions** — PARTIAL. Idle timeout, device list per user, bulk-export alert.

## Non-functional (§15)

- [ ] Hindi + English UI (MISSING), dates IST (DONE), WCAG 2.1 AA on dashboard (CHECK), dashboard < 3 s on 4G (CHECK), resumable image upload (MISSING), structured logs + request IDs (PARTIAL), privacy export/delete request flow (CHECK), OpenAPI docs (MISSING).

---

## Suggested first sprint (blueprint §17, adapted)

V0.1 vendor team roles → V0.2 settings → V0.4 audit chain → V1.7 asset code → V1.8 status lifecycle → V1.9/V1.11 GPS + EXIF evidence → V1.12 permits → V1.13 verifier console → V1.17 re-verification job → V1.22 screens → AT-INV-01…20 tests.
