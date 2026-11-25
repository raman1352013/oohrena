# Weekend build playbook — vendor onboarding, referral coins, vendor profile

Written 25 Nov 2026. **One file to run the whole build with an AI coding agent (Claude Code, Antigravity, Cursor…).**
What and why: `docs/VENDOR_ONBOARDING_REFERRAL_PLAN.md`. Rules: `AGENTS.md`. This file = **how**, task by task, with a prompt to paste.

---

## How to use this file (kaise use karna hai)

1. Do tasks **in order** (T1 → T10). One task = one branch = one PR. Don't give an agent two tasks at once.
2. Start every task fresh from `main`:
   ```sh
   git checkout main && git pull
   git checkout -b <branch from the task>
   ```
3. Open a **new** agent chat. Paste the **Common prefix** (below) + the task's **Prompt**.
4. When the agent says done, run the **Review checklist** (section 3) yourself. Don't merge on the agent's word.
5. Merge the PR, tick the box here, go to the next task.
6. If an agent wants to change something listed under "Do not touch", stop it and ask.

**Owner answers (Q1–Q9 in the plan) are not needed to start.** Every number goes in `system_settings` with the suggested default, so the owner can change it later without code.

---

## 1. Does this fit our architecture? (checked against the code, 25 Nov)

| Our rule | How this build follows it |
|---|---|
| Contracts once, in `packages/shared` | All new schemas, enums, coin maths and ID prefixes go in `packages/shared/src/` first (T1) |
| Business IDs via `nextId` | New prefixes `RFL` (referral) and `CNL` (coin ledger) added to `ID_FORMATS` in `packages/shared/src/ids.ts` |
| Server-side permission + ownership, 404 for others' records | New permissions in `roles.ts` (`referral.read`, `wallet.read`, `wallet.adjust`, `vendor.public`); wallet/referral queries always filter by `req.user.userId` |
| `/vendors/me/*` router shadowing | Onboarding endpoints go **inside `routes/vendors.ts`**; referral/wallet get their own router `routes/referrals.ts` at `/api/v1/referrals` and `/api/v1/wallet` |
| Append-only records | `CoinLedger` copies the audit-log pre-hook pattern (`models/audit-log.ts`): no update / delete |
| Configurable numbers | Coin rates and caps in `packages/shared/src/settings.ts` defaults, marked sensitive (maker-checker) |
| Transactions | Register + referral record + pending coins in one `withTransaction` (already used by `/vendors/register`) |
| Encryption / masking | Bank stays in existing `VendorBank`; PAN masked on public screens; no new sensitive files |
| DEMO never shown as verified | Public vendor profile lists only `verified`, non-DEMO listings; unapproved vendor → 404 |
| UI kit + simple copy | Screens use `kit.tsx`, `Field`/`FormError`, `<Loading />`, `<Empty title>`, `ask()` — no helper paragraphs |

**Two risky changes — handle exactly as written:**
- **PAN leaves sign-up.** `Vendor.pan` is `required` with a `unique` index today. It becomes optional with a **partial** unique index (`{ partialFilterExpression: { pan: { $type: "string" } } }`). On Atlas the old index `pan_1` must be dropped once — T2 adds a script for it. KYC approval still requires PAN, so security is unchanged.
- **Coins are not money.** No rupee value, no withdrawal. Do not put coins in `finance` models or payables. If the owner later makes them cash, that is a new task with Finance maker-checker.

---

## 2. Common prefix (paste at the top of EVERY task prompt)

```
You are working in the OOHRENA monorepo (npm workspaces: apps/api, apps/web, packages/shared).
Before writing code, read AGENTS.md completely and follow it exactly — it overrides your defaults.
Then read docs/VENDOR_ONBOARDING_REFERRAL_PLAN.md and docs/WEEKEND_BUILD_PLAYBOOK.md (this task's section).
Rules you must not break:
- Shared zod schemas/enums/maths go in packages/shared/src and are exported from src/index.ts.
- Every endpoint: requirePermission(...) + object-level ownership check; another user's record returns 404.
- Validate every body with validateBody(schema) (.strict()), every query with parseQuery.
- IDs only via nextId("<PREFIX>"). Audit every state change with audit(req, {...}).
- New /vendors/me/* endpoints go inside apps/api/src/routes/vendors.ts (router shadowing, AGENTS.md §6).
- Mongoose 9: returnDocument: "after", enum-typed filters (cast `as never` where needed), no update pipelines.
- Web: TanStack Query hooks in apps/web/src/lib/<domain>-api.ts, UI with components/app/kit.tsx,
  <Loading />, <Empty title=... />, no helper text, no window.prompt/confirm (use ask()), works at 375px width.
- Never edit apps/web/src/routeTree.gen.ts. Never commit .env, uploads or secrets.
Only do the task below. Don't refactor unrelated code. Don't build anything from "Later".
When done, run: npm test && npm run typecheck && npm run build -w @oohrena/web — all must pass.
Then list: files changed, new endpoints, new tests, and anything you could not do.
```

---

## 3. Review checklist (you run this after every task)

```sh
git status                        # no .env, no uploads/, no routeTree.gen.ts changes you didn't expect
git diff main --stat              # only files this task should touch
npm test
npm run typecheck
npm run build -w @oohrena/web
```
Then check by eye:
- [ ] New endpoint has `requirePermission` and a userId/vendorId filter (search the diff for `findById(` without an owner filter — that's a bug).
- [ ] Tests include negatives: wrong role 403, other user's ID 404, bad input 400, bad transition 409.
- [ ] `audit(` called on every create / status change.
- [ ] No hard-coded coin numbers outside `settings.ts`.
- [ ] Run it: `npm run dev:api:memory` + `npm run dev:web`, click the flow with a seeded account (README), and at phone width.

If something fails, paste the failure back to the same agent: "Fix this without changing anything else: <output>".

---

## 4. Tasks

### ☐ T1 — Shared contracts (do first; everything depends on it)
Branch `feat/onboard-t1-shared-contracts`

Prompt:
```
Task T1: add the shared contracts for vendor onboarding and referral coins. No API routes or UI in this task.
1. packages/shared/src/ids.ts: add RFL (yearly, pad 6) for referrals and CNL (yearly, pad 6) for coin ledger rows.
2. packages/shared/src/vendor.ts:
   - VENDOR_CATEGORIES = media_owner | aggregator | execution_partner | agency | proposed_super_vendor | other (PDF §B).
   - BUSINESS_TYPES = proprietorship | partnership | llp | pvt_ltd | individual | other.
   - Extend KYC_DOC_TYPES with business_registration, ownership_proof, municipal_permission, cancelled_cheque, rate_card (+ labels).
   - zod .strict() schemas, one per onboarding step:
     onboardingBusinessInput (PDF §A: tradeName, designation, whatsapp, website, officeAddress{line1,line2,city,district,state,pin}, businessType, yearEstablished, pan (required here), gstin optional, udyam optional, language),
     onboardingCategoryInput (categories[] min 1, otherCategory),
     onboardingTerritoryInput (§C: primaryCity, primaryDistrict, state, otherCities[], statesServed[], networkSize, approxSites, outsideCity bool, responseTimeH),
     onboardingExecutionInput (§H: services[] enum of the 8 checklist items, teamSize, citiesCovered[], dailyCapacity, emergencyResponseH, equipment, usesSubcontractors, executionContact{name,mobile}, escalationContact{name,mobile}),
     onboardingSlaInput (§I: updateFrequency daily|weekly|on_request, blackoutDates[] YYYY-MM-DD, canHold, maxHoldH, proofWithinSla, proofTimeH),
     onboardingDeclarationInput (§K: all 9 accept flags must be literal true, signatoryName, designation, place).
   - ONBOARDING_STEPS = business | category | territory | execution | sla | declaration, and a type map step → schema.
3. New file packages/shared/src/referral.ts:
   - REFERRAL_KINDS = b2b | b2c | c2c | c2v | sv ; REFERRAL_STATUSES = pending | qualified | rewarded | rejected with REFERRAL_TRANSITIONS.
   - COIN_REASONS = referral_reward | welcome_bonus | reversal | admin_adjust ; COIN_STATUSES = pending | available | reversed.
   - referralKindFor(referrerRole, referrerIsSuperVendor, refereeRole) → kind.
   - REFERRAL_CODE_RE = /^OOH-[A-Z0-9]{6}$/ ; coinAdjustInput (userId, delta int non-zero, reason min 3 chars) .strict().
   - walletBalance(rows) → { available, pending } pure function.
4. packages/shared/src/settings.ts defaults: referral.coins.b2b 100, referral.coins.b2c 50, referral.coins.c2c 25,
   referral.coins.c2v 50, referral.coins.sv 35, referral.welcome_bonus 25, referral.daily_cap 20,
   referral.require_kyc_for_vendor true. Make every referral.* key sensitive in isSensitiveSetting.
5. roles.ts: permissions referral.read {client own, vendor own, growth_partner own, admin all},
   wallet.read {client own, vendor own, admin all, finance all, auditor all}, wallet.adjust {admin all},
   vendor.onboarding {vendor own}. Update roles.test.ts if it snapshots the matrix.
6. Unit tests next to the code: referralKindFor for all combinations, walletBalance, each onboarding schema rejects unknown fields and the declaration rejects any false flag.
Export everything from packages/shared/src/index.ts.
```
Done when: `npm test -w @oohrena/shared` green, typecheck clean.

---

### ☐ T2 — Quick sign-up (PAN after login) + referral code capture
Branch `feat/onboard-t2-quick-signup` · needs T1

Prompt:
```
Task T2: shorten vendor sign-up and capture referral codes. Uses contracts from T1.
API:
1. registerVendorInput (packages/shared/src/schemas): remove pan and gstin; add categories (VENDOR_CATEGORIES, min 1) and optional ref (REFERRAL_CODE_RE). registerClientInput: add optional ref.
2. models/foundation.ts Vendor: pan not required (default null), add categories[], onboarding { steps: Map/obj of completed step → date, submittedAt }, business/territory/execution/sla/declaration sub-docs (shapes from T1 schemas). Replace the pan unique index with a partial unique index (partialFilterExpression pan $type string).
   User: add referralCode (unique, sparse), referredByCode (string|null).
3. On every new user (vendor register, client register, and createStaff is NOT included) generate a unique referralCode OOH-XXXXXX inside the same transaction (retry on duplicate). Store referredByCode if a valid ref was sent; an unknown code is ignored silently (don't leak which codes exist).
   Do NOT create Referral or coin rows yet — that is T5.
4. KYC: approving a vendor (admin-vendors.ts) and /me/kyc/resubmit must fail 400 "PAN required" when vendor.pan is null.
5. apps/api/scripts/migrate-pan-index.ts: drops index pan_1 if it exists and syncs indexes. Add npm script "migrate:pan-index" in apps/api/package.json. Document it in docs/LAUNCH_GUIDE.md under deploy steps.
6. Update seed + test fixtures so existing tests still pass (approvedVendor sets pan).
Tests (apps/api/test/onboarding-signup.test.ts): sign-up without PAN → 201 and pending; two vendors with no PAN both allowed; ref code stored; unknown ref ignored; every user gets a referralCode; approve KYC without PAN → 400.
Web:
7. apps/web/src/routes/register.tsx vendor form: drop PAN/GST fields, add category checkboxes; read ?ref= from the URL into a hidden/prefilled "Referral code" field for both client and vendor forms.
```
Done when: sign up as a vendor in the browser with only name/mobile/email/password/city/category.

---

### ☐ T3 — Onboarding API (PDF form sections A, B, C, H, I, K)
Branch `feat/onboard-t3-onboarding-api` · needs T2

Prompt:
```
Task T3: onboarding wizard API for vendors. All endpoints INSIDE apps/api/src/routes/vendors.ts, before the /me catch-all.
1. GET /vendors/me/onboarding → { steps: {business, category, territory, execution, sla, documents, bank, declaration: done bool}, submittedAt, data } — documents = required KYC docs uploaded (PAN at least), bank = VendorBank exists.
2. PATCH /vendors/me/onboarding/:step (step in ONBOARDING_STEPS except declaration) — requireVendorRole("owner","manager"), validateBody with that step's T1 schema (choose schema by param; unknown step → 404).
   business step sets Vendor.pan/gstin too; duplicate PAN → 409 DUPLICATE_PAN. Saving is allowed until submitted; after submit, only while kycStatus is rejected (resubmission) → else 409 INVALID_TRANSITION.
   audit action "vendor.onboarding.save" with before/after (mask PAN as ******1234 in audit).
3. POST /vendors/me/onboarding/submit — owner only, body onboardingDeclarationInput. Requires all other steps done (400 with the list of missing steps). Stores declaration with text version "2026-11", signedAt, ip. Sets onboarding.submittedAt, notifies admins (existing notify()), audit "vendor.onboarding.submit".
   Return { submittedAt }. (T5 will hook coins into this; leave a clearly named function call point onOnboardingSubmitted(vendorId, session) that does nothing yet.)
4. Admin: GET /admin/vendors/:id returns the onboarding data (PAN masked unless finance/admin view already logs it — follow existing bank masking pattern).
Tests (apps/api/test/onboarding.test.ts): each step saves; unknown field → 400; client role → 403; manager can save but not submit → 403; submit with missing steps → 400 listing them; declaration with a false flag → 400; save after submit → 409; duplicate PAN → 409; another vendor cannot read my onboarding (data stays scoped by req.user.orgId).
```

---

### ☐ T4 — Onboarding wizard UI
Branch `feat/onboard-t4-onboarding-ui` · needs T3

Prompt:
```
Task T4: vendor onboarding wizard UI for the T3 API.
1. apps/web/src/lib/vendor-onboarding-api.ts: useOnboarding(), useSaveStep(step), useSubmitOnboarding() — invalidate ["vendor","onboarding"] and ["vendor","me"].
2. apps/web/src/components/app/vendor/OnboardingWizard.tsx: left list of 8 steps with done ticks (row on phones), one form per step using Field/FormError and kit Btn. Steps documents and bank reuse the existing KycPanel upload and bank form (import, don't copy).
   Declaration step: the 9 checkboxes with the PDF §K wording, signatory name, designation, place, Submit button (disabled until all steps done; show which are missing as Pills, not a paragraph).
3. In routes/vendor.tsx: if onboarding.submittedAt is null, show the wizard instead of the dashboard tabs; after submit show the dashboard with a "Under review" Pill.
4. Labels are short nouns (AGENTS.md §5a). <Loading /> while loading, error via FormError. Check at 375px width.
Leave a prop/slot onSubmitted(result) on the wizard — T6 will open the gift box there.
```

---

### ☐ T5 — Referral records + coin ledger API
Branch `feat/onboard-t5-referral-coins-api` · needs T2 (T3 for the submit hook)

Prompt:
```
Task T5: referrals and coin wallet on the server.
Models (apps/api/src/models/referral.ts):
- Referral { _id RFL-…, referrerUserId, refereeUserId (unique), kind (REFERRAL_KINDS), status (REFERRAL_STATUSES), coins, reason, qualifiedAt, rewardedAt } indexes: referrerUserId+createdAt, status.
- CoinLedger { _id CNL-…, userId, delta int, reason (COIN_REASONS), status (COIN_STATUSES), refType, refId, createdBy, createdAt } — APPEND-ONLY: copy the pre-hooks from models/audit-log.ts so updateOne/updateMany/deleteOne/deleteMany/findOneAndUpdate/findOneAndDelete throw. Status change = insert a new row (e.g. a "reversal" row), never edit.
  Wallet balance = walletBalance() from shared over the user's rows. Index userId+createdAt.
  Pending→available: insert a reason:"referral_reward" status:"available" row and a matching negative pending row (so the sum stays honest). Put this in one service function.
Service apps/api/src/services/referrals.ts (all inside withTransaction):
- onUserRegistered(user, session): if referredByCode matches a user → reject self-referral, same mobile, or (vendor) same PAN later; enforce referral.daily_cap per referrer; create Referral pending with kind = referralKindFor(...) and coins = setting referral.coins.<kind>; add CoinLedger pending row for the referrer. Call it from both register routes (T2 code).
- tryQualify(refereeUserId, session): qualified when the referee's mobile is verified AND (if referee is a vendor and referral.require_kyc_for_vendor) kycStatus approved. Then reward: make referrer coins available, status rewarded. Call it from verify-mobile (auth.ts) and KYC approve (admin-vendors.ts).
- onOnboardingSubmitted(vendorId, session): welcome bonus referral.welcome_bonus once per user (pending until qualified, same rule). Wire into the T3 hook. Also give clients the welcome bonus once when they finish profile (skip if no such step exists; note it).
- KYC rejected/suspended permanently or account suspended → reversal rows for still-pending coins, Referral rejected with reason.
Routes apps/api/src/routes/referrals.ts mounted in app.ts:
- GET /referrals/me → my code, share link (cfg web origin + /register?ref=CODE), my referrals (referee shown as masked name + kind + status + coins, never their email/mobile).
- GET /wallet/me → { available, pending, rows (paged) }.
- GET /wallet/:userId (admin/finance/auditor) and POST /wallet/adjust (admin, coinAdjustInput, reason required, audited; delta beyond ±1000 requires a second admin via existing maker-checker pending action pattern — if that is too large, block > ±1000 with 400 and note it).
Audit: referral.create, referral.qualify, referral.reject, coin.credit, coin.reverse, coin.adjust.
Tests (apps/api/test/referrals.test.ts): vendor→vendor gives 100 pending; becomes available only after mobile verified + KYC approved; vendor→client 50; client→client 25; self-referral rejected; same referee twice → only one Referral (unique); daily cap; CoinLedger update/delete throw; GET /wallet/USR-of-someone-else as client → 403/404 per matrix; adjust without reason → 400; numbers come from settings (change a setting in the test and see the new amount).
```

---

### ☐ T6 — Wallet, share link and gift box UI
Branch `feat/onboard-t6-wallet-giftbox-ui` · needs T4 + T5

Prompt:
```
Task T6: wallet + referral UI and the gift box.
1. apps/web/src/lib/referral-api.ts: useMyReferrals(), useMyWallet().
2. components/app/WalletPanel.tsx (shared by vendor, client, partner screens): Stats (Available, Pending), Share card with the code, Copy button and a WhatsApp link (https://wa.me/?text=<encoded message + link>), table of referrals (name masked, kind, Pill status, coins), ledger list. Empty state <Empty title="No referrals" />.
   Add a "Wallet" tab on vendor.tsx, client.tsx and partner.tsx.
3. components/app/GiftBox.tsx: full-screen Dialog, closed box → tap/auto after 600 ms → lid opens (CSS transform, no new animation library), coins count up to the welcome bonus + pending referral coins from /wallet/me, then "Saved to your wallet" and a Btn to the Wallet tab. Respect prefers-reduced-motion (show the result without animation). Open it from the wizard's onSubmitted slot (T4).
4. Coins are labelled "Pending" until available — never show pending coins as earned.
Check 375px width and dark mode.
```

---

### ☐ T7 — Listing fields from the PDF (sections E, G)
Branch `feat/onboard-t7-listing-fields` · needs T1 only (can run in parallel with T3–T6)

Prompt:
```
Task T7: add the missing per-asset fields from the vendor form (PDF §E and §G) to listings.
Fields: faces (int), faceDirection, trafficSide, illumination yes|no|na, minBookingDays, leadTimeDays, nextFreeDate, ownership owned|agreement|authorised|other, rateIncludes { printing, mounting, permission, transport } booleans, printingRate, mountingRate, gstApplicable + gstRatePct, rateValidUntil, minBookingValue.
Shared listing schema first (packages/shared/src/inventory.ts), then model, then ListingEditor.tsx.
Changing rate, size or location must still send the listing back to review (existing rule) — add the new money fields to that rule.
Money stays computed by computeQuoteTotals; do not change quote maths in this task — only store the fields. Tests in vendor-inventory.test.ts for validation and the back-to-review rule.
```

---

### ☐ T8 — Admin review screen (PDF section L)
Branch `feat/onboard-t8-admin-review` · needs T3

Prompt:
```
Task T8: admin vendor review = PDF §L "Office use".
Add to Vendor: review { identity, ownership, assets (pending|partial|verified|rejected), permission, rateCard (pending|approved|clarification), siteVisitRequired, territory, assignedSuperVendorId (null for now), remarks, nextReviewDate, reviewedBy, reviewedAt }.
PATCH /admin/vendors/:id/review (permission used by verifier + admin, validateBody .strict(), reason required when any item is rejected, audited).
Admin vendor detail screen (components/app/admin/...) shows the onboarding data read-only (PAN masked) + the review form. kycStatus approval stays the existing decision endpoint.
Tests: verifier can save review, client/vendor 403, rejected without reason 400, unknown vendor 404.
```

---

### ☐ T9 — Public vendor profile on the marketplace
Branch `feat/onboard-t9-vendor-profile` · needs T3 (logo from owner for the final look)

Prompt:
```
Task T9: public vendor profile.
API: GET /api/v1/public/vendors/:vendorId (no login): only when kycStatus approved, else 404. Returns tradeName||legalName, city/state, categories, memberSince, verified: true, listings = only verified & non-DEMO listings (same filter search uses). Never return PAN, GSTIN, email, mobile, bank, address line, userId. Rate-limit like other public routes.
Web: route apps/web/src/routes/v.$vendorId.tsx — header with name + "Verified" Pill (only because the API says approved), listing cards reusing the marketplace card. Marketplace cards link to /v/<vendorId>. isPublicPath in apps/web/src/lib/auth.ts matches exact paths only: extend it to also accept paths starting with "/v/" (not ROUTE_ROLES), and add cases to apps/web/src/lib/auth.test.ts proving "/v/VND-000001" is public while "/vendor" and "/vendor/x" still need login.
Tests: approved vendor → 200 with no private fields (assert keys); pending/rejected/suspended → 404; DEMO listing never in the response.
```

---

### ☐ T10 — Staging + go-live check
Branch none — do it yourself (or ask an agent only to run commands and report).

1. Merge T1–T9. Deploy to staging (`docs/LAUNCH_GUIDE.md`), run `npm run migrate:pan-index -w @oohrena/api` once.
2. Smoke test with 3 people on phones:
   - Vendor A signs up from scratch → wizard → submit → gift box shows pending coins.
   - A shares the link on WhatsApp → Vendor B signs up with `?ref=` → A sees B as pending.
   - Admin approves B's KYC after B verifies mobile → A's 100 coins become available.
   - Client signs up via A's link → 50 pending.
   - B's public profile shows only after approval, with no phone/email.
3. Owner signs off → open registration on production.

---

## 5. Later (not this weekend — don't let agents start these)
- **T11 Super Vendor network** (State → Zone → District → Area → Vendor): territory masters, admin assigns level (maker-checker), vendor ↔ area Super Vendor link, Super Vendor dashboard, targets from settings, `sv` referral kind turned on. Needs owner answers Q5, Q6.
- Excel bulk import of sites (V1.20), SMS provider wiring, coin redemption (Q2).
- Then continue `docs/NEXT_TASKS.md` Sprint 1.

## 6. Parallel or one by one?
One agent at a time is safest. If you want two at once: **T7 can run beside T3–T6** (different files). Everything else follows the chain T1 → T2 → T3 → (T4, T5, T8) → T6 → T9.
