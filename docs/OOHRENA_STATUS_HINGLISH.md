# OOHRENA — Tool mein kya bana hai, kitna bana hai, kya baaki hai

*Simple Hinglish mein, taaki koi bhi (non-technical) samajh sake. Date: 23 Nov 2026.*

---

## 1. OOHRENA kya hai? (ek line mein)

**OOHRENA ek online bazaar hai outdoor aur digital advertising ke liye** — jaise hoardings, LED screens,
bus/auto branding, metro, mall ke andar ki screens. Brand yahan media dhoondhta hai, quote leta hai, booking karta hai,
aur sabse zaroori — **saboot (proof) dekhta hai ki uska ad sach mein laga.**

Tagline: **"Ab Advertising Sirf Dikhegi Nahi… Track Bhi Hogi!"**

### Ye kyun ban raha hai? (problem kya hai)

Aaj outdoor advertising mein aksar:
- Client ko pata nahi chalta ki hoarding **sach mein lagi ya nahi**, kitne din lagi rahi.
- Leads aur paise **WhatsApp/phone pe ghoomte** hain — koi record nahi, beech ke log kitna kha gaye pata nahi.
- Payment ka jhagda hota hai — kisne kitna diya, kab diya, saboot kahan hai.

OOHRENA ka asool hai **"Client Transparency First"** — har cheez ka digital record:
inquiry → quote → booking → kaam ka order → photo saboot → payment → report.

---

## 2. Ye kis document ke hisaab se bana?

Sirf ek document follow kiya gaya hai:
**`docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf`** (35 pages).

Usmein likha hai:
- **10 compulsory modules** (neeche list hai),
- **14 acceptance tests** (T-01 se T-14) — MVP tabhi "accept" hoga jab ye 14 tests **staging (test server) pe saboot ke saath** pass hon,
- **Trust rules** — jaise demo media ko kabhi "verified" nahi dikhana, "GPS verified" ya "Zero Lead Leakage" jaise jhoothe claim nahi karna,
- **Phase 2** ki cheezein (AI, dynamic pricing, mobile app, escrow) — **abhi nahi banani**.

---

## 3. Isko kaun-kaun use karta hai? (5 roles)

| Role | Kaun hai | Kya karta hai |
|------|----------|---------------|
| **Client** | Brand / agency | Media dhoondhta hai, inquiry bhejta hai, quote approve karta hai, proof aur report dekhta hai |
| **Vendor (Media Owner)** | Hoarding/screen ka maalik | Apni media list karta hai, KYC deta hai, work order leta hai, lagane ki photo upload karta hai |
| **Admin (OOHRENA team)** | Control tower | Har inquiry check karta hai, vendor assign karta hai, quote banata hai, photo verify karta hai |
| **Finance** | Accounts team | Invoice banata hai, payment record karta hai — **ek banda record kare, doosra verify kare** |
| **Growth Partner** | Referral partner | Naye clients refer karta hai, apni commission dekhta hai |

> **Super admin?** Document mein "super admin" naam ka alag role nahi hai. **Admin hi sabse upar wala role hai**
> (users banana, role badalna, suspend karna, system dekhna — sab admin karta hai).

---

## 4. Ek campaign ki kahani (step-by-step, jaisa tool mein chalta hai)

1. **Client** website kholta hai → "Browse verified media" → Mumbai ki ek hoarding pasand aati hai → dates daal ke **"Request quotation"**.
   → Usko turant **Lead ID** milti hai, jaise `LD-2026-000003`.
2. **Admin** ke inbox mein inquiry aati hai → "Start review" → sirf **KYC-approved vendor** ko assign kar sakta hai.
3. **Admin quote banata hai** — media ka rate, printing, installation, 5% platform fee, GST (CGST+SGST) — total server khud calculate karta hai. "Release to client".
4. **Client** quote dekhta hai → Approve / Reject / Changes maange (comment ke saath).
5. **Admin booking banata hai** (`BK-…`) → vendor ko **work order** (`WO-…`) jaata hai. Dates "booked" ho jaati hain — koi doosra wahi dates book nahi kar sakta.
6. **Vendor** work order acknowledge karta hai → hoarding laga ke **photo upload** karta hai (server ka time + location jaisi mili waisi likhi jaati hai).
7. **Admin photo verify** karta hai (ya reason ke saath reject). Verify hone ke baad hi **client ko photo dikhti hai**.
8. **Finance** invoice (`TXI-…`) banata hai → client ka payment **saboot (UTR/receipt) ke saath** record karta hai → **doosra Finance user verify karta hai**. Vendor ka payout bhi track hota hai.
9. **Client** campaign report **PDF/CSV** download karta hai — booking, proof, kharcha sab ek jagah.
10. Har step **audit log** mein — kisne, kab, kya badla.

---

## 5. Tool mein abhi kya-kya hai (module-wise)

| # | Module | Simple bhasha mein | Status |
|---|--------|-------------------|--------|
| 1 | Client Portal | Register/login, profile, media search, shortlist/compare, inquiry, quote approve, booking, payment, proof gallery, reports | ✅ Bana hai, chal raha hai |
| 2 | Vendor Portal | Vendor registration, KYC documents (encrypted), bank details (masked), listing + photos, CSV import, calendar, work orders, proof upload, payouts | ✅ Bana hai |
| 3 | Admin Control Tower | Dashboard, inquiry inbox, review/assign, quote builder, booking/work order, KYC & listing approval, proof verify, user management, system health | ✅ Bana hai |
| 4 | Media Marketplace | 9 media categories, unique Inventory ID, Draft → Pending → Approved, sirf approved media public | ✅ Bana hai |
| 5 | Location & Availability | City/locality/landmark/PIN/map/"Near me" search, date-wise calendar, 48-ghante hold, **double booking rokna** | ✅ Bana hai |
| 6 | Quotation & Booking | Quote versions (V1, V2…), GST, validity, cancellation fee, reschedule | ✅ Bana hai |
| 7 | Campaign Execution & Proof | Proof schedule (installation/weekly/end), photo/video proof, verify/reject, overdue alerts, issue tracker | ✅ Bana hai |
| 8 | Finance & Reconciliation | Tax invoice PDF, payments with evidence, **maker-checker**, vendor payables, refunds, credit notes, reconciliation | ✅ Bana hai |
| 9 | Reports, Notifications, Audit | Client report, vendor scorecard, funnel, revenue, exceptions, audit search + export, notification system | ✅ Bana hai (email/SMS bhejne ke liye account chahiye) |
| 10 | Security & System | Roles & permissions, lockout, rate limit, 2FA (API), password reset, privacy/terms pages, backups | 🟡 Mostly bana hai — 2FA ka screen baaki |

**Naya (aaj joda):** website kholte hi ab ek **landing page** aata hai (OOHRENA kya hai, kaise kaam karta hai, kiske liye hai).
Marketplace ab `/marketplace` pe hai. Andar ke pages seedhe nahi khulte — **login zaroori hai**.

---

## 6. Kitna bana hai? (approx %)

| Hissa | Kitna | Matlab |
|-------|-------|--------|
| **Features (10 modules ka kaam)** | **~90%** | Saare modules real backend pe chal rahe hain. Chhote UI gaps aur 2FA screen baaki. |
| **14 acceptance tests — local/automated** | **14/14 automated tests pass** (119 tests), 11 browser mein khud chala ke dekhe | Local pe poora flow chalta hai |
| **14 acceptance tests — staging pe saboot ke saath** | **0/14 abhi** | Live/staging setup poora nahi hua, isliye formal evidence nahi bana |
| **Launch readiness (live server, email, file storage, backups)** | **~60%** | Code ready hai, accounts/setting baaki |
| **Overall MVP** | **lagbhag 80–85%** | Banana lagbhag ho gaya; ab "live chalana + saboot dena" baaki |

*(Ye % ek honest estimate hai — document ke modules, 14 tests aur launch checklist ko dekh ke.)*

---

## 7. Kya baaki hai?

### 🔴 Launch se pehle zaroori
1. **Live deploy poora karna**
   - Vercel mein `API_PROXY_ORIGIN = https://oohrena-api.onrender.com` (+ `NITRO_PRESET=vercel`) daal ke redeploy.
   - Render mein `CORS_ORIGINS` aur `PUBLIC_WEB_URL` = Vercel link.
   - Live database mein test accounts + demo data (`seed:staging`).
   - Aaj ke fixes wali branch ko `main` mein merge (Render/Vercel `main` se deploy karte hain).
2. **File storage (S3 / Cloudflare R2)** — code ready hai, sirf bucket ke credentials Render mein daalne hain.
   Iske bina Render redeploy pe **photos, proof aur KYC files gayab** ho jaayengi.
3. **Email (SMTP)** — password reset, Lead ID notification, invite emails ke liye. Account chahiye (SES / Zoho / SendGrid).
4. **14 acceptance tests staging pe** chala ke screenshots/logs ka evidence banana + **ek baar backup restore** karke dikhana (T-14).
5. **Security**: Atlas password badalna (screenshot mein aa gaya tha), Atlas mein `0.0.0.0/0` hata ke sirf Render IPs, live pe admin/finance ke liye 2FA.

### 🟡 Jald karna chahiye
6. **2FA screens** — login pe QR code se enrol karna, profile mein on/off.
7. **SMS provider** (mobile OTP) — DLT registered sender (MSG91/Gupshup/Twilio).
8. **Web ke 37 purane TypeScript errors** — kuch se screen pe galat/khaali values dikhti hain (jaise System Health ki kuch rows).
9. **Chhoti UX baatein**: ek section fail ho to poora page blank na ho; work order acknowledge ke baad "Acknowledged" dikhe;
   do-shehar wali inquiry mein dono shehar dikhen; naye vendor ka score "N/A" dikhe.
10. **Demo data** mein vendor ke KYC docs/bank aur client ka GSTIN/address bharna, taaki demo poora lage.

### ⚪ Business owner ka kaam (developer nahi kar sakta)
11. **Ownership confirmation** sign karna (domain, hosting, repo, database, backups company ke naam).
12. **Growth Partner commission rule** confirm karna (kitna % aur kab).
13. Accountant se **SAC code / IGST rules** confirm karna.
14. Privacy/Terms ka final legal text.

---

## 8. Extra suggestions (document ke bahar, lekin kaam ke)

*Ye Phase 2 nahi hain — chhote, sasti cheezein jo trust aur demo dono better karengi.*

| Suggestion | Kyun |
|-----------|------|
| **Asli hoarding photos** demo/staging mein | Abhi illustrated placeholder photos hain |
| **FAQ / "How it works" help page** + chhota demo video | Naye client/vendor ko samjhane mein aasaan |
| **Branded email templates** (logo, Hindi+English) | Professional lagta hai |
| **Uptime monitoring** (UptimeRobot free) + Render paid plan | Free plan pe server so jaata hai, pehla page dheere khulta hai |
| **WhatsApp notifications** (doc mein channel hai) | India mein email se zyada padhe jaate hain |
| **Playwright browser tests** | Har release pe manual testing ki zaroorat kam |
| **Vendor ke liye mobile-friendly proof upload** (website hi, app nahi) | Field team phone se photo daalti hai |

**Mat banao abhi (Phase 2):** AI recommendations, dynamic pricing, native mobile app, payment escrow/splitting, social ads.

---

## 9. Test kaise karein? (login details)

- Local: `npm run dev:api:memory`, `npm run dev:web`, phir `npm run seed:demo -w @oohrena/api` → http://localhost:8080
- Accounts (sabka password **same** hai = `apps/api/.env` file mein `SEED_PASSWORD`):

| Role | Email |
|------|-------|
| **Admin (sabse upar)** | admin@test.oohrena.local |
| Finance (maker) / Finance (checker) | finance@test.oohrena.local / finance2@test.oohrena.local |
| Client A / Client B | client@test.oohrena.local / client2@test.oohrena.local |
| Vendor A (KYC approved) / Vendor B (KYC pending) | vendor@test.oohrena.local / vendor2@test.oohrena.local |
| Growth Partner | partner@test.oohrena.local |

> Password kabhi chat, email ya document mein mat likho. Live (production) ke liye asli admin
> `npm run create-staff -w @oohrena/api` se apne strong password ke saath banao, aur 2FA on karo.

Poora manual testing checklist: **`docs/MANUAL_TEST_PLAN.md`**.

---

## 10. Safety — humne kya check kiya (23 Nov 2026)

- **Pages:** sirf ye bina login khulte hain — landing (`/`), marketplace, login, register, forgot/reset password, privacy, terms, confidentiality.
  Baaki **har page** (admin, client, vendor, finance, partner, reports, print, ya koi naya/anjaan page) **login maangta hai**,
  aur galat role wale ko "ye workspace aapke liye nahi hai" dikhta hai.
- **API (asli suraksha yahan hai):** 139 API routes ko bina login call kiya — sirf 4 public mile, aur woh public hi hone chahiye:
  health check, media categories, media search, approved media list. Inmein **vendor ka naam, vendor rate, phone/email kuch nahi** jaata.
- Client A, Client B ka data nahi dekh sakta (404). Galat role → 403. Login pe rate limit aur lockout chal raha hai.
- Ek hi Finance user apni payment khud verify nahi kar sakta.
