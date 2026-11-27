# OOHRENA — next tasks (handoff for the next developer)

Updated: 24 Nov 2026. This is the **starting point** for whoever picks up the work (a developer or an AI coding agent such as Claude).
Details and acceptance tests for every task live in `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md`; this file says what is done, what is blocked, and what to do next, in order.

## Read first

1. `AGENTS.md` — the rules. They are non-negotiable (server-side permission + ownership checks, zod validation, audit, `nextId`, transition tables, reasons, encryption, transactions).
2. `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` — full task list with `AT-…` acceptance tests.
3. `docs/VENDOR_BLUEPRINT_PROGRESS_REPORT.md` — how P0 was built (files, patterns, tests). Copy those patterns.
4. `docs/OOHRENA_Vendor_Dashboard_Technical_Blueprint.pdf` — the source requirement for the vendor flow.
5. **Founder's Phase 1 (from 28 Nov 2026):** remaining tasks, order, blockers and prompts are in `docs/PHASE1_PLAN_HINGLISH.md`. It takes precedence over the Sprint 1 order below.
6. **Current priority (weekend of 28 Nov 2026):** vendor self-registration, referral coins and public vendor profile — what/why in `docs/VENDOR_ONBOARDING_REFERRAL_PLAN.md`, task-by-task prompts in `docs/WEEKEND_BUILD_PLAYBOOK.md`. Do that before Sprint 1 below.

## Where things stand

- `main` contains MVP modules 1–10 and **vendor blueprint P0 (V0.1–V0.6)**: vendor team roles + RBAC matrix, versioned `system_settings` with maker-checker, staff roles verifier / ops / auditor, hash-chained audit log, background job runner, `request_id` on errors.
- Verified on 24 Nov 2026 before merging: `npm run typecheck` clean (shared, api, web), `npm test` all green (161 tests).
- Not yet done: a staging deploy + smoke test of this version (`docs/LAUNCH_GUIDE.md` §8).

## Blocked — needs the product owner, not a developer

Do not pick an answer yourself. Ask, then write the answer into the "Decisions needed" table in `VENDOR_BLUEPRINT_BUILD_PLAN.md`.

| # | Decision | Blocks |
|---|----------|--------|
| D1 | Does the vendor build quotes (admin approves) or does admin keep building them? | V2.3 quote builder |
| D2 | Payments: ledger + milestones on manual payments now, gateway later? | all of P4 |
| D3 | Asset code format `OHR-{STATE}-{CITY}-{TYPE}-{SEQ}` as an extra `assetCode` field? | V1.7 |
| D5 | Is buyer contact ever shown to the vendor after booking? | V2.2, V2.5 |
| D6 | Hide enquiry/booking on production until P1 passes? | release |
| D7 | Re-verification cycle, commission %, KYC APIs, e-invoice/TDS, gallery vs in-app camera, DOOH scope, data retention, non-circumvention clause | defaults in `system_settings` |

Other owner-side items: SMS provider account (DLT sender) for mobile OTP, legal text for the vendor agreement, signed `docs/OWNERSHIP_CONFIRMATION.md`.

## Do next, in this order

Each box = one feature branch / PR off `main`, with API tests (positive **and** negative: wrong role 403, other user's ID 404, missing reason 400, bad transition 409), typecheck clean, web build, phone-width check. Tick it here **and** in the build plan.

### Sprint 1 — P1 inventory core (release gate)
- [ ] **V1.7** Asset code (after D3) — AT-INV-01, AT-INV-17
- [ ] **V1.8** Asset status lifecycle + `asset_status_history`; search/booking only for `verified` / `reverify_due` — AT-INV-02, AT-INV-12, AT-BKG-01
- [ ] **V1.9** Location fields, master lists, GPS accuracy from settings — AT-INV-04
- [ ] **V1.11** Evidence photos: kinds, EXIF, distance flag, watermark — AT-INV-03, AT-INV-05, AT-INV-06
- [ ] **V1.12** Asset documents (permit/NOC/lease), expiry auto-suspend — AT-INV-03, AT-INV-13
- [ ] **V1.13** Verification rounds + verifier console (uses the V0.3 `verifier` role) — AT-INV-07…09
- [ ] **V1.14** KYC gate on verification — AT-INV-20
- [ ] **V1.17** Re-verification reminders + expiry (job `reverify_reminder` already registered in V0.5) — AT-INV-11, AT-INV-12
- [ ] **V1.22** Vendor inventory screens (table + map, 7-step wizard, asset detail, re-verification queue)

### Sprint 2 — rest of P1
- [ ] **V1.10** Size & specs · **V1.15** critical-edit re-review (AT-INV-10) · **V1.16** duplicate asset 15 m (AT-INV-14) · **V1.18** versioned rate card (AT-INV-18) · **V1.19** availability reasons + freshness (AT-INV-19, AT-BKG-02) · **V1.20** Excel import, 500 rows (AT-INV-15) · **V1.21** audit denied cross-vendor access (AT-INV-16)
- [ ] **KYC V1.1–V1.6**: business profile, new document types + verifier pass/fail, new KYC state machine, agreement version, duplicate vendor flag (AT-KYC-01), bank-change security with 48 h payout hold (AT-KYC-02, AT-KYC-03)

**P1 exit: AT-INV-01 … AT-INV-20 all pass.** Deploy to staging and run the smoke test before starting P2.

### Later phases (details in the build plan)
- [ ] **P2** search on verified assets, vendor enquiry inbox, quote builder (D1), contact-info filter, negotiation chat
- [ ] **P3** booking states, typed work orders, creative flow, proof types + validation engine, check-in/out, execution dashboard, dispute pack, field PWA
- [ ] **P4** (after D2) milestones, gapless invoices, double-entry ledger, two-approver settlements, bank-file reconciliation, vendor statement, refunds/penalties
- [ ] **P5** vendor score, vendor reports, buyer compliance pack, leakage signals, admin impersonation (read-only), session controls
- [ ] **Non-functional** Hindi + English UI, resumable upload, WCAG 2.1 AA and 4G load-time checks

## How to work on a task

```sh
git checkout main && git pull
git checkout -b feat/v1-7-asset-code
npm install
npm run dev:api:memory   # API :4000, in-memory DB, seeded accounts (README)
npm run dev:web          # web :8080
# build it following AGENTS.md §5, then:
npm test && npm run typecheck && npm run build -w @oohrena/web
```

Open a PR into `main`; don't push straight to `main`. Never commit `.env`, uploads or credentials.
