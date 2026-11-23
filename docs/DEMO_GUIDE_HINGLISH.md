# OOHRENA — Client demo guide (Hinglish)

*Aaj ke demo ke liye: kya chalana hai, kis order mein dikhana hai, kaunse login, aur launch kab tak.*
Poori detail (kya bana, kitna %, kya baaki) → `docs/OOHRENA_STATUS_HINGLISH.md`.

---

## 1. Demo shuru karne se pehle (5 minute)

Teen terminal / commands, repo ke root folder se:

```powershell
npm run dev:api:memory
```
```powershell
npm run dev:web
```
API chalne ke ~20 second baad, data daalo:
```powershell
npm run seed:demo -w @oohrena/api
```
Browser mein kholo: **http://localhost:8080**

> ⚠️ Demo ke beech terminal / Claude app band mat karna — data memory mein hai, server band = data gaya.
> Dobara chalana pade to upar ki teeno commands phir se.
>
> 💡 Tip: har role ke liye **alag browser window (incognito / alag profile)** kholo — ek mein client, ek mein admin.
> Ek hi window mein role badalna ho to account menu (upar right) → Sign out → doosra login.

---

## 2. Login — har user type

**Sabka password ek hi hai** = `apps/api/.env` file mein `SEED_PASSWORD=` ke aage wala.
(Password chat/email/screen-share pe mat dikhana; demo se pehle khud login kar ke rakh lo.)

| User type | Email | Demo mein kya dikhayega |
|-----------|-------|-------------------------|
| **Admin** (sabse upar wala role) | `admin@test.oohrena.local` | Control tower, inquiry inbox, quote banana, KYC approve, proof verify, users, reports |
| **Client A** (brand) | `client@test.oohrena.local` | Company profile, 3 inquiries, approved quote, booking, invoice, verified proof photo |
| **Client B** (doosra brand) | `client2@test.oohrena.local` | Ek quote **approve karne ke liye wait** kar raha hai (LED screen) |
| **Vendor A** (media owner, KYC approved) | `vendor@test.oohrena.local` | 9 listings, KYC docs, bank (masked), work order, proof upload, payables |
| **Vendor B** (KYC pending) | `vendor2@test.oohrena.local` | KYC documents upload kiye hain, admin approval ka wait |
| **Finance** (maker) | `finance@test.oohrena.local` | Invoice, payment record, reconciliation |
| **Finance 2** (checker) | `finance2@test.oohrena.local` | Doosre ka record kiya payment verify karna |
| **Growth Partner** | `partner@test.oohrena.local` | Referral form, apne leads, commission |

> "Super admin" alag role nahi hai — **Admin hi top role** hai (document ke hisaab se 5 roles: Client, Vendor, Admin, Finance, Growth Partner).

---

## 3. Demo mein kya data pehle se bhara hai

| Cheez | Data |
|-------|------|
| **Media (9 verified listings, 9 shehar)** | Gwalior hoarding, Mumbai highway gantry, Gurugram Cyber Hub, Bengaluru MG Road metro, **Delhi CP LED screen**, **Indore unipole**, **Pune bus branding (25 buses)**, **Noida mall digital standees**, **Lucknow mobile LED van** |
| **LD-2026-000001** (Client A) | Poora chain: quote ₹4,88,166 → booking BK-2026-000001 → work order (vendor ne acknowledge kiya) → Gwalior ki installation photo **verified** (client ko dikhti hai) → Mumbai ki photo **admin queue mein** → invoice → ₹2,44,083 advance **verified** |
| **LD-2026-000002** (Client A) | **New** — admin inbox mein, demo mein live review/assign/quote kar sakte ho |
| **LD-2026-000003** (Client B) | Quote **released**, client ke approve/reject ka wait |
| **LD-2026-000004** (Client A) | Admin **review kar raha** hai (Pune buses + Noida mall) |
| **Growth partner lead** | "Sharma Sweets" referral, admin inbox mein source = growth partner |
| **Vendor B** | PAN, GST, address proof uploaded — **KYC approve karne ka demo** |
| Client A profile | GSTIN, billing address (BKC Mumbai), contact person |
| Vendor A bank | HDFC, sirf last 4 digit dikhte hain |

*Photos abhi illustrated placeholder hain (asli site photos nahi) — client ko bata dena.*

---

## 4. Demo ka order (15–20 minute ki kahani)

**Shuruaat — problem batao (1 min):** "Outdoor ads mein client ko pata nahi chalta ad laga ya nahi, leads aur paise WhatsApp pe ghoomte hain.
OOHRENA mein har step ka record hai — Lead ID se le kar proof aur payment tak."

1. **Landing page** (http://localhost:8080) — tagline, "How it works", kiske liye hai, transparency promise.
2. **Marketplace** → "Browse verified media" → city/PIN search, category chips (LED, bus, mall…), **Map view**, ek listing kholo → availability calendar, "Verified by OOHRENA".
3. **Client A login** → "My workspace":
   - Company profile, inquiries (alag-alag status), quote (itemised + GST), booking, invoice + verified payment.
   - Booking → **"Proof & updates"** → verified photo with *server time* + *"location captured by device · X m from site"* (sach jaisa, "GPS verified" ka jhootha claim nahi).
   - Campaign report **PDF** download.
4. **Admin login** → Control tower:
   - Top numbers, **Inquiry inbox** → `LD-2026-000002` kholo → *Start review* → *Assign Test Vendor A* → *Build quotation* → production/installation daalo → *Save draft* → **Approve pricing & release to client**. (Server khud total + GST nikalta hai.)
   - **Proof verification** tab → Mumbai ki photo → *Verify*.
   - **Vendor KYC & Listings** → Vendor B ke documents → *Approve KYC* (reject karoge to reason zaroori).
   - **Reports & activity** → Funnel, Revenue, Audit log (har action: kisne, kab, kya).
5. **Client B login** → quote `QT-2026-000002-V1` → *Review & decide* → **Approve**.
6. **Vendor A login** → work order "Acknowledged", proof schedule (site-wise), listings, payables.
7. **Finance login** → Bookings → *Record client payment* (evidence file zaroori) → same user **verify nahi kar sakta** → **Finance 2** se verify. ("Maker-checker" — paise ka galat entry ek banda nahi kar sakta.)
8. **Partner login** → referral form + apne leads.
9. **Phone pe** (ya browser chhota kar ke) — sab mobile pe bhi chalta hai.

**End (1 min):** "Ye MVP ke 10 modules hain, requirement document ke hisaab se. Live server pe daalna aur launch checklist baaki hai."

---

## 5. Client poochhe to — honest jawab

| Sawaal | Jawab |
|--------|-------|
| Ye live hai? | Abhi local demo. Live server (Vercel + Render + MongoDB Atlas) set ho raha hai. |
| Photos asli hain? | Nahi, demo placeholder. Asli vendors apni site photos upload karenge. |
| GPS proof? | Photo ke saath device ki location aur site se doori dikhti hai — jaisi mili, waisi. Hum "GPS verified" ka claim nahi karte. |
| Email / SMS aata hai? | System bana hai; email/SMS account (SMTP, DLT SMS) lagna baaki hai. |
| Online payment? | MVP mein payment UTR/receipt ke saath record hota hai aur Finance verify karta hai. Payment gateway / escrow Phase 2 hai. |
| Mobile app? | Website phone pe chalti hai. Native app Phase 2. |

---

## 6. Launch kab tak ready? (honest estimate)

| Stage | Kya chahiye | Kitna time* |
|-------|-------------|-------------|
| **A. Live demo link** (staging, client khud khol sake) | Vercel/Render settings poori, live DB mein data, file storage (S3/R2) bucket, aaj ke fixes `main` mein merge | **1–2 din** |
| **B. Pilot launch** (kuch asli vendors + clients, chhota scale) | Email (SMTP), 2FA screens, 37 purane TypeScript errors fix, 14 acceptance tests staging pe saboot ke saath, backup restore test, asli admin/finance accounts, Atlas security | **2–3 hafte** |
| **C. Public launch** | SMS (DLT registration ~1–2 hafte lagta hai), legal privacy/terms text, ownership confirmation sign, asli inventory onboarding + photos, monitoring, Render paid plan | **4–6 hafte** |

\* Ye time tab hai jab business side se ye cheezein time pe mil jaayein: hosting/S3/email/SMS accounts, legal text,
partner commission rule, accountant se GST/SAC confirmation. Inme delay = launch mein delay.

**Short answer:** client ko dikhane laayak **aaj ready** hai (local). **Live link 1–2 din** mein. **Asli launch ~1 se 1.5 mahine** mein, agar upar ki business cheezein time pe mil jaayein.
