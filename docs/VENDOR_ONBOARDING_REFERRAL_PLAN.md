# Vendor onboarding, referral coins & Super Vendor network — build plan

Written: 25 Nov 2026. Source: team discussion (WhatsApp, Nov 2026), `OOHRENA_Vendor_Registration_and_Inventory_Form.pdf` (sections A–L), Super Vendor Network poster.
Goal: vendors can **register and upload inventory themselves** after this weekend's final testing; every share brings a reward, so word of mouth grows the network.

All rules in `AGENTS.md` still apply: server-side permission + ownership checks, zod validation, audit, `nextId`, no secrets, encrypted bank/KYC files, DEMO never bookable.

---

## 0. What already exists (don't rebuild)

| Piece | Where | Status |
|---|---|---|
| Vendor sign-up (name, email, mobile, password, legal name, **PAN required**, GSTIN, city) | `POST /vendors/register`, `registerVendorInput` | Done |
| KYC documents (PAN, GST, authorisation, address proof) + admin approve/reject | `vendor-kyc.ts`, `admin-vendors.ts` | Done |
| Bank details, AES-encrypted, masked | `PUT /vendors/me/bank` | Done |
| Vendor team (owner / manager / field / accounts) | V0.1 | Done |
| Listings with photos, admin review, DEMO flag | `vendor-inventory.ts` | Done |
| Growth Partner leads + earnings | `partner.ts` | Done (separate from coins) |
| Mobile OTP | `/auth/send-mobile-otp` | Code done, **needs SMS provider (DLT)** |
| `system_settings` for configurable numbers | V0.2 | Done — coin rates go here |

---

## 1. Weekend scope (go-live for vendor registration)

Order matters: R1 → R2 → R3 → R4. R5 is after the weekend.

### R1. Quick sign-up, PAN/GST after sign-in
Agreed in the discussion: ask the minimum first, PAN and GSTIN after login.
- Sign-up fields: full name, mobile, email, password, city, partner category (PDF §B, multi-select), **referral code (optional, pre-filled from the share link `?ref=CODE`)**, accept terms.
- Same quick form for clients (existing `/auth/register`) gets the referral field too.
- PAN moves from sign-up to onboarding step 1. KYC cannot be **submitted/approved** without PAN (keep `REQUIRED_KYC_DOCS`), so security does not change.
- Change: `registerVendorInput` (`pan` optional → removed from sign-up), `Vendor.pan` unique index becomes **sparse/partial** (only when set).
- Tests: sign-up without PAN works; KYC submit without PAN → 400; duplicate PAN on onboarding → 409.

### R2. Onboarding wizard = the PDF form, online
After sign-in the vendor sees one wizard; progress saved per step; "Submit for review" at the end.

| Step | PDF section | Stored in |
|---|---|---|
| 1 Business | A (legal/trade name, designation, WhatsApp, website, office address, business type, year, **PAN, GSTIN**, Udyam, language) | `Vendor` (new fields) |
| 2 Category | B (media owner / aggregator / execution / agency / proposed Super Vendor / other) | `Vendor.categories[]` |
| 3 Territory | C (primary city/district/state, other cities/states, network size, sites count, outside-city execution, response time) | `Vendor.territory` |
| 4 Execution | H (services checklist, team size, capacity, emergency time, equipment, subcontractors, contacts) | `Vendor.execution` |
| 5 Availability & SLA | I (update frequency, blackout dates, can hold + max hold, proof SLA) | `Vendor.sla` |
| 6 Documents | F checklist → existing KYC upload; add types `business_registration`, `ownership_proof`, `municipal_permission`, `cancelled_cheque`, `rate_card` | `VendorDocument` |
| 7 Bank | J → existing bank screen (owner only, encrypted) | `VendorBank` |
| 8 Declaration | K (all 9 checkboxes required, signatory name, designation, place; typed signature + timestamp + IP) | `Vendor.declaration` (audited, versioned text) |

- Inventory (PDF §D, E, G) stays per asset in the existing listing form; add missing fields: faces/slots, face direction, illumination, min booking duration, lead time, next free date, rate inclusions (printing / mounting / permission / transport yes-no), GST treatment. Excel import of many sites = V1.20 (after weekend).
- §L "Office use" maps to the admin vendor review screen (KYC, ownership, asset, permission, rate card status, site visit, territory, assigned Super Vendor, remarks, next review date).
- Every step: zod `.strict()` schema in `packages/shared/src/vendor.ts`, `PATCH /vendors/me/onboarding/:step` **inside `vendors.ts`** (router shadowing, AGENTS §6), audit on submit.

### R3. Referral codes + coin wallet + gift box 🎁
**Reward table (from the discussion — rates live in `system_settings`, not in code):**

| Who shares → who joins | Coins to the sharer |
|---|---|
| Vendor → Vendor (B2B) | 100 |
| Vendor → Client (B2C) | 50 |
| Client → Client (C2C) | 25 |
| Super Vendor → anyone | 35 per registration (target-based, see R5) |

Design:
- Every user gets a referral code (`OOH-XXXXXX`) and a share link `https://<site>/register?ref=CODE` with WhatsApp / copy buttons.
- `Referral` collection: `_id RFL-…`, referrerUserId, refereeUserId (unique — one referrer per person), kind (b2b/b2c/c2c/sv), status `pending → qualified → rewarded | rejected`.
- **Coin ledger, not a balance field**: `CoinLedger` append-only (like the audit log): `_id CNL-…`, userId, delta, reason (`referral_reward`, `welcome_bonus`, `reversal`, `admin_adjust`), refId, status `pending | available | reversed`. Wallet balance = sum. Admin adjustments need a reason + maker-checker. No update/delete paths.
- **When coins become usable** (anti-fraud): credited as `pending` at sign-up, `available` once the new user's mobile OTP is verified **and** (for vendors) KYC is approved. Self-referral, same mobile/PAN/device → rejected. Daily cap per referrer in `system_settings`.
- **Gift box**: after the onboarding form is submitted, a 🎁 opens and shows the coins earned (welcome bonus + any pending referral coins), then "Saved to your wallet". Wallet page: balance (available / pending), history, share link.
- Coins have **no rupee value and cannot be withdrawn** until the owner decides otherwise (see Q2). If they ever become money, Finance rules (maker-checker, no hard delete) apply.

### R4. Vendor ID live on the marketplace
- Public vendor profile `/v/VND-000123`: trade name, logo, city/territory, categories, member since, **verified badge only when KYC is approved**, and only **verified, non-DEMO** listings.
- Contact details stay hidden (admin in the middle, D5). Pending / rejected / suspended vendors → 404.
- Marketplace listing cards link to the vendor profile.
- Needs the **valid OOHRENA logo file** (SVG/PNG) from the owner — current pin logo is a placeholder.

---

## 2. After the weekend

### R5. Super Vendor network (State → Zone → District → Area → Vendor)
- Territory masters: State, Zone, District, Area (admin-managed lists, from V1.9 location masters).
- New vendor flag `superVendorLevel ∈ state | zone | district | area` assigned by admin (maker-checker), with a territory.
- Each vendor is linked to the Super Vendor of its area (form §L "Assigned Super Vendor"); the chain up is derived.
- Super Vendor dashboard: vendors and assets under them, registrations this month vs target, coins earned, execution status in their territory (read-only; no access to other territories → 404).
- Admin "National" view: counts per level, as on the poster — but **only numbers the API actually measures** (AGENTS §5a, no fake "12,850 vendors").
- Estimate: ~1 week after the decisions below.

### Then continue `NEXT_TASKS.md` Sprint 1 (V1.7 … V1.22).

---

## 3. Questions for the owner (answer before / during the weekend)

| # | Question | Suggested answer |
|---|---|---|
| Q1 | When does a referral pay out — at sign-up, after mobile verified, or after KYC approved? | Pending at sign-up; available after mobile OTP + (vendor) KYC approval |
| Q2 | What can coins be used for? Cash withdrawal? | No cash for now; later a discount on platform fees / rewards. Cash = Finance + TDS work |
| Q3 | Does the **new user** also get coins (welcome bonus in the gift box)? How many? | Yes, e.g. 25 for anyone completing onboarding |
| Q4 | Client → Vendor referral: how many coins? (not in the list) | 50, same as vendor → client |
| Q5 | Super Vendor 35 coins: in addition to the 100/50/25, or instead? What is the target and what happens at the target? | Instead of; target set per level in `system_settings` |
| Q6 | Who appoints Super Vendors, and can there be two for one area? | Admin only, one per territory |
| Q7 | Show a vendor on the marketplace before KYC approval? | No — only approved |
| Q8 | Daily referral cap / fraud rules | 20 referrals/day; same mobile/PAN/device rejected |
| Q9 | Logo file + referral programme T&C text | Owner to send |
| — | SMS provider (DLT) for OTP — already pending | Needed for Q1 anti-fraud |

---

## 4. Realistic timeline

| When | What |
|---|---|
| Sat | R1 quick sign-up + R2 steps 1–4 (API + screens + tests) |
| Sun | R2 steps 5–8 + R3 referral, coin ledger, wallet, gift box |
| Mon | R4 public vendor profile, staging deploy, smoke test, team testing |
| After sign-off | Open vendor registration on production |
| +1 week | R5 Super Vendor network |

If the weekend runs short, R4 moves to Monday; R1–R3 are the must-haves for vendors to start registering.

## 5. Done means
`npm test` green (new tests: self-referral rejected, duplicate referee 409, coins not available before qualification, ledger has no update/delete, other user's wallet 404, unapproved vendor profile 404), `npm run typecheck` clean, web build, phone-width check, README status table + this file ticked.
