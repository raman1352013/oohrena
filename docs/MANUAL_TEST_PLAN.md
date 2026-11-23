# OOHRENA — Manual test plan (MVP first draft)

For a manual tester. Run each step in order; tick ✅ / ❌ and write what you saw for every ❌
(screenshot + the ID shown on screen, e.g. `LD-2026-000003`).

## 0. Setup

| What | Value |
|------|-------|
| Web | http://localhost:8080 (local) or the staging link you are given |
| Accounts | admin@, finance@, finance2@, client@, client2@, vendor@, vendor2@, partner@ — all `@test.oohrena.local` |
| Password | ask the developer (it is `SEED_PASSWORD` in `apps/api/.env`; never share it in chat or tickets) |
| Fresh data | developer runs `npm run dev:api:memory`, `npm run dev:web`, then `npm run seed:demo -w @oohrena/api` |

Use a **separate browser profile / incognito window per role** so you can stay signed in as two
people at once. Test on desktop **and** on a phone (or Chrome DevTools → 375 px wide).

Demo data you should see at the start (see `docs/DEMO_GUIDE_HINGLISH.md` §3): 9 live listings in 9 cities
(hoardings, LED screen, unipole, bus, mall screens, LED van); `LD-2026-000001` booked with one verified and one
pending proof and a verified advance; `LD-2026-000002` New; `LD-2026-000003` (client2) quote waiting for the client;
`LD-2026-000004` under review; a growth-partner referral; vendor2 KYC documents waiting for review.

---

## 1. Public pages (signed out)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open `/` | Landing page (what OOHRENA is, how it works, who it is for); "Browse verified media" opens `/marketplace` |
| 1.1b | Open `/marketplace` | 9 listings, photos, "Verified" badge, price per month |
| 1.2 | Search "Mumbai", filter city, max price, category chips, List ↔ Map | Results change; map shows pins |
| 1.3 | Pick start/end dates | Cards show availability for those dates |
| 1.4 | Open a listing → "View details" | Photo, size, indicative price, availability calendar with legend |
| 1.5 | Click "Request quotation" while signed out | Asked to sign in / register — no inquiry created |
| 1.6 | `/privacy`, `/terms`, `/confidentiality` | Pages load |
| 1.7 | Open `/admin`, `/vendor`, `/finance`, `/reports`, `/print/quote/x` or any unknown page signed out | Redirected to login |

## 2. Sign-in & account

| # | Step | Expected |
|---|------|----------|
| 2.1 | Login with each account | Lands on the right workspace (client / vendor / admin / finance / partner) |
| 2.2 | Wrong password 5+ times | Error message, then lockout / rate-limit message |
| 2.3 | Register a new client at `/register` | Account created, client portal opens |
| 2.4 | Forgot password | "Check your email" style message (email itself goes to the server log in dev) |
| 2.5 | Account menu → logout | Back to public page; Back button doesn't show private data |
| 2.6 | As client, type `/admin` in the URL | Not allowed (redirect / no data) |

## 3. Client flow — inquiry → quote → booking

| # | Step | Expected |
|---|------|----------|
| 3.1 | client@ → marketplace → a listing → Request quotation → dates, budget, requirement → Submit | "Inquiry received" with a new Lead ID `LD-2026-00000X` |
| 3.2 | Submit with end date before start date / empty requirement | Clear validation error, nothing created |
| 3.3 | Client portal → My inquiries | New inquiry shows status "Received" |
| 3.4 | (after 4.3) My quotations → "Review & decide" | Itemised quote: media, production, installation, 5% fee, CGST/SGST 9%, total |
| 3.5 | Approve | "Quote approved" toast; status Approved |
| 3.6 | Try "Request changes" / Reject on another quote (needs comment) | Comment required; admin sees it |
| 3.7 | (after 4.5) My bookings | Booking `BK-…` with dates and total; Cancel shows fee before confirming |
| 3.8 | Invoices & payments | Invoice `TXI-…` with GST split; payment shows only after Finance verifies |
| 3.9 | Booking → "Proof & updates" | Only **verified** proof photos; "Location not captured" if no GPS |
| 3.10 | Reports page | Campaign list; Dossier PDF and CSV download and open |
| 3.11 | client2@ | Sees none of client@'s inquiries/bookings; opening client@'s IDs by URL shows "not found" |

## 4. Admin — Control Tower

| # | Step | Expected |
|---|------|----------|
| 4.1 | admin@ → Inquiry inbox → New / All filters | New inquiry from 3.1 is listed |
| 4.2 | Open it → Start review → Assign Test Vendor A | Status moves New → Under review → Assigned |
| 4.3 | Build quotation → change production/installation → Save draft → "Approve pricing & release to client" | Totals recomputed by server; status "Awaiting client" |
| 4.4 | Try assigning vendor2@ (KYC pending) by vendor ID | Blocked with a message |
| 4.5 | After client approves: Create booking → write instructions → Issue work order | `BK-…` and `WO-…` created |
| 4.6 | Mark lost / Cancel booking / Reject anything without a reason | Reason is required |
| 4.7 | Vendor KYC & Listings tab | vendor2@ pending; Approve / Reject (reject needs reason) |
| 4.8 | User Management | All users listed; Sessions, Change role, Suspend (needs reason) |
| 4.9 | Proof verification tab (after 5.3) | Proof card with server time, device time, location label; Verify / Reject-with-reason |
| 4.10 | Bookings, Issues, System Health tabs | Load without errors |
| 4.11 | Reports & activity | Funnel, Revenue, Exceptions, Vendor performance, Audit search; PDF/CSV downloads work |

## 5. Vendor

| # | Step | Expected |
|---|------|----------|
| 5.1 | vendor@ → Vendor hub | KYC approved (PAN + GST on file), 9 listings live, work orders listed |
| 5.2 | Work order → Acknowledge | Toast "Work order acknowledged" |
| 5.3 | Proof schedule (grouped per site) → Upload proof on "Installation (before)" with a JPG/PNG | "Awaiting verification" |
| 5.4 | Upload a .pdf renamed to .jpg | Rejected (file type is checked by content) |
| 5.5 | Try "Mark installed / live" before installation proof is verified | Clear error, status unchanged |
| 5.6 | Add listing → fill → add photo → Submit | Appears as "In review"; admin approves it in 4.7 |
| 5.7 | Upload the same photo on another listing | Duplicate / similarity flag for admin |
| 5.8 | Bank details → save | Only last 4 digits shown afterwards |
| 5.9 | Availability → block dates on a listing | Marketplace calendar shows those dates blocked |
| 5.10 | Bulk import CSV → download template → upload a file with one bad row | Every bad row listed, nothing imported |
| 5.11 | Payables | Shows pending → due after proof verified |
| 5.12 | vendor2@ | Cannot list / see vendor@'s work orders |

## 6. Finance (maker-checker)

| # | Step | Expected |
|---|------|----------|
| 6.1 | finance@ → Bookings → "Raise invoice" on a booking without invoice | `TXI-…` with advance amount |
| 6.2 | Record client payment → amount, UTR, date, **evidence file** → Record | `PAY-…` saved as **Unverified** |
| 6.3 | Record without evidence file | Not allowed |
| 6.4 | Same finance@ → Verification queue | Says another Finance user must verify — no Verify button |
| 6.5 | finance2@ → Verify | "Counted as received"; client sees the payment |
| 6.6 | Reject a payment (needs reason) | Status rejected; history kept, nothing deleted |
| 6.7 | Vendor payables → Bank details (logged) / Pay | Full bank number visible only to Finance |
| 6.8 | Reconciliation on a booking | Billed / received / refunded / balance match the invoice |

## 7. Growth Partner

| # | Step | Expected |
|---|------|----------|
| 7.1 | partner@ → Refer a new advertiser form → submit | Lead appears in partner list and in admin inbox (source partner) |
| 7.2 | Required fields empty | Validation errors |

## 8. Cross-checks

- [ ] Every page has a loading state, an empty state and a readable error (no blank white pages).
- [ ] Phone width (375 px): no sideways scrolling, buttons reachable, tables scroll inside their box.
- [ ] Amounts always in ₹ with Indian commas (₹4,88,166).
- [ ] IDs never change after creation, and every action appears in Admin → Reports → Audit search.
- [ ] Refresh the page in the middle of any flow — you stay signed in and the data is still there.

## How to report a bug

Title · role/account · page URL · steps · expected vs actual · screenshot · IDs on screen · browser + device.
