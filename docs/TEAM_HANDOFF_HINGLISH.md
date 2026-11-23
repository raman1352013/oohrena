# OOHRENA — Team handoff: kya sahi bana, kya baaki hai (honest audit)

*Date: 23 Nov 2026. Base: `docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf` (sirf yahi requirement source hai).*
Live: https://oohrena-kappa.vercel.app (web, Vercel) → https://oohrena-api.onrender.com (API, Render) → MongoDB Atlas.

---

## 1. Kaise check kiya

- **122 automated tests** (API + web + shared) — sab pass. Inmein document ke 14 acceptance tests (T-01…T-14) ke liye tests hain, positive + negative (galat role → 403, doosre ka ID → 404, reason missing → 400, galat status jump → 409).
- **Browser mein poora flow khud chalaya** (local + live): client inquiry → admin review/assign/quote → client approve → booking + work order → vendor acknowledge + proof upload → admin verify → finance invoice + payment → doosre finance user ne verify → client report PDF/CSV.
- **Security sweep:** 139 API routes bina login call kiye — sirf 4 public (health, categories, search, approved listings), unmein vendor naam/rate/contact nahi. Bina login koi andar ka page nahi khulta.

## 2. Module-wise status (document §7 ke labels mein)

| # | Module | Status | Kya missing / dhyan |
|---|--------|--------|---------------------|
| 1 | Client Portal | **WORKING** | Mobile OTP ke liye SMS provider nahi (DLT); email verification email SMTP ke bina nahi jaata |
| 2 | Vendor Portal | **WORKING** | — |
| 3 | Central Admin Control Tower | **WORKING** | System Health tab ki kuch rows TypeScript errors ki wajah se khaali dikh sakti hain |
| 4 | Unified Media Inventory | **WORKING** | — |
| 5 | Location & Availability | **WORKING** | — |
| 6 | Quotation & Booking | **WORKING** | IGST/SAC code accountant se confirm karna |
| 7 | Execution & Proof | **WORKING** | Live pe files Render disk pe — redeploy pe mit jaati hain (neeche #1) |
| 8 | Finance & Reconciliation | **WORKING** | — |
| 9 | Reporting, Notifications, Audit | **PARTIALLY WORKING** | Notifications sirf log mein; email (SMTP) / SMS / WhatsApp provider jodna baaki |
| 10 | Security, Roles, Privacy, System | **PARTIALLY WORKING** | 2FA API bana hai, **2FA ka screen (QR enrol + settings) baaki**; backup restore staging pe chala ke saboot nahi |

**Acceptance (document §4):** 14/14 automated tests pass. **Staging pe saboot ke saath (screenshots/logs) abhi formally record nahi hua** — document kehta hai MVP tabhi accept hoga.

## 3. Bacha hua kaam — team ke liye (priority order)

| # | Kaam | Kyun zaroori | Kaun | Andaaza |
|---|------|--------------|------|---------|
| 1 | **File storage: Cloudflare R2 / AWS S3** — Render env mein `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Code ready hai. | Abhi photos/proof/KYC Render disk pe — har redeploy/restart pe gayab | DevOps + owner (account) | 0.5 din |
| 2 | **`DATA_ENCRYPTION_KEY`** Render aur local seeding dono mein same; `CORS_ORIGINS` = `https://oohrena-kappa.vercel.app` (bina `/` ke, ab code dono chalata hai) | Encrypted files/bank details ek jagah se doosri jagah padhe ja sakein | DevOps | 1 ghanta |
| 3 | **Email (SMTP)** — `SMTP_URL`, `MAIL_FROM` | Password reset, Lead ID/quote/booking alerts, staff invite | Owner (account) + dev | 0.5 din |
| 4 | **2FA screens** — login pe QR enrol (`2FA_SETUP_REQUIRED`), profile mein on/off; phir `REQUIRE_2FA_PRIVILEGED=true` | Admin/Finance accounts ki suraksha (document Module 10) | Frontend dev | 1–2 din |
| 5 | **Web ke 37 TypeScript errors** fix + `apps/web/package.json` mein `"typecheck"` script | Kuch screens pe galat/khaali values (System Health, User Management) | Frontend dev | 1 din |
| 6 | **14 acceptance tests staging pe** chala ke evidence (screenshot + API response + audit log) `docs/COMPLETION_REPORT.md` mein | Document ki acceptance condition | QA (`docs/MANUAL_TEST_PLAN.md` use karo) | 2–3 din |
| 7 | **Backup + restore** staging pe ek baar (`apps/api/scripts/backup-restore.ts`) — T-14 | Document T-14 | DevOps | 0.5 din |
| 8 | **SMS provider** (MSG91/Gupshup/Twilio, DLT registered) | Mobile OTP | Owner (DLT 1–2 hafte) + dev | 0.5 din dev |
| 9 | **Asli admin/finance accounts** (`npm run create-staff -w @oohrena/api`), test accounts production mein nahi | Production safety | Owner + DevOps | 1 ghanta |
| 10 | **Security:** Atlas password rotate (screenshot mein aaya tha), Atlas Network Access `0.0.0.0/0` hatao | Data suraksha | DevOps | 1 ghanta |
| 11 | Render paid plan (free pe 15 min baad server so jaata hai) + uptime monitor | Pehla page dheere, demo mein kharab impression | Owner | — |
| 12a | **Work order pe creative files** (artwork upload/download) — abhi sirf instructions ka text hai | Module 7: "Work Order with … creative files" | Full-stack dev | 1 din |
| 12b | **Campaign monitoring board** — saare live campaigns ek screen pe (proof status, overdue) — abhi Bookings tab + Proof queue alag hain | Module 3 | Frontend dev | 1 din |
| 12c | **Admin IP/session controls** (allowed IPs, session list already hai) | Module 3 | Backend dev | 0.5 din |
| 12d | **Backups scheduled + off-site** (Atlas paid tier backups ya cron + S3 pe `mongodump`); script hai, schedule nahi | Module 10 | DevOps | 0.5 din |
| 12 | Owner ke decisions: partner commission rule, privacy/terms legal text, ownership confirmation sign | Document §6, Module 10 | Owner | — |

## 4. Document ke BAHAR wali cheezein (posters vs MVP)

Marketing posters mein ye bhi dikhaya gaya hai — **ye MVP document mein nahi hain / Phase 2 hain, abhi bane nahi hain:**

- "Phase 2 – Growth OS": Lead management CRM, marketing automation, follow-ups, advanced analytics, business growth
- "Digital Ads (Meta / Google / More)", automated social media ads
- "Real-Time Tracking & Analytics", "Booster OS (Real-Time Engine)"

⚠️ Document ka **Trust Rule 4**: *"GPS proof, real-time availability and retargeting claims must be supported by actual working technology."*
Client meeting mein ye cheezein **"aane wala Phase 2"** bol ke dikhao, **"abhi chal raha hai" nahi.**
Aur **Trust Rule 2**: unverified stats (jaise "500+ locations, 850+ bookings") publish nahi karne — jab tak asli data na ho.

## 5. Kaam karne ke rules (team ke liye)

- Pehle `AGENTS.md` padho. Har endpoint: role check + object-level check, zod validation, server-side money maths, audit log, transition tables.
- Har feature ke saath API tests (negative cases bhi). `npm test`, typecheck, `npm run build -w @oohrena/web` pass hone chahiye.
- `main` pe push = Render + Vercel auto-deploy. **Jab tak S3/R2 nahi lagta, har deploy ke baad photos mitengi** — demo data reset: `apps/api/scripts/reset-demo-db.ts` → `npm run seed:api` → `seed:demo` with `API_URL`.
